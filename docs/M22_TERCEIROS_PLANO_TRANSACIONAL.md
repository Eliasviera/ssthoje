# M22 — Plano de persistência transacional de Terceiros

Data: 2026-10-15. Estado: desenho técnico, sem migration, importação ou alteração da fonte ativa.

## Primeira implementação disponível

`examples/app/scripts/third-party-migration-dry-run.mjs` executa a análise estrutural por `thirdparty:migration:dry-run` (usar o loader Node indicado no package.json). Não aceita argumentos: inclusive `--apply` é rejeitado antes da leitura. Não conecta ao banco, não grava e não importa o store ativo.

Implementado: contagens, hashes das quatro fontes, comparação dos bytes antes/depois da análise, duplicidades por tenant, referências de empresa/unidade, recibos/substituições com mesmo escopo e detecção de ciclos, referências básicas de pendências/eventos, contagem de revisão, datas de validade e períodos, referências de aprovações/agendas e identidade básica da auditoria do domínio. Ausências legadas são avisos. A saída não inclui IDs nem conteúdo privado.

Limites explícitos: não é um validador completo do contrato. Conferência dos bytes/caminhos de PDF, referências de compliance/alvos de auditoria, transições completas de pendência e vínculo inverso recibo-pendência continuam pendentes. `importReady` é sempre `false`. Comparação de hashes detecta mudanças observáveis entre duas leituras, mas não substitui snapshot consistente nem lock e não impede alteração que volte aos bytes anteriores entre leituras. Para futura importação, exigir origem congelada/snapshot e todas as verificações restantes.

Execução local em 2026-10-15: fontes estáveis nas duas leituras; 1 convite, 2 recebimentos, 1 pendência, 4 eventos de pendência, 0 aprovações/agendas e 6932 eventos de auditoria do domínio. Zero bloqueios estruturais nesta versão; avisos: escopo legado ausente (1), validade ausente (2), prazo de correção legado ausente (1). Não preencher os campos automaticamente. Sete testes sintéticos, TypeScript e ESLint focado passaram. PDFs não foram abertos ou validados.

## Problema observado

`third-party-store.ts` mantém convites, recebimentos, pendências, decisões e agendas em `third-party.json`. Gravação por rename protege a substituição do arquivo, mas não serializa processos concorrentes. A auditoria é gravada separadamente. O bloqueio de integração lê também empresas/requisitos e critérios/avaliações de outros arquivos; a checagem e a decisão não constituem uma transação conjunta.

`third-party-service.ts` hoje reexporta funções síncronas do store. A migração exige adaptar os chamadores para operações assíncronas; não basta trocar uma variável de ambiente.

## Primeira entrega implementável

Preparar um analisador de origem somente leitura, sem conexão ao PostgreSQL e sem opção de aplicação. Ler convites, auditoria, clientes e compliance; produzir somente contagens, hashes e códigos de inconsistência. Não imprimir hashes de tokens, nomes, CNPJs, justificativas, evidências, nomes de arquivo ou conteúdo dos PDFs.

Validar IDs duplicados por consultoria, referências de empresa/unidade, recibos e suas substituições, vínculos de pendência, sequência de revisões/eventos, datas civis e referências de decisões/agendas. Examinar referências documentais entre convites do mesmo escopo, pois a versão atual pode vir de outro convite. Ausência de escopo, validade ou prazo em registros legados deve ser reportada e preservada, sem preenchimento por inferência. Recebimento histórico anterior a uma revogação não é inconsistência por si só.

Verificar existência, tamanho e SHA-256 dos PDFs em etapa separada, recusando caminhos fora da raiz e links simbólicos; nunca executar ou interpretar instruções do PDF. Origem alterada durante a leitura invalida o relatório: exigir estabilidade dos hashes antes e depois ou executar contra snapshot consistente. Não tratar relatório instável como pronto para importar.

## Modelo proposto para revisão

