# Inventário inicial de armazenamento para demonstrações isoladas

## Escopo e segurança

Inventário estático do código em `examples/app/src/lib`, rotas de API, migrações e armazenamento já identificado. Não foram lidos conteúdos de arquivos locais de empresas/trabalhadores/PDFs, nem executadas migrações, exclusões ou mudanças no banco. O inventário não certifica isolamento completo e não autoriza emissão de links nem expurgo.

O diretório de trabalho contém muitos subdiretórios e arquivos de teste além do armazenamento regular, e já há arquivos PDF no caminho local de uploads. Tratar todo o conteúdo existente como potencialmente sensível: não mover, abrir, exportar, limpar ou reaproveitar como demonstração.

## Persistência local identificada

| Domínio | Caminho / implementação | Separação atual | Situação para expurgo por tenant |
|---|---|---|---|
| Empresas/unidades | `data/clients.json` (`client-store.ts`) | Um arquivo compartilhado; consultas filtram tenant | Não é seguro remover fisicamente só por tenant. Há store PostgreSQL (`client-postgres-store.ts`) e migração `0004`; a prova em PostgreSQL temporário confirmou o isolamento das tabelas e operações cobertas, mas o seletor runtime fica fechado em JSON |
| Trabalhadores | `data/workers.json` (`worker-store.ts`) | Um arquivo compartilhado; registros incluem tenant | Não é seguro remover fisicamente só por tenant |
| Documentos | `data/documents.json` e `data/document-files/<tenant>/` (`document-store.ts`) | Metadados compartilhados; PDFs em diretório por tenant | Parcial; metadados e órfãos ainda exigem inventário/consistência |
| ASO | `data/aso.json` (`aso-store.ts`) | Um arquivo compartilhado; contém conteúdo médico demonstrativo | Bloqueado; requer migração e regra de retenção aprovada antes de uso real |
| PCMSO | `data/pcmso.json` (`pcmso-store.ts`) | Um arquivo compartilhado | Não é seguro remover fisicamente só por tenant |
| EPI/estoque | `data/epi.json`, `data/epi-stock.json` (`epi-store.ts`, `epi-stock-store.ts`) | Arquivos compartilhados; registros filtrados por tenant | Não é seguro remover fisicamente só por tenant |
| Anexos de estoque EPI | `data/epi-stock-documents/` e legado `data/epi-invoices/` | Diretórios compartilhados; IDs de arquivos vinculados a movimentos | Sem índice tenant-scoped próprio no sistema de arquivos |
| Operações e segurança | `data/operations.json`, `data/safety-operations.json`, `data/nonconformities.json` | Arquivos compartilhados | Não é seguro remover fisicamente só por tenant |
| Terceiros | `data/third-party.json` e `data/third-party-files/<tenant>/` | Metadados compartilhados; arquivos separados por tenant | Parcial; metadados e objetos órfãos impedem expurgo comprovável |
| PGR e revisões | `data/pgr-drafts.json`; diretórios `pgr-working`, `pgr-item-reviews`, `pgr-contractor-annexes`, `pgr-digitalization` | Arquivos mistos; alguns diretórios particionados por tenant | Parcial; falta registro único de objetos e reconciliação de órfãos |
| Regras/revisões de referência | `data/compliance.json`, `data/reference-reviews.json` | Regras em arquivo compartilhado; revisões também compartilhadas | Não é seguro remover fisicamente só por tenant |
| PT/PTE | `data/work-permit-drafts.json` | Arquivo compartilhado | Não é seguro remover fisicamente só por tenant |
| Plataforma e billing | `data/platform.json`, `data/billing.json` | Estado global com múltiplos tenants e decisões de plataforma | Deve permanecer fora do expurgo de tenant de demonstração |
| Auditoria | `data/audit-log.jsonl` | Arquivo global com eventos de tenant e plataforma | Não apagar por tenant; política de retenção precisa preservar eventos e decidir pseudonimização |
| CMS/site | `data/site-content.json` / armazenamento PostgreSQL do CMS | Conteúdo global, não pertence a um tenant de teste | Fora do ciclo de expurgo do tenant |
| Filas/simulações/integradores | `integration-sandbox.json`, `job-sandbox.json`, `otp-sandbox.json`, `operations-governance.json`, `asaas-inbox/` | Arquivos/diretórios globais ou compartilhados; vínculo varia por store | Bloqueado até separar estado transitório de plataforma e dados do tenant |
| Importação de PGR | Antigo `uploads/pgr-import/`; agora o endpoint processa bytes da requisição | Antes gravava PDF em pasta compartilhada sem tenant; fluxo atualizado não cria novos arquivos | Novas importações ficam somente em memória; arquivos legados foram preservados e não são removidos |
| Importação de trabalhadores | Rota `api/workers/import-pdf` | Parser recebe bytes e não persiste o PDF no fluxo atual | Sem novo arquivo persistente no caminho da rota |

## PostgreSQL existente

Há tabelas candidates com escopo de tenant/RLS para o registro de tenants/membros (`0001`), empresas (`0004`), inventário PGR (`0005`/`0006`), PCMSO (`0007`), snapshots de terceiros (`0008`), gate de terceiros (`0009`) e rascunhos PT/PTE (`0011`/`0012`). CMS (`0002`/`0003`) é global. A existência de tabela e RLS não significa que o respectivo módulo use PostgreSQL: por exemplo, `client-service.ts` ainda mantém seleção entre JSON e PostgreSQL, e os demais stores observados continuam em arquivos locais.

A migração candidata do ciclo de trial (`0013_demo_trial_lifecycle.sql`) passou por aplicação e exercício em PostgreSQL temporário junto à `0001`: RLS forçada, papel runtime sem privilégios de tabela, visibilidade de leitura por Master/tenant em papel de teste isolado, negação de escrita de convite fora do Master e de trial/auditoria fora do tenant, transições de convite/trial, concorrência de ativação/extensão e auditoria append-only. A prova corrigiu uma policy duplicada, e o container temporário foi removido. A migration continua não aplicada ao banco persistente, não provisiona contas/dados nem conecta ativação, cobrança, expiração server-side ou expurgo. Nenhuma tabela atual constitui catálogo completo de objetos físicos por tenant para expurgo verificável.

O cadastro de empresas/unidades tem store operacional, provas unitárias transacionais e verificação executada com sucesso em container PostgreSQL temporário: migrações `0001`/`0004`, leitura isolada, negação de escrita cruzada, arquivamento e auditoria sob o papel runtime. O container foi removido após o teste. Também foi provado em PostgreSQL temporário o helper de paridade entre sessão e membership sob RLS, incluindo suspensão, divergência e contexto ausente; isso não troca o modo ativo do cadastro nem importa o JSON existente. O login ainda autentica somente contas de demonstração configuradas e o guard global consulta vínculos fictícios estáticos; não há fonte de identidade dinâmica nem fluxo de ativação de convite.

## Bloqueios antes de ativar links ou expurgo

1. Migrar os stores de domínio para persistência server-side com RLS, chaves compostas de tenant e trilhas compatíveis; garantir que a conta dinâmica seja resolvida no servidor, não por tenant enviado pelo navegador.
2. Particionar todos os arquivos/anexos por tenant e manter um registro de objetos que permita provar integridade entre metadados e objetos físicos; incluir uploads, versões, arquivos órfãos e falhas parciais.
3. Preservar dados locais existentes durante a migração, sem classificação automática como fictícios.
4. Definir o que acontece com auditoria e dados de plataforma quando o tenant expira. Pagamento não é atualmente uma fonte comercial verificada.
5. Criar rotina dry-run e testes isolados com dados sintéticos; comprovar idempotência, escopo exato e preservação de tenants vizinhos e registros de plataforma antes de qualquer operação destrutiva.
6. Escolher e configurar o provedor de hospedagem antes de emitir links externos.

## Alteração segura nesta etapa

O endpoint de importação de PGR agora extrai o PDF diretamente do buffer recebido e responde sem cache. Isso remove a gravação local para novas importações. A alteração não varre nem apaga arquivos legados do diretório de uploads; eles continuam fora de qualquer limpeza automatizada até um processo explícito e verificado.