Atualização do modelo de leitura, 2026-10-15: candidato `schemas/third-party-postgres-read-model.sql` fora do runner de migrations. Sete tabelas de snapshots imutáveis separam convites, recibos, pendências, eventos, aprovações, agendas e auditoria. Colunas de identidade/parentesco têm chaves compostas por tenant, inclusive empresa/unidade, recibos de pendência, eventos e aprovação da agenda. Payloads preservam conteúdo original, com arrays reconstruídos por `source_order`. CHECK de identidade usa `IS TRUE` para não aceitar chave ausente via NULL. RLS habilitada/forçada nas sete tabelas; papel de aplicação recebe somente SELECT. Triggers recusam UPDATE/DELETE/TRUNCATE.

`third-party-postgres-read-operations.ts` lê snapshots no tenant parametrizado, recusa linhas de outro tenant/identidades divergentes/filhos órfãos/campos fora do contrato e retorna projeção explícita sem tokenHash/storageName. Wrapper server-only `third-party-postgres-read-store.ts` exige thirdparty.read e usa withCurrentTenantReadTransaction (sessão no servidor, BEGIN READ ONLY). Nenhum serviço/seletor/página ativo importa o candidato. Não resolve portal público, não executa gate de decisão e não registra decisões/agendas.

Prova real `thirdparty:db:verify-read-isolated`: PostgreSQL 17 descartável, migrations pré-requisito 0001/0004/0005 somente nele, schema candidato aplicado apenas nele, fixtures fictícias em duas consultorias com os mesmos IDs. Verificados FKs, CHECK de identidade ausente, imutabilidade de linhas/TRUNCATE, ausência de linhas sem contexto, isolamento nas sete tabelas, negação de INSERT ao papel runtime e projeção pelo adaptador. Container removido ao final. Testes conjuntos 47/47; TypeScript/ESLint focados aprovados.

Limites: é modelo de snapshots para leitura/importação, não schema operacional de escrita. Relações em payload (substituições, vínculos inversos, critérios e fingerprint) continuam dependendo do analisador/importador futuro. Não há importador, reconciliação PostgreSQL nem corte de fonte. Preparar manifesto/idempotência e reconciliador read-only antes de qualquer aplicação persistente; resolver atomicidade com clientes/compliance antes de decisões/agendas. Ausência vs array vazio no documento de origem ainda deverá ser preservada no manifesto de importação; o adaptador retorna projeções com arrays.

Atualização dos recortes auxiliares, 2026-10-15: `third-party-auxiliary-contract.mjs` valida campos consumidos de empresas/unidades referenciadas, requisitos de terceiros, critérios dos tenants participantes ou referenciados pelas avaliações, avaliações explicitamente de contratadas, documentos internos referenciados como evidência e envelope da auditoria de Terceiros. Verifica formatos, tipos, enums, datas reais, períodos de critérios, referência de versão anterior no mesmo tenant/tipo e duplicidade de unidade. Campos não usados de outros domínios não são migrados nem rejeitados por suposição. Identidades/coleções corrompidas que impedem determinar o recorte são bloqueadas.

Auditoria do domínio exige papel conhecido, timestamp válido e campos conhecidos; eventos de outros domínios não são importados por este contrato. CNPJ é formato, sem validação jurídica. Critérios substituídos e empresas/documentos arquivados continuam válidos como histórico. Não se exige vigência atual para preservar avaliação histórica. CLI informa `auxiliaryContractVersion: 1` e incorpora os bloqueios. Testes combinados 42/42, TypeScript e ESLint focados aprovados; análise local estável sem bloqueios, com os mesmos avisos e 2/2 PDFs verificados. Os recortes não equivalem à validação integral ou migração das fontes auxiliares.

Próximo desenho: schema/adaptador de Terceiros ainda desconectados do runtime, com prova em banco descartável. Dependências transacionais de clientes/compliance continuam impedindo habilitar decisões/agendas no novo adaptador por simples troca de persistência. Nenhum schema foi criado/aplicado nesta fatia. Conferência física de evidências internas segue condicional à existência dessas referências; na origem atual há zero.

Atualização do contrato, 2026-10-15: `third-party-source-contract.mjs` define a versão 1 do contrato decodificado de `third-party.json`, incluindo todos os campos atuais de convites, recibos, pendências, eventos, períodos, aprovações e agendas. Verifica campos obrigatórios/opcionais, tipos, enums, limites operacionais atuais, datas civis reais e timestamps ISO. Campo desconhecido bloqueia em vez de ser removido; relatório agrega apenas códigos fixos/contagens. Nenhum valor é normalizado, truncado ou preenchido. CNPJ é validado apenas no formato, sem autenticação. Não é regra de conformidade normativa.

CLI incorpora os bloqueios do contrato e informa `contractVersion: 1`. Testes combinados: 35/35; regressão adicional de integração do CLI para campo desconhecido passou na repetição dos 23 testes do analisador. ESLint focado e TypeScript passaram. Origem local estável e aceita pelo contrato, dois PDFs conferidos, zero bloqueios e mesmos avisos de legado/ausência de documentos internos. Contratos completos das fontes auxiliares (clientes/compliance/documentos/auditoria) são uma pendência separada, não ocultada pela aprovação do contrato principal. Dependências transacionais e eventual conferência física de evidências internas permanecem pendentes; `importReady` continua falso.

Atualização de evidências internas, 2026-10-15: `documents.json` passou a integrar as leituras e hashes da origem. Evidência em avaliação de contratada exige ID de versão existente no mesmo tenant, versão positiva, status conhecido e upload não posterior à avaliação. Versões arquivadas/substituídas são preservadas; não se exige mesma empresa/unidade porque o fluxo atual permite evidência interna da consultoria. Não resolve ID contra recibo de terceiro nem infere evidência de texto livre. Validação física dos documentos internos permanece separada.

O store atual interpreta ausência de `documents.json` como lista vazia; o CLI mantém essa semântica com hash `null` e aviso explícito, sem criar arquivo. Referência a documento ausente continua bloqueando. Criação do arquivo entre leituras invalida estabilidade. Execução local: arquivo ausente, zero avaliações/evidências de contratadas, dois PDFs de terceiros verificados, zero bloqueios e aviso adicional da fonte interna ausente. Testes combinados 29/29 antes do ajuste de ausência; depois dele, 23/23 testes do analisador repetidos, incluindo ausência/aparecimento da fonte. Isolamento e evidência histórica foram exercitados em dados fictícios.

Atualização de arquivos, 2026-10-15: `third-party-file-analysis.mjs` foi integrado ao CLI, entre as duas leituras das fontes. Para cada recebimento, valida tenant/nome de armazenamento, rejeita travessia, caminhos absolutos, streams Windows, links/junctions e tipos de arquivo incorretos; verifica pais/caminho canônico, identidade do arquivo aberto, tamanho (limite local de 7 MB), prefixo `%PDF-` e SHA-256 por leitura em blocos. Reconfere identidades e metadados ao final. Saída somente com contagens e códigos; handles são fechados. Não extrai texto nem autentica o PDF. Não enumera arquivos órfãos nessa versão.

Testes focados combinados: 25/25, incluindo junction real do Windows em diretório temporário. CLI local: 2/2 PDFs verificados, 505086 bytes, zero bloqueios; fontes estáveis nas leituras. Verificação não representa um snapshot imutável: alteração posterior ou mudança/restauração entre observações ainda exige origem congelada para futura importação. A etapa física dos PDFs referenciados foi executada, mas evidências em documentos internos, contrato completo e dependências transacionais seguem pendentes; `importReady` permanece falso.

Atualização de referências, 2026-10-15: o CLI passa o conteúdo de compliance para o analisador. Avaliações explicitamente de contratadas exigem recibo/empresa/unidade/tipo no mesmo tenant e critério com a versão registrada; critério substituído permanece referência histórica válida. Data de avaliação anterior ao recebimento bloqueia. Avaliações internas não são atribuídas a terceiros; origem legada ausente com ID coincidente produz aviso, sem inferência. Referências de evidência a documentos internos continuam pendentes, identificadas por código sem expor IDs.

Auditoria de Terceiros valida o tipo de alvo por ação: convite, recibo, pendência, aprovação ou agenda, sempre no tenant do evento. `issue_updated` aceita pendência ou convite porque renovação usa a mesma ação. Alvo legado ausente é preservado com aviso; ação desconhecida bloqueia mesmo sem alvo. Testes sintéticos 19/19 e TypeScript/ESLint focados passaram. Leitura local estável: zero avaliações de contratadas e zero bloqueios, com os mesmos avisos de legado. Não foram auditadas permissões históricas, completude de eventos obrigatórios ou documentos internos de evidência. Essas verificações não tornam a origem pronta para importar.

Atualização do analisador, 2026-10-15: adicionada reconstrução de estado/recibo atual/responsável conhecido e período vigente a partir dos eventos. Abertura deve ser o primeiro evento; reenvio exige estado aberto, recibo novo do mesmo convite, vínculo de pendência, substituição do recibo anterior, ator do convite e digest correspondente. Resolução/reabertura exigem espera por revisão; quando há responsável no histórico, a revisão deve ser dele. Comentários e atribuições preservam o estado. O estado reconstruído é comparado ao snapshot atual; vínculos inversos de recibos corrigidos também são verificados. Ausências de período em ciclos legados permanecem ausentes. Isso valida consistência, sem reexecutar permissões históricas ou autenticar pessoas.

Essa atualização substitui a pendência de transições/vínculos inversos listada na primeira implementação acima. Testes focados: 13/13; leitura local estável, zero bloqueios e os mesmos quatro avisos de legado agregados. Próximos verificadores: referências de compliance/alvos da auditoria e bytes/caminhos dos PDFs. `importReady` continua sempre falso e o contrato ainda não é completo.

| Conjunto | Identidade e preservação |
|---|---|
| Convites | tenant + ID original, empresa/unidade, escopo opcional, requisitos, hash do token, expiração/revogação e revisão de concorrência |
| Recebimentos | tenant + ID original, convite, tipo, digest/tamanho, referência ao arquivo e validade opcional; registro imutável |
| Pendências | tenant + ID original, convite, recibos original/atual, responsável, estado e revisão esperada |
| Eventos de pendência | ID original, ordem de origem, autoria/data e snapshot do prazo; somente acréscimo |
| Aprovações | ID original, convite, fingerprint, responsável/data/justificativa; somente acréscimo |
| Agendas | ID original, aprovação referenciada, data civil, autoria/data; somente acréscimo |
| Auditoria do domínio | ID e alvo originais, tenant, ação/autoria/data; sem token ou conteúdo documental |

Usar chaves e referências compostas com tenant. RLS (segurança por linha) deve estar habilitada e forçada, com papel de aplicação mínimo. Ausência de contexto deve negar acesso. Estados atuais e evento correspondente devem ser gravados na mesma transação, com lock e revisão esperada. Não criar regras normativas ou aprovações automáticas.

## Dependências que impedem um corte imediato

1. Empresas/requisitos e compliance ainda participam da decisão fora da mesma transação. Migrar somente Terceiros não resolve essa corrida. Definir fonte transacional e controle de versões para todos os insumos antes de habilitar aprovação/agendamento no novo adaptador; se não houver garantia, negar a operação com motivo explícito.
2. Portal público resolve o tenant pelo convite. Projetar uma resolução restrita pelo hash do token, sem permitir ao visitante escolher tenant nem conceder SELECT amplo ao papel público. Validar expiração, revogação e escopo no servidor. Não atribuir identidade pessoal à posse do link.
3. PDF e PostgreSQL não compartilham transação. Projetar área de preparação, publicação por referência imutável e recuperação idempotente. Não apagar arquivo anterior diante de falha; não confirmar recebimento antes de garantir arquivo durável e metadados consistentes. Quota concorrente exige reserva/serialização por tenant.
4. Inventariar leitores diretos de `third-party.json`, incluindo painel operacional e relatório. Todos precisam usar o adaptador antes do corte, para evitar fontes divergentes.
5. O importador deve preservar integralmente IDs, datas, estados, versões, legado e auditoria; repetição idêntica é aceita, destino parcial/divergente aborta sem reparo silencioso.

## Ordem e critérios de validação

1. Contrato de origem e analisador read-only com fixtures sintéticas: origem íntegra, referências quebradas, duplicidade, legado ausente e alteração durante leitura.
2. Proposta de schema e adaptador ainda desconectados do runtime; provas em PostgreSQL descartável para RLS real, rollback, concorrência, isolamento e histórico imutável.
3. Plano de importação e reconciliador read-only: contagens e hashes por tenant, relações e arquivos; zero divergência necessária, sem ocultar avisos de legado.
4. Somente com autorização específica: aplicação de schema local e, separadamente, importação e reconciliação. Manter JSON e PDFs originais.
5. Somente após dependências transacionais resolvidas e autorização de corte: ligar adaptador, validar portal/relatório/pendências/decisões com dados fictícios e colher aceite humano. Sem escrita dupla. Retorno ao JSON exige reconciliação se o banco recebeu alterações.

Não há autorização implícita para produção, integração externa, dados reais ou aplicação de migration. O aceite visual do relatório atual continua separado deste desenho.

Continuação 2026-10-15: dry-run agora inclui manifesto v1 read-only com versões dos contratos, SHA-256 e presença de cada arquivo de origem (distingue fonte ausente de arquivo vazio) e totais agregados sem IDs/nome/CNPJ. Inclui todas as linhas da fonte de auditoria, não apenas eventos Terceiros. `importReady` permanece falso; manifesto não congela a origem, não é importador e não substitui reconciliação transacional. Testes focados do analisador: 23/23; TypeScript e ESLint focado passaram. Dry-run local: fonte estável, 1 consultoria/convite, 2 recibos, 1 pendência/4 eventos, 2 PDFs (505086 bytes) verificados, 0 bloqueios; pendem evidências PDF internas e dependências transacionais. `documents.json` ausente preservado como ausente. Nenhum banco, dado, PDF ou runtime foi alterado.

## Inventário de consumidores antes do corte — 2026-10-15

Busca estática por `third-party.json`, `third-party-service` e `listThirdPartyInvitations` identificou consumidores ativos que ainda dependem do store síncrono JSON:

- Leituras de página: `src/app/page.tsx` e `dashboard.tsx` (painel), `empresas/[companyId]/page.tsx`, `integracoes/terceiros/page.tsx` e `relatorios/terceiros/page.tsx`.
- Ações/mutações: `src/app/third-party-actions.ts` (convites, portal, PDFs e pendências), `integracoes/terceiros/actions.ts` (aprovação/agendamento) e `compliance-actions.ts` (revisão documental).
- Arquivos e documentos: `api/third-party-files/[receiptId]/route.ts` busca PDF por recibo; `document-section.tsx` e `compliance-section.tsx` exibem origens; revisão de compliance usa `getThirdPartyDocumentForReview`.
- Leitura indireta: `src/lib/operations-store.ts` abre `third-party.json` para o painel operacional; `local-data-read.ts` inclui o arquivo entre as fontes locais.
- Relatório e gate: `third-party-report.ts` e `third-party-integration-gate.ts` recebem snapshots em memória e requisitos/avaliações do store de compliance. Não são repositórios transacionais.

Antes de corte, essas rotas precisam consumir uma API assíncrona autorizada no servidor e preservar respostas/estados existentes. Escritas de pendência e seu evento/auditoria devem caber na mesma transação; gate e aprovação/agendamento devem ler versões consistentes de empresas/requisitos e compliance ou negar a operação. Portal deve resolver convite pelo hash do token, com consulta estritamente limitada e sem revelar tenant. PDF precisa ser validado/autorizado e lido por referência imutável; não se deve devolver caminho de armazenamento ao navegador. Métricas e operações devem trocar leitura direta por projeção tenant-scoped. Nenhum item deste inventário foi ligado ao adaptador nesta etapa.

Validação deste inventário: busca estática em `src/app` e `src/lib`; sem testes, alterações de código de runtime, banco ou dados. Próximo passo seguro: desenhar e provar em banco descartável os contratos transacionais compartilhados (insumos do gate e versionamento), mantendo as rotas atuais no JSON. Corte de serviço, portal, escrita ou leitura de PDF exige validação integrada e checkpoint próprio.
