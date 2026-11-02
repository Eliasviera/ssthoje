# Changelog

2026-11-02 — Checklists de áreas e equipamentos (rota `/checklists`, store `checklist-store.ts`, `data/checklists.json`): modelos criados pelo próprio TST, sem critérios pré-prontos nem fonte normativa; aplicação com resposta por item (conforme/não conforme/não se aplica), observação obrigatória em não conforme e assinatura simples desenhada na tela. Modelo arquivado preserva as inspeções. Permissões `checklist.read|apply|manage` (admin e SST: todas; Campo: ler e aplicar; cliente: ler). Auditoria `checklist.template_created|template_archived|completed`. tsc, ESLint e 15 testes limpos. Pendentes: link no menu, ligação com Não conformidades, modelos padrão (dependem de fonte e responsável técnico).

2026-11-02 — Perfil "Campo" (líder): permissões só `dds.read`/`dds.manage`; a página inicial redireciona esse perfil para `/dds`. Conta de demonstração opcional via `SST_DEMO_CAMPO_EMAIL`/`SST_DEMO_CAMPO_PASSWORD`. Testadores usam o perfil da consultoria (menu completo). Checklist para o Campo e PWA (manifest/ícone) pendentes: falta fonte técnica aprovada para o checklist. tsc, ESLint e 13 testes limpos; não testado em navegador/celular nem enviado ao servidor.

2026-11-02 — DDS com foto do grupo e PDF: a foto do local com as pessoas agrupadas (JPEG validado, imutável) é o primeiro passo e libera o tema e as assinaturas; tema só após a foto; assinaturas e encerramento exigem foto e tema. Auditoria `dds.photo_attached|theme_set`. Rota `GET /api/dds/[id]/pdf` (permissão `dds.read`, escopo do tenant, `pdf-lib`) e botões "Baixar PDF" e "Enviar" (compartilhamento nativo do celular; sem integração externa). Pendente de decisão humana: retenção e base legal da foto (LGPD). tsc e testes do dds-store ok; não testado em navegador/celular.

2026-11-02 — DDS (Diálogo Diário de Segurança), local, ainda não enviado ao servidor: rota `/dds`, store `dds-store.ts` (`data/dds.json`), permissões `dds.read`/`dds.manage` (admin e SST gerem; cliente só lê), auditoria `dds.created|signed|responsible_signed|closed`. O responsável assina; participantes (do cadastro ou digitados e marcados "não cadastrado") assinam desenhando na tela (PNG validado no servidor). Assinatura simples, sem validade de assinatura qualificada (aceite do usuário). Encerrado = imutável; exige assinatura do responsável. Tema livre, sem critério normativo. Biometria e matrícula de RH ficam para etapa própria (LGPD/consentimento). tsc e ESLint limpos; 25/25 testes (dds, tenant-access, aso, pcmso).

2026-11-02 — Servidor de testes: as 2 consultorias fixas do código (`DEMO_TENANTS`) foram renomeadas para "Consultoria A" e "Consultoria B" (nomes neutros, aceite do usuário), em `tenant-access.ts` e nos painéis master de integrações e operação. IDs internos mantidos para preservar o isolamento por cliente e os testes. Typecheck limpo; testes de tenant/plataforma 10/10 no Windows. Remoção total das consultorias fixas depende do cutover M22 (PostgreSQL).

2026-11-02 — Hospedagem (testes): `teste.ssthoje.com.br` (registro A) publicado com HTTPS (Let's Encrypt via certbot/nginx, HTTP redireciona para HTTPS); `/login` = 200 com certificado válido. Firewall Lightsail: SSH 22, HTTP 80, HTTPS 443 (esta somente IPv4). App sem dados pré-carregados.

2026-11-02 — Verificação: `http://[IPv6]/login` = 200 a partir do PC (nginx acessível externamente). As 2 falhas de teste (`pgr-digitalization-store`, `safety-checklist-suggestions`) também falham no Windows: são pré-existentes, não de portabilidade; correção fica para etapa própria.

2026-11-02 — Hospedagem (testes): app configurado como serviço systemd (`sst-hoje`, 127.0.0.1:3000) atrás de nginx na porta 80; teste local de `/login` = 200. Acesso externo, DNS (`teste.ssthoje.com.br`) e HTTPS pendentes.

2026-11-02 — Hospedagem (testes): no servidor, com `schemas/` presente, `pnpm test` 531/533 (2 falhas ainda não investigadas: `pgr-digitalization-store` e `safety-checklist-suggestions`; passam ou não no Windows: não verificado). `pnpm build` ok (exige swap de 2 GB na instância de 2 GB). App abre só em localhost, com `/login` de campos vazios e sem dados pré-carregados (`data/` e `uploads/` não enviados; restos de testes removidos). Credencial master de teste gerada no servidor (arquivo restrito, não registrada aqui). Ainda sem serviço permanente, HTTPS nem exposição pública.

2026-11-02 — Hospedagem (testes): app enviado ao servidor Ubuntu (Node 24.22.2, pnpm 11.25.0); `pnpm install` ok. `pnpm test` no Linux: 527/530 passam; as 3 falhas dependem de arquivos fora de `examples/app` (ex.: `schemas/`) que não foram enviados, não de erro de portabilidade (o teste de contrato passa no Windows). Build/typecheck ainda não executados no servidor. Chave SSH padrão exposta no chat foi substituída por chave própria e removida do servidor. Sem dados reais nem app exposto.

2026-11-02 — Hospedagem (testes): criado servidor Lightsail Ubuntu 22.04 (2 GB, Ohio, US$ 12/mês) com IP estático e firewall só SSH/HTTP; sistema atualizado e reiniciado. Alerta de orçamento US$ 50 e MFA (Windows Hello) ativos na conta. Sem app implantado, sem dados reais, sem banco gerenciado. Região Ohio só para dados fictícios; antes de dados reais, reavaliar São Paulo (LGPD).

2026-11-02 — Hospedagem: decidida Fase 1 somente para testes (sem CNPJ, sem comercialização, dados fictícios). Cobrança, fiscal e jurídico ficam para antes de qualquer cliente real. Nada contratado.

2026-11-02 — Hospedagem: requisitos de referência definidos (nuvem gerenciada, PostgreSQL gerenciado, região Brasil, backups testados). Provedor não escolhido; nada contratado.

2026-11-02 — Comercial: renovação manual com aviso prévio de ~30 dias, sem renovação automática por ora. Sem implementação.

2026-11-02 — Comercial: política de referência de cancelamento: mensal sem reembolso; anual com arrependimento de 7 dias; após cancelamento ou fim do teste, somente leitura/exportação por prazo a definir. Validação jurídica/contábil pendente; sem implementação.

2026-11-02 — Comercial: plano anual de referência com 2 meses grátis (10 × mensalidade: R$ 2.000 / 4.000 / 7.500), negociável. Cancelamento, reembolso, renovação e fiscal pendentes; sem implementação.

2026-11-02 — Comercial: previsto contratante do sistema por CPF (TST autônomo), além de CNPJ. Intenção de produto; fiscal/cobrança dependem da contabilidade; CPF como empresa atendida não decidido. Sem implementação.

2026-11-02 — Comercial: CNPJ master do grupo empresarial é titular de cobrança e administrador do grupo (usuários e limites de todos os CNPJs); isolamento de dados por CNPJ mantido. Intenção de produto, sem implementação.

2026-11-02 — Comercial: modalidade de grupo empresarial com vários CNPJs em pacote fechado e negociável, com CNPJs informados e um CNPJ master; atendimento por CNPJ. Intenção de produto, sem implementação; regras do CNPJ master, entrada/saída de CNPJs e franquia pendentes.

2026-11-02 — Comercial: preços de referência mensais definidos: Essencial R$ 200, Profissional R$ 400, Avançada R$ 750, negociáveis e a revisar com custos reais. Sem implementação em catálogo/cobrança. Pendentes: anual, cancelamento/reembolso e fiscal.

2026-11-02 — Comercial: faixas nomeadas Essencial (até 10 empresas/300 trabalhadores), Profissional (30/1.500) e Avançada (60/4.000). Preços das faixas 2 e 3 pendentes; nada implementado.

2026-11-02 — Comercial: Faixa 1 tem preço de referência de R$ 200,00/mês, com negociação livre caso a caso pelo Master; inclui TSTs que atuam como consultores com menos de 10 empresas. Demais preços, anual, cancelamento e fiscal pendentes; nada implementado.

2026-11-02 — Comercial: usuário aprovou os limites das três faixas (até 10 empresas/300 trabalhadores ativos; até 30/1.500; até 60/4.000), com pacote completo em todas. Nomes, preços, condição anual e cancelamento/reembolso seguem pendentes; nenhum catálogo, runtime ou cobrança foi alterado. Ver `DECISION_LOG.md` e `OPEN_QUESTIONS.md`.

2026-11-01 — Comercial: análise aceita; público prioritário inicial definido como consultorias de SST, mantendo cliente direto como modalidade futura. Correção do usuário: ofertar pacote completo em três faixas, com pacotes combinados por empresas clientes e trabalhadores ativos; registros arquivados ficam fora da franquia, mas armazenamento/retenção seguem separados. Atingido o volume, bloquear novos cadastros até confirmação de faixa; sem excedente automático. Não reutilizar as capacidades/preços demonstrativos do M16. Nomes, quantidades, preços, condição anual, cancelamento/reembolso e regras fiscais ainda não definidos; validar portes dos clientes-alvo e custos antes de propor números. Ciclos mensal/anual e demonstração acompanhada foram escolhidos; sem auto cadastro público. Usuário informou que ainda não tem CNPJ, portanto formalização fiscal e cobrança real permanecem bloqueadas. Nenhum fluxo externo foi ativado. Ver `DECISION_LOG.md` e `OPEN_QUESTIONS.md`.

2026-11-01 — M22/trabalhadores: o dry-run de domínio agora constrói em memória um plano de mapeamento do snapshot JSON para as colunas candidatas de trabalhadores e histórico, incluindo preservação de IDs/atores/datas, defaults de treinamento iguais ao runtime e normalização explícita do evento legado `created` para `active`. Plano local completo: 22/22 trabalhadores e 62/62 eventos individuais; referências inválidas marcam o plano como incompleto e eventos globais sem `targetId` não são associados. A prova `tenant:workers:verify-isolated` reconciliou registros inteiramente sintéticos em PostgreSQL descartável, validou round-trip, repetição idempotente e rejeição de destino parcial/divergente sem resíduo após rollback. Testes focados e ESLint passaram. Nenhum dado local foi importado; sem migração persistente ou corte operacional.

2026-11-01 — Identidade móvel M22: o schema candidato agora permite convidar uma identidade global já existente e aceitar o convite autenticado sem duplicar a conta; membership e grants de titularidade são criados somente no tenant do convite. Aceite por conta errada e replay concorrente são recusados. Prova PostgreSQL descartável e ESLint do verificador passaram. Sem conexão ao runtime ou banco persistente; hospedagem/provedor de entrega e enforcement transacional de cotas operacionais continuam pendentes.

2026-11-01 — M22/cotas: ampliado o dry-run de Empresas/Unidades para validar contratos, status, histórico, defaults de treinamento e referências de Trabalhadores, além dos eventos `worker.*`. A execução somente leitura contou 22 trabalhadores (18 ativos/4 arquivados), 62 eventos individuais, sem referências quebradas e 91 eventos globais sem `targetId`; nenhuma associação foi inferida. Testes fictícios 3/3 e ESLint passaram; sem conexão ou escrita no PostgreSQL e sem dados identificáveis na saída.

2026-11-01 — M22/trabalhadores: criado schema SQL candidato tenant/company/unit-scoped com histórico imutável e operações transacionais de cadastro/status sob cota ativa, sem DML direto para o papel da aplicação. Prova PostgreSQL descartável passou em autorização, isolamento, referência cruzada, corrida pela última vaga, arquivamento/reativação e auditoria imutável; ESLint passou. Adicionado `tenant:workers:verify-isolated`. Nenhum `workers.json` foi importado, nenhuma migration persistente foi aplicada e runtime/corte seguem JSON.

2026-11-01 — M22/trabalhadores: ampliado o schema candidato com edição transacional de ficha e registro somente dos campos alterados; no-op não gera histórico, campos inválidos e chaves de auditoria fora da allowlist são negados. A prova PostgreSQL descartável e ESLint passaram. Ainda sem importação do JSON, migration persistente ou conexão ao runtime.

2026-11-01 — Identidade móvel M22: a prova do schema candidato passou em PostgreSQL descartável para provisionamento, ativação única, convite/revogação por administrador, negação entre tenants, cotas concorrentes e suspensão de membership. A suspensão mantém a identidade global ativa e não invalida cookie por si só; a futura integração deve revalidar membership ativa no servidor em cada operação do tenant. Schema e fluxo continuam desconectados do runtime, sem migration persistente, uso real ou convites externos; cotas de empresas, trabalhadores e armazenamento ainda não têm enforcement transacional.

2026-11-01 — Identidade móvel M22: mapeadas as fontes que impedem editar cotas de forma transacional. Empresas e trabalhadores são contados a partir de `data/clients.json` e `data/workers.json`, mas os perfis de identidade e a tabela candidata de empresas estão no PostgreSQL; bytes físicos ficam em diretórios locais e a reserva simulada em `data/platform.json`. Não foi criada uma segunda fonte de contagem nem alterado o runtime. Próximo passo é definir/provar a migração e o corte para fontes autoritativas comuns antes de ativar limites por tenant.

2026-11-01 — Decisões de produto para administração móvel de clientes refinadas: cada cliente em tenant independente; administração de usuários/papéis/escopos e limites internos só pelo cliente; tetos de usuários, empresas, trabalhadores e armazenamento controlados pela plataforma; limites do cliente não podem exceder tetos nem reduzir abaixo do uso; convite manual exibido uma vez até haver provedor de e-mail. Hospedagem ainda não configurada, então nenhum uso real, publicação ou convite externo. Primitivas de scrypt/token e validações de cotas passaram (9/9), ESLint/TypeScript passaram; prova PostgreSQL descartável dos grants M22 e da reconciliação M22 passou. A base ainda não está ligada ao runtime/painel, e nenhuma migration foi aplicada a banco persistente.

2026-11-02 — eSocial: catálogo de consulta das Tabelas 24 e 27 em `/referencias` liberado a qualquer membro autenticado com acesso ao painel da consultoria. Os atalhos foram adicionados às áreas PGR e PCMSO; permissões para criar/revisar associações continuam separadas e inalteradas. Teste de autorização cobre membros de consulta sem permissão de associação. Nenhuma associação foi gravada e nenhum evento é transmitido.

2026-11-01 — eSocial Tabela 27: associação manual referencia uma versão salva de PCMSO atribuída ao coordenador médico, selecionada por empresa/unidade e versão. Revisões anteriores salvas permanecem elegíveis, e a tela mostra escopo/versão sem expor o conteúdo do PCMSO. A ação server-side revalida atribuição, versão salva e escopo antes de salvar; a associação segue em registro versionado separado, sem inferência de exame, indicação, realização ou transmissão. Teste de resolução histórica, testes focados (18/18), ESLint e TypeScript passaram; build em validação.

2026-11-01 — PCMSO/eSocial: consulta somente leitura da Tabela 27/S-2220 adicionada diretamente à seção médica do PCMSO. Busca no snapshot local por código/descrição e mostra até 15 resultados, com link para a fonte oficial e aviso de que não indica, associa nem salva procedimentos e não transmite eventos. O acesso é limitado ao perfil médico coordenador; fluxo de associação e revisão segue separado. ESLint, TypeScript e testes focados PCMSO/eSocial passaram. Ver `ANALISE_PGR_PCMSO_ESOCIAL.md`.

2026-11-01 — PCMSO: a minuta imprimível agora apresenta as fontes oficiais para conferência: listagem de NRs do MTE (que inclui a NR-7) e snapshot oficial das tabelas eSocial S-1.3/NT 07/2026. A listagem do MTE foi consultada; o endpoint individual da NR-7 retornou 404, portanto a tela pede conferência da publicação, versão e vigência pelo médico responsável. Nenhum critério clínico, associação de exame ou transmissão foi adicionado. Testes PCMSO focados (8/8), ESLint e TypeScript passaram; ver `ANALISE_PGR_PCMSO_ESOCIAL.md`.

2026-11-01 — PCMSO/eSocial: registrado o uso da NR-7 e do portal oficial do eSocial como referências, com identidades fictícias na demonstração. A prévia do PCMSO deixou de preencher o representante legal com um nome importado do PGR; campos de responsáveis usam placeholders fictícios ou ficam vazios. Nenhuma regra de indicação de exames, associação real ou emissão foi adicionada. Versão/vigência e critérios clínicos devem ser conferidos nas fontes oficiais e revisados pelo médico responsável antes de qualquer implementação normativa.

2026-11-02 — eSocial: adicionadas associações manuais versionadas e revisão humana separadas por tabela, com acesso por perfil, isolamento pelo tenant ativo, justificativa, histórico e auditoria. Associação revisada é imutável; mudanças exigem nova versão. A consulta de códigos permanece read-only, os vínculos não usam riscos/procedimentos estruturados, e nada é sugerido ou transmitido. Consulta da Tabela 27 também disponível ao médico coordenador sem liberar o painel administrativo de Referências. Testes focados (17/17), ESLint, TypeScript e build passaram; build mantém aviso de padrão de arquivo amplo preexistente em `/api/health`. Nenhuma associação real foi registrada.

2026-11-01 — PGR/eSocial: no editor do inventário estruturado, cada risco pode consultar e receber uma associação manual opcional à Tabela 24/S-2240, com justificativa e referência ao snapshot oficial. A rota `/pgr` agora respeita o modo de armazenamento configurado e exibe esse editor quando PostgreSQL está ativo; a consulta aparece somente para perfis autorizados. O servidor valida código, descrição, versão, fonte e permissão por perfil; a associação segue no snapshot do inventário e é exibida para revisão humana. Prévia local confirmou que o perfil sem permissão não vê o seletor; o formulário exploratório não foi salvo e o inventário existente continuou com 153 itens. Nada é inferido, não se valida vigência/aplicabilidade e nenhum evento é gerado ou transmitido. O PGR legado em texto livre e os dados existentes não foram alterados.

2026-11-01 — eSocial: adicionada consulta read-only das Tabelas 24/S-2240 (92 códigos) e 27/S-2220 (1.450 procedimentos) na área Referências. Snapshot vem da publicação oficial S-1.3 consolidada até NT 07/2026, revisão publicada em 20/10/2026, com URL, hash e data de captura registrados. A consulta não associa códigos a riscos/exames, não valida vigência individual e não gera/transmite eventos. Testes focados (3/3), ESLint, TypeScript e build passaram; build manteve apenas o aviso preexistente de padrão de arquivo amplo em `/api/health`.

2026-11-02 — AR: adicionada seção independente da APR/PGR, visível e acionável somente para o perfil `sst_tst`. Rascunhos têm controle de revisão e histórico; emissão registra usuário/data e bloqueia alterações posteriores. Campos narrativos livres, sem checklist ou regra normativa. A interface alerta que o sistema não verifica habilitação profissional nem libera atividade operacional. Persistência permanece JSON local, sem integração PostgreSQL. Testes focados (13/13), ESLint focado, typecheck e build aprovados; o build também reportou aviso de padrão de arquivo amplo preexistente em `/api/health`. Nenhum registro foi emitido.

2026-11-01 — Trial de demonstração: a prova em PostgreSQL descartável encontrou e corrigiu uma declaração duplicada de policy que impedia aplicar `0013_demo_trial_lifecycle.sql`. O verificador `pnpm demo:trial:verify-isolated` aplicou `0001`/`0013` e confirmou RLS forçada, ausência de privilégios de leitura/escrita do papel runtime, isolamento de leitura e escrita de Master/tenant em papéis sintéticos, bloqueio de escrita cruzada e convite fora do tenant, ativação, extensão aprovada por mais 30 dias, extensão negada sem alterar o prazo, ativação de convite e solicitação de extensão sem duplicação sob concorrência, e auditoria imutável contra `UPDATE`, `DELETE` e `TRUNCATE`. Container removido; testes focados (6/6), ESLint e typecheck passaram. A migration segue candidata e não aplicada ao banco persistente; autenticação, ativação, cobrança e expurgo não foram conectados.

2026-11-01 — Identidade/membership: adicionada prova executável contra PostgreSQL temporário para `assertCurrentTenantMembershipParity` sob o papel `sst_hoje_app` e RLS da migração `0001`. Passaram membership ativa compatível e negações para vínculo inexistente, identidade/tenant/papel divergentes, membership/tenant suspensos e contexto sem usuário/tenant. Executar com `pnpm tenant:membership:verify-isolated`; o container foi removido. Testes focados (15/15), ESLint e typecheck passaram. A prova não conecta o login à membership persistida nem altera o guard global; tenants dinâmicos e links de demonstração continuam bloqueados.

2026-11-01 — Inventariado o armazenamento local para demonstrações autônomas em `DEMO_TENANT_STORAGE_INVENTORY.md`. O endpoint de importação de PGR agora processa PDF do buffer da requisição sem gravá-lo em `uploads/pgr-import`; arquivos preexistentes foram preservados. Teste de contrato protege o caminho direto por bytes e a ausência da gravação local. Links e expurgo continuam bloqueados por stores JSON compartilhados, anexos sem catálogo completo e pendências de cobrança/hospedagem.

2026-11-01 — Cadastro de empresas/unidades: adicionada e executada prova contra container PostgreSQL temporário. Passaram migrações `0001`/`0004`, criação/listagem/arquivamento sob papel runtime, negação de leitura sem escopo, isolamento RLS contra leitura cruzada, bloqueio de escrita em tenant alheio e auditoria transacional. Executar com `pnpm clients:db:verify-isolated`; o container foi removido e o script não usa nem modifica o banco local. O seletor de runtime permanece deliberadamente em JSON e os dados existentes não são importados.

2026-11-01 — Preparado esquema candidato para demonstrações: convites guardam somente hash do token, trials começam na ativação, uma solicitação de extensão pode ser decidida pelo Master e auditoria é append-only. A migração `0013_demo_trial_lifecycle.sql` não foi aplicada, não concede acesso à aplicação e não contém criação de contas, ativação, cobrança ou expurgo. Expurgo e disponibilização de links continuam bloqueados até concluir o isolamento de todos os stores/anexos e testar a remoção apenas em dados sintéticos. Teste estático do contrato da migração adicionado.

2026-11-01 — Registrada decisão para futuras demonstrações autônomas: gerador de links privado no Master, ambiente novo e vazio, somente dados fictícios, prazo de 30 dias, pedido de mais 30 dias sujeito à autorização exclusiva do Master e expurgo automático após o prazo quando não houver pagamento. Não aplicar ao armazenamento local existente. Esta capacidade não está implementada: o app atual não tem cadastro por link nem expurgo abrangente por tenant; hospedagem pública segue sem decisão. Ver `DECISION_LOG.md` e `OPEN_QUESTIONS.md`.

2026-11-02 — EPI: adicionada leitura local de PDFs pesquisáveis de NF e relatório para sugerir produto, CA, quantidade, referência, fornecedor, lote, validade do produto e custo unitário. Corrigido o carregamento do parser para usar `pdf-parse/lib/pdf-parse.js` e normalizar os bytes de entrada para `Uint8Array`; o parser falhava em PDFs pesquisáveis válidos quando recebia diretamente um `Buffer` do Node. Heurísticas reconhecem `NF-e nº` e separam campos quando rótulos conhecidos aparecem na mesma linha. As sugestões exigem conferência e envio manual; nenhuma movimentação é salva pela extração, validade do CA não é inferida e PDF escaneado segue sem OCR. Endpoint exige sessão/permissão `epi.manage`, limita PDF a 15 MB e não devolve o texto integral. A interface preserva valores digitados manualmente, limpa apenas sugestões anteriores ainda intactas ao selecionar outro documento e cancela extrações antigas para não aplicar resultado de arquivo trocado. Suíte completa desta frente EPI (entregas, estoque, extração e rota): 38/38; ESLint, typecheck e build aprovados. Teste visual anterior confirmou 8 campos no PDF fictício; PDF sem texto retornou 422 com orientação de OCR indisponível. Nesta retomada a prévia local respondeu, mas exibiu tela de login; nenhuma credencial foi utilizada e não houve novo teste visual autenticado. Nenhum formulário foi enviado. Build mantém aviso preexistente sobre o padrão amplo de arquivos em `/api/health`. Ver `EPI_ESTOQUE_CHECKPOINT.md`.

2026-11-01 — EPI: criada fila preventiva de revisões manuais do CA, visível ao abrir o estoque: começa a alertar no 10º dia, marca como vencida após 15 dias e inclui CA informado que vence nos próximos 15 dias ou já venceu, com atalho para cada item. Gestor autorizado registra a nova validade e data sem gerar movimento de estoque; o CA deve corresponder ao item, a consulta deve ser recente, e versões anteriores ficam em histórico próprio e na auditoria. A fila não roda em segundo plano e não consulta o CAEPI automaticamente. Suíte focada EPI/estoque, permissões e plataforma: 36/36; typecheck, ESLint focado e build aprovados. Build mantém aviso preexistente sobre o padrão amplo de arquivos em `/api/health`. Suíte completa: 476 aprovados, 2 falhas não relacionadas à frente EPI e 1 ignorado. Inspeção visual confirmou a fila na tela com estoque vazio; cenário com registros fictícios e ensaio offline seguem pendentes. Ver `EPI_ESTOQUE_CHECKPOINT.md`.

2026-11-01 — EPI: entrada de estoque passa a oferecer três formas principais: nota fiscal em PDF, relatório de almoxarifado em PDF ou registro direto no sistema sem anexo. Documentos são armazenados e vinculados ao movimento; o sistema não extrai nem importa dados, que devem ser digitados e conferidos manualmente. Pedido, transferência e ajuste permanecem como origens compatíveis. Typecheck, ESLint focado e build aprovados; build mantém aviso anterior sobre o padrão amplo de arquivos em `/api/health`. Testes focados de estoque: 14/14, incluindo origem direta, PDF obrigatório para relatório e isolamento do acesso ao documento.

2026-11-01 — EPI: lançado no armazenamento local de demonstração o protetor auditivo 3M Pomp Plus, CA 5745, 10 unidades, no escopo de teste EMA MAXIBUS · Erechim, via cadastro direto sem NF. O usuário informou que todos os dados são fictícios e transcreveu os dados do CA e sua validade; o sistema não consultou o CAEPI nem avaliou conformidade. Saldo demonstrativo: R$ 39,50. Ver `EPI_ESTOQUE_CHECKPOINT.md`.

2026-11-02 — EPI: concluído o fluxo de revisão manual para registros offline sincronizados. Revisão autorizada valida CA numérico, validade e consulta dos últimos 15 dias, não consulta fonte oficial e cria ficha identificada como “entrega informada offline”, sem OTP, comprovante ou confirmação do trabalhador. A saída vinculada aparece como conciliação pendente até baixar as quantidades por CA/tamanho; o servidor agrega cadastros equivalentes para impedir exceder a ficha e sinaliza excesso legado. Cadastro/movimentação de estoque também exige consulta manual recente, atualiza validade/data consultadas e arquiva o snapshot anterior; a tela alerta vencimento do CA, consulta desatualizada e lotes vencidos. Lote de produto vencido continua bloqueando saída; CA vencido na saída segue sujeito à confirmação justificada de gestor, que não declara conformidade. Integração automática CAEPI não implementada por ausência de documentação/autorização. QA: 23/23 testes EPI/estoque, typecheck, ESLint focado e build Next.js aprovados. Build mantém o aviso preexistente de padrão amplo de arquivos em `/api/health`. Teste manual offline/navegador pendente. Ver `EPI_ESTOQUE_CHECKPOINT.md`.

2026-11-02 — EPI offline: implementada captura local em IndexedDB, isolada por escopo derivado de tenant/usuário, e sincronização manual idempotente. O servidor revalida permissão e vínculo ativo e cria registro separado pendente de conferência do CA; não cria ficha operacional nem movimenta estoque. A fila não marca CA confirmado e só é removida do navegador após recebimento bem-sucedido pelo servidor. Testes focados (20/20), TypeScript, ESLint e build Next.js aprovados; nenhuma gravação ativa nem teste visual/offline manual realizado. Sem criptografia local, cache/service worker ou garantia de uso após fechar/recarregar a tela. Ver `EPI_ESTOQUE_CHECKPOINT.md`.

2026-11-01 — EPI: formalizada conferência manual do CA por movimentação. Entrada e saída exigem declaração do gestor de que consultou o CAEPI e validade transcrita para aquele movimento; entrada com validade vencida é bloqueada e saída exige justificativa quando a validade transcrita venceu. O histórico identifica o registro como declaração, não consulta do sistema. Também registrada decisão de operação offline pendente de sincronização/conferência, mas implementação permanece futura: app não possui service worker, fila local ou sincronização e não deve alegar gravação sem rede. Ver `EPI_ESTOQUE_CHECKPOINT.md`.

2026-11-01 — EPI: registrada a decisão de consultar automaticamente o CAEPI na entrada de estoque e na saída vinculada à ficha, condicionada a integração oficial aprovada e consentimento explícito antes da produção. A página pública examinada não documenta API e bloqueou requisição direta com desafio anti-automação; nenhuma consulta real foi ativada. Próximo insumo: documentação/ autorização oficial com endpoint, contrato, campos, limites e condições de uso. Ver `EPI_ESTOQUE_CHECKPOINT.md`.

2026-11-01 — EPI: saída de estoque cujo CA informado venceu agora exige confirmação justificada de gestor autorizado (`epi.manage`). A decisão, a justificativa, a conta e o horário ficam no histórico; o aviso esclarece que isso não declara conformidade. Validade vencida do produto/lote continua bloqueando a saída. Consulta ao CAEPI permanece manual.

2026-10-24 — APR: confirmada em prévia autenticada temporária a interação real dos dois botões de estrutura inicial. Atividade diversa e espaço confinado preencheram os campos organizacionais previstos; a opção de espaço confinado não preencheu referência técnica. Nenhum formulário foi enviado e nenhum modelo/APR foi criado. Prévia, configuração temporária e cache isolado foram encerrados/removidos. Atualiza a observação anterior deste changelog que deixava a interação pendente.

2026-10-24 — APR: registrado que a referência técnica revisada ainda não foi fornecida e não deve ser solicitada novamente até nova informação. Conteúdo normativo segue bloqueado. Reafirmados os gates existentes: revisão humana autenticada para ativar o modelo; PGR aprovado no mesmo escopo e seleção de riscos para criar APR. Sem alterações de runtime ou liberação operacional.

2026-10-24 — APR: seleção de PGR/riscos aprovada extraída para helper server-side testável e usada na criação da APR. A seleção rejeita PGR não aprovado, tenant/empresa/unidade divergentes, IDs repetidos ou riscos ausentes da revisão aprovada; o modelo reutilizável continua independente do PGR. Testes protegem ativação humana sem vínculo de PGR, preservação da versão ativa, snapshots de APR após versionamento e rejeição de duplicidade/versões concorrentes pendentes. Testes focados 14/14, TypeScript e ESLint passaram. Nenhum conteúdo normativo ou liberação operacional foi adicionado.

2026-10-24 — APR: regressão completa do app após os gates e testes de versionamento; 400 testes passaram, 1 foi ignorado e 0 falharam. Sem alteração de dados persistentes ou conteúdo técnico.

2026-10-24 — APR: aceite humano registrado para preservação de snapshots e versionamento de checklist; escopo limitado ao comportamento estrutural, sem validação técnica ou liberação operacional. Regressão completa repetida: 400 passaram, 1 ignorado, 0 falhas.

2026-10-24 — APR: testes estruturais acrescentados para quantidade/tamanho das perguntas e validade/ordem de datas de referência opcional, sem conteúdo normativo. Regressão focada 16/16 e completa 402 passaram, 1 ignorado, 0 falhas; TypeScript e ESLint focado passaram.

2026-10-24 — APR: metadados opcionais de referência são normalizados no armazenamento e têm limites server-side alinhados à interface. Testes garantem normalização, limites e ausência de rascunho em entradas inválidas. Regressão focada 17/17, completa 403 passaram, 1 ignorado, 0 falhas; TypeScript e ESLint focado passaram.

2026-10-24 — APR: texto da seção esclarece que modelos são reutilizáveis e ativados após revisão humana; o PGR aprovado e os riscos são selecionados por APR, no escopo empresa/unidade. Apenas clareza de interface; nenhuma associação de modelo a PGR foi criada. TypeScript, ESLint e suíte completa (403 passaram, 1 ignorado) aprovados.

2026-10-24 — APR: a ativação do modelo repete a validação estrutural de metadados de referência (limites, campos e vigência), rejeitando alteração inválida no rascunho persistido sem substituir a versão anterior ativa. Testes APR focados 18/18; suíte completa 404 passaram, 1 ignorado, 0 falhas; TypeScript e ESLint focado aprovados.

2026-10-24 — APR: adicionados preenchimentos opcionais de estruturas iniciais editáveis para atividade diversa e espaço confinado. São perguntas organizacionais sem critérios técnicos/normativos; apenas preenchem o formulário, não gravam automaticamente, e continuam sujeitas a revisão humana antes de ativação. A interação foi confirmada depois em prévia autenticada; ver a anotação mais recente e `APR_CHECKPOINT.md`.

2026-10-24 — APR: a auditoria agora identifica criação de rascunho/ativação de modelos e criação, salvamento e envio de APR pelo evento específico, em vez do rótulo genérico. Os rótulos ficam em módulo sem dependências de servidor para uso seguro nos painéis client-side. Prévia recarregada após corrigir falha de compilação do bundle; testes, TypeScript e ESLint passaram. Sem alteração de permissões, critérios técnicos ou liberação operacional.

2026-10-24 — APR: modelos configuráveis para espaço confinado (referência NR-33 a validar) e atividades diversas agora são criados como rascunho, sem itens pré-carregados. A seleção para APR só aceita modelo após ação autenticada de revisão e ativação; NR-33 exige metadados de fonte/revisão. A ativação registra a conta e preserva a versão anterior, sem atestar qualificação. APR segue vinculada a PGR aprovado e riscos estruturados; sem avaliação automática de conformidade.

2026-10-24 — PT/PTE: teste automatizado adicionado para proteger o contrato candidato v20: altura segue aguardando conteúdo revisado, NORMAM-222 permanece ajustável por cenário e PTE segue separada. Nenhuma regra runtime foi adicionada.

2026-10-24 — PT: estado vazio da simulação agora orienta o caminho até uma APR elegível: consultar o PGR e configurar checklist/APR, indicando os pré-requisitos existentes. Somente navegação informativa; sem criação automática ou mudança de regras.

2026-10-24 — PT: estado vazio da simulação esclarece que o ensaio exige APR existente em rascunho ou em revisão vinculada a empresa/unidade ativa. Não sugere aprovação técnica nem cria cenário sem vínculo.

2026-10-24 — PT: contrato candidato atualizado para v20, registrando como pendente o conteúdo técnico revisado de altura que será fornecido pelo usuário. Não exigir indicação de responsável agora; critérios continuam sem implementação. A aplicabilidade da NORMAM-222 permanece ajustável por cenário.

2026-10-24 — PT/PTE: o cartão de PTE do painel agora usa o catálogo compartilhado de PTE e apresenta o estado informativo junto ao tipo, mantendo a separação de PT. Sem checklist, critério ou disponibilidade operacional.

2026-10-24 — PT: nota do painel ajustada para não apresentar um possível gate futuro como regra ativa. A relação entre modalidade, riscos e controles permanece pendente de definição/validação humana; o texto informa que nenhuma PT é liberada nesta etapa.

2026-10-24 — PT: registrada a decisão do usuário de fornecer futuramente conteúdo técnico revisado para altura. O material ainda não foi recebido; a modalidade continua somente demonstrativa, sem checklist, critério ou emissão. Não foi solicitada indicação de responsável nesta etapa.

2026-10-24 — PT: aceite visual do usuário registrado para a apresentação informativa das modalidades e estados no painel. O aceite não autoriza critérios técnicos, conclusão de aplicabilidade normativa, gate ou emissão; a aplicabilidade da NORMAM-222 segue ajustável por cenário pela equipe.

2026-10-24 — PT: o painel agora apresenta o estado informativo de cada modalidade e a ressalva de cenário da NORMAM-222 para mergulho, usando diretamente o catálogo compartilhado. A altura fica identificada como demonstração e as demais PT como planejadas; sem mudança de critérios, gate ou emissão.

2026-10-24 — PT: o resumo de modalidades no painel agora deriva do catálogo compartilhado usado pela preparação, reduzindo divergência entre as telas. PTE continua separada e nenhuma regra de emissão foi ligada. TypeScript, ESLint e teste focado verificados.

2026-10-24 — PT: tela de preparação esclarece sob “Mergulho profissional” que a aplicabilidade da NORMAM-222 depende do cenário e ficará para ajuste da equipe. Apenas nota informativa; sem regra técnica, gate ou emissão. Teste focado cobre a mensagem.

2026-10-24 — PT/PTE: catálogo da tela agora exibe o estado de implementação por modalidade: altura somente em demonstração e demais PT/PTE planejadas sem checklist/critério técnico implementado. Informação visual, sem mudança de disponibilidade operacional ou regras. Testes focados validam rótulos e estados.

2026-10-24 — PT/PTE: a tela de preparação agora apresenta as seis modalidades de PT e a PTE de espaço confinado em grupos separados, conforme a distinção do catálogo candidato. A organização não define classificação normativa, campos ou critérios. Teste de catálogo atualizado.

2026-10-24 — PT: rótulo do tipo nas listas do produto e contrato candidato atualizado para “Mergulho profissional”, conforme escopo confirmado. Sem mudança de critérios, fluxo operacional, gate ou emissão; PTE continua separada. Teste focado do catálogo acrescentado. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: campo de aplicabilidade da NORMAM-222 por cenário reservado para ajuste posterior pela equipe, conforme pedido do usuário. Contrato v18 deixa explícito que não há conclusão técnica e que o protótipo não operacional não é bloqueado; sem critérios ou emissão. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: após a correção do usuário e exame do PDF oficial anexado/Marinha, NORMAM-222/DPC (edição 2025) substitui NORMAM-15 como referência candidata para mergulho comercial. Seções 1.5, 1.71 e 4.4(f) documentam escopo e funções do Supervisor; catálogo DPC ainda 403, então última edição em 2026 não foi confirmada. Contrato v17 não implementa conteúdo técnico, checklist, autoridade, gate ou emissão; modificação humana necessária antes de critérios. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: tentativa adicional de confirmar a vigência da MOD 2 da NORMAM-15/DPC e as atribuições do Supervisor de Mergulho em fontes oficiais. Portal/páginas DPC e consulta DOU retornaram 403; caminhos de PDF tentados retornaram 404. Contrato candidato v16 mantém as revisões/datas fornecidas pelo usuário como não verificadas e não atribui autoridade de assinatura. A limitação não bloqueia preparação do protótipo não operacional; critérios e emissão permanecem desativados. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: usuário forneceu dados de MOD 1 e MOD 2 da NORMAM-15/DPC e datas de vigência informadas. Contrato candidato v15 registra essas datas como não verificadas em fonte primária e não confirma que MOD 2 seja a edição vigente em 2026; o acesso às páginas DPC retornou 403. Sem critérios, autoridade de assinatura, runtime ou emissão. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: usuário detalhou contextos para mergulho profissional (AJB e ambientes hiperbáricos terrestres/obras civis), referências candidatas (NORMAM-15/DPC, NR-15 Anexo 6, NR-07/PCMSO e ABNT) e revisores propostos. Contrato candidato v14 registra as informações como propostas pendentes de validação: revisão/vigência DPC não confirmadas (HTTP 403), itens de NR-07 e números ABNT a identificar, competências/assinaturas sem autoridade atribuída. Sem checklist, runtime ou emissão. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: usuário confirmou que a modalidade de mergulho é profissional. Contrato candidato v13 registra a confirmação sem equipará-la automaticamente à categoria “comercial” da página DPC; setor, ambiente, operação, jurisdição aplicável e fontes/edições continuam pendentes de revisão técnica. Sem checklist, runtime ou emissão. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: escopo confirmado atualizado para seis modalidades: altura, içamento, trabalho a quente, escavações, eletricidade e mergulho. Naquele registro inicial, a fonte e os critérios de mergulho ainda não estavam identificados; a pesquisa posterior do Anexo 6 da NR-15 e da DPC está registrada abaixo. O protótipo permanece na demonstração de altura. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT: refinado o mapa de fontes oficiais com itens consultados: NR-18 18.10.1.18–.19 (análise de risco e PT para carga não rotineira), 18.7.6.2–.4 (trabalho a quente) e 18.7.2.3 (escavação acima de 1,25 m), condicionados à aplicação setorial da NR-18; NR-11 11.1.3 e 11.1.5 para equipamentos de movimentação e treinamento de operador motorizado. Sem checklist, tela ou gate adicionado; confirmar escopo e referências aplicáveis com responsável técnico. Ver `PT_PTE_CHECKPOINT.md`.

2026-10-24 — PT: contrato candidato v12 com catálogo das seis modalidades PT confirmadas, PTE em categoria separada e estados demo/planejado. Mergulho foi confirmado como modalidade planejada; sem critérios definidos ou mudança de runtime.

2026-10-24 — PT: para mergulho, registrada como referência candidata a seção de trabalhos submersos do Anexo 6 da NR-15; a página DPC da Marinha sobre mergulho comercial está identificada, mas o acesso respondeu 403 e a edição normativa marítima não foi verificada. Escopo de mergulho profissional/comercial, setor/ambiente e aplicabilidade ainda exigem revisão humana. Sem critérios ou mudança de runtime.

2026-10-24 — PT/PTE: fonte normativa primária da NR-18 localizada pela página vigente do MTE: PDF NR18atualizada2026I.pdf, com última modificação indicada pela Portaria MTE nº 836/2026. O item 18.12.6 exige que montagem/desmontagem de andaimes seja feita por trabalhadores capacitados com treinamento específico para o tipo utilizado; UI e contrato candidato v11 agora referenciam a fonte. Não há verificação de certificados, novos controles operacionais, bloqueio ou emissão; os demais requisitos do item não foram implementados nesta fatia. Testes focados: 7/7; ESLint e TypeScript aprovados; contrato JSON v11 validado.

2026-10-24 — PT/PTE: documentada a inspeção dos mecanismos de arquivos existentes: o armazenamento geral grava localmente sem criptografia; o candidato privado da frente M22 protege a integridade do manifesto com HMAC, mas não criptografa o PDF e não está ligado ao PT/PTE. Evidências pessoais de treinamento não serão recebidas por esses mecanismos. A investigação normativa inicial encontrou links oficiais quebrados e falha de transporte no DOU; a página vigente do MTE e o texto oficial acessível foram localizados posteriormente, conforme registro mais recente acima. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — Trabalhadores/PT-PTE: adicionados ao cadastro campos independentes para estado informado de treinamento NR-35 e curso focado em supervisão de altura. Valores aceitos: não informado ou informado/pendente de validação; registros legados são tratados como não informados. Histórico registra mudanças e o seletor demo exibe ambos sem filtrar nem selecionar automaticamente. Não se armazenam certificados/datas, não se valida treinamento e nenhum funcionário fictício foi marcado como treinado. Regressão combinada 23/23, ESLint focado, TypeScript e contrato JSON aprovados.

2026-10-24 — PT/PTE: registrado pedido para exigir capacitação de montadores de andaime. Bloqueio não implementado: escopo e redação da NR-18 precisam ser confirmados; a URL oficial da versão identificada retorna 404. Ver `PT_PTE_CHECKPOINT.md` e `DECISION_LOG.md`.

2026-10-24 — PT/PTE: orientação inicial registrada como gatilho pretendido qualquer atividade que utilizasse andaime. Esta hipótese foi posteriormente substituída pelo esclarecimento do usuário: acompanhar treinamento de quem monta/desmonta e registrar o uso do andaime separadamente.

2026-10-24 — Pesquisa NR-18: a listagem geral oficial do MTE está acessível e lista NR-18; porém, a página vinculada à norma e o PDF “NR-18 atualizada 2025” retornaram 404. Um acesso direto ao MTE retornou 403. Texto vigente e aplicabilidade da exigência ainda sem confirmação; nenhum bloqueio foi implementado.

2026-10-24 — PT/PTE: após esclarecimento do usuário da área de SST, cadastro demonstra estado informado/pendente de validação para treinamento de montagem/desmontagem de andaimes; atividade demo registra separadamente uso e montagem/desmontagem. Quando montagem/desmontagem está incluída, pessoas fictícias designadas são selecionadas explicitamente e revalidadas em cada ação. Relatos não comprovam qualificação; não há gate nem emissão. Testes focados: 7/7; regressão combinada 24/24; ESLint, TypeScript e contrato candidato v8 aprovados.

2026-10-24 — PT/PTE: usuário escolheu o supervisor responsável pela atividade como revisor humano da evidência de treinamento dos montadores/desmontadores. Contrato candidato v9 e interface informam essa responsabilidade futura; sem evidência definida ou identidade/autorização real, nenhuma validação ou emissão é habilitada.

2026-10-24 — PT/PTE: evidência definida pelo usuário como registro de conclusão do treinamento mais confirmação do empregador, revisados pelo supervisor da atividade. Contrato candidato v10/UI explicitam a composição; sem coleta ou armazenamento local de documentos, autenticação ou validação da qualificação.

2026-10-24 — PT/PTE: tela do simulador explicitou a preferência demonstrativa por treinamento específico de supervisão em altura além de NR-35; à época, cadastro não continha esse atributo. O acompanhamento foi posteriormente incluído em campos separados e pendentes, sem filtrar/pré-selecionar pessoas ou inventar certificações.

2026-10-24 — PT/PTE: removido escopo sintético fixo do checklist de simulação; checklist e atores fictícios agora compartilham o tenant/empresa/unidade e activityId da atividade vinculada à APR. Parser e transições rejeitam divergência entre escopo do checklist e atividade; cobertura de tampering adicionada. Testes PT/PTE 22/22, ESLint focado, TypeScript e contrato JSON passaram. Nenhuma permissão operacional ou emissão ativada.

2026-10-24 — PT/PTE: cenário agora carrega etapa e área exatamente da APR selecionada, apenas como contexto da atividade demo; a página e cada Server Action confirmam igualdade com a APR/revisão atual e bloqueiam o permalink se os dados divergem. Nenhum dado de risco, resposta ou critério técnico é usado para avaliar/liberar a atividade. Cobertura focada adicionada para divergência de descrição e revisão; 22 testes PT/PTE, ESLint focado, TypeScript e contrato JSON aprovados.

2026-10-24 — PT/PTE: atividade do cenário demo passou a ter referência tipada `work_at_height_demo`, vinculada explicitamente ao ID/revisão da APR e ao tenant/empresa/unidade. Permalink rejeita divergências nessa referência; dados técnicos ficam marcados como pendentes de revisão humana, sem critérios preenchidos. UI e contrato candidato atualizados; sem alteração normativa ou emissão. Testes focados, ESLint e TypeScript executados após a mudança.

2026-10-24 — PT/PTE: registrado o aceite humano do fluxo de NC persistente e a referência Brasil/NR-35 conforme página oficial do MTE, que aponta a Portaria nº 1.259/2026 como alteração do Anexo III. Conferência dos PDFs oficiais do MTE resolveu a divergência: a Portaria nº 1.680 original é de 02/10/2025 (DOU 03/10/2025), confirmada pela página de Portarias de 2025 e pelo próprio original; o ano 2026 na ementa da Portaria nº 1.259 é erro material, enquanto o art. 6º cita o ano correto. A regra alterada é transitória e específica a escadas fixas verticais existentes/projetos em curso, não um critério geral de altura. A data de vigência da NR-35 não precisa ser registrada nem bloqueia a etapa; a revisão usual anual do checklist/PT permanece uma periodicidade documental distinta, com revisão adicional se houver mudança normativa/operacional. Supervisor no protótipo será vínculo explícito a funcionário fictício já listado; preferência por treinamento focado em supervisão de altura além de NR-35 fica como atributo demonstrativo pendente de validação, sem alegar requisito legal ou certificação individual. O simulador referencia APR existente por ID/revisão, informa claramente se está em rascunho ou revisão (sem sugerir aprovação), e exige seleção explícita sem default de funcionário ativo na mesma empresa/unidade; servidor revalida APR, revisão e escopo por ação e só consulta funcionários quando o perfil tem `workers.read`. A referência não cria APR nem avalia riscos/respostas, autentica autoridade ou gera emissão. Nenhum critério técnico foi habilitado. Testes PT/PTE 21/21, ESLint focado, TypeScript e parse JSON aprovados nesta retomada. Ver `docs/PT_PTE_CHECKPOINT.md` e `docs/DECISION_LOG.md`.

2026-10-21 — M22/UI Terceiros: organizado o painel com contadores de links ativos/expirados/revogados, atalhos agrupados em grade responsiva e checklist/convites em painéis expansíveis; detalhes dos convites começam recolhidos e mantêm status visível. TypeScript, ESLint e regressão de Terceiros 18/18 passaram; prévia isolada e servidor principal após reinício autorizado confirmaram o visual atualizado.

2026-10-21 — M22: auditoria de leitores PostgreSQL de Terceiros encontrou no endpoint candidato de reconciliação de políticas a ausência de checagem explícita de `thirdparty.read` e do módulo habilitado. Adicionada negação 403 antes da consulta; revisão dos demais leitores não encontrou outra lacuna nesse gate. Regressão focada 26/26, TypeScript e ESLint passaram. Adaptadores candidatos antigos permanecem desconectados; sem uso do banco persistente.

2026-10-21 — M22: a página agora informa quando a validação de membership/tenant do gate de Terceiros negar acesso, em vez de ocultar a falha com fallback vazio; demais falhas de leitura continuam explícitas. Regressão focada 23/23, TypeScript e ESLint passaram. Sem acesso ao PostgreSQL para esta alteração.

2026-10-21 — M22: teste direto da comparação de membership em PostgreSQL agora cobre vínculo ausente, vínculo suspenso, tenant suspenso e papel divergente, além do caso válido. Testes focados 4/4, TypeScript e ESLint passaram. Nenhuma leitura ou escrita no banco ativo nesta validação.

2026-10-21 — M22: as leituras PostgreSQL do painel e do candidato de Terceiros agora conferem membership/papel/tenant ativos com a autorização da sessão e exigem permissão e módulo habilitado. Teste focado, TypeScript e ESLint passaram. Sem alteração ou escrita no banco ativo.

2026-10-19 — M22: o publicador candidato recompila o manifesto v2 das cinco fontes bloqueadas na transação, compara o fingerprint atual com o confirmado e grava somente as referências/digests do manifesto, atribuição e justificativa. Fixtures de publicação alinhadas ao contrato. Sem conexão ao runtime/adapter e sem execução de testes.

2026-10-19 — M22: registrada a divergência ainda não resolvida entre `scopeId` no publicador TypeScript e `workflow_id`/`third_party_id` UUID na atribuição SQL candidata. O ID do convite não identifica necessariamente um caso. Especificado o contrato mínimo de resolução e lock para futuro adaptador; nenhuma ligação ao runtime.

2026-10-19 — M22: compatibilidade do protótipo PostgreSQL antigo conferida. `third-party-analysis-postgres-candidate.mjs` usa `manager_candidate`, atribuição textual e snapshots prontos; não implementa o contrato atual de extração/transação/IDs UUID nem é chamado pelo runtime. Registrado como spike não reutilizável como adapter atual.

2026-10-19 — M22: documentado que a chave de agrupamento de `buildThirdPartyReport` é apenas de apresentação/histórico. Incluído comentário no código: CNPJ e escopo textual não podem identificar o terceiro/caso nem ser usados como FK, grant ou `workflow_id`. Nenhuma mudança funcional.

2026-10-19 — M22: compilação transacional agora rejeita divergência entre `policyVersion` e `revision` da fonte `policies`; o digest dessa referência já compõe o fingerprint. Consistência candidata apenas, sem tornar a política JSON imutável ou conectá-la ao runtime.

2026-10-19 — M22: reconciliação estática confirmou que o gate produz pendências textuais e as regras têm UUID por revisão, sem código de requisito estável. Atualizado contrato para exigir associação humana explícita a `requirement_code` e emissão do código pelo gate futuro; nenhuma alteração runtime.

2026-10-19 — M22: documentada incompatibilidade entre níveis legados (`inform/authorization/block`) e efeitos/estados candidatos. Qualquer blocker legado mantém aprovação bloqueada; não há equivalência para ingresso condicionado. Registrada também a limitação do parser de chaves sem alterar o comportamento ativo.

2026-10-19 — M22: resultados legados de avaliação reconciliados com os estados candidatos. `pendente` e `nao_aplicavel` não admitem conversão automática; preservação da origem e revisão humana exigidas antes de qualquer estado candidato.

2026-10-19 — M22: proveniência da avaliação legada detalhada. IDs/versões, texto e autor ajudam revisão humana; recibo/digest, contagem de versão, membership/grant e auditoria ainda não formam snapshot transacional/FKs. Conversão automática segue bloqueada.

2026-10-19 — M22: esclarecido que `sameKind.length` do recibo legado é contagem derivada para exibição e não pode alimentar `document_versions.revision`; reconciliação preserva chave opaca do recibo/digest e valida manualmente a cadeia `replacesReceiptId` antes de criar série/revisão candidata. Sem mudança de runtime ou importação.

2026-10-19 — M22: reconciliação do ledger identificou que a chave do recibo não preserva snapshot imutável de empresa/unidade/CNPJ/escopo/categorias do convite. Documentado o contexto mínimo a conferir e preservar numa futura importação manual, com minimização de dados; schema candidato permanece inalterado.

2026-10-19 — M22: detalhadas no plano as cinco fronteiras server-side ainda ausentes para autorização, storage, versionamento, reconciliação e leitura/análise; roteiro ganhou casos de mudança/indisponibilidade da origem JSON entre revisão e confirmação. Sem implementação ou ativação.

2026-10-19 — M22: mapeamento do manifesto para IDs relacionais documentado: `contractorId→third_party_id`, `scopeId→workflow_id` somente após resolução explícita; convite continua origem opaca e exige ponte auditável convite→caso. CNPJ e descrição de escopo não geram FK. Sem alteração de schema/runtime.

2026-10-19 — M22: mapeamento de política/pendências legado explicitado. Getter JSON não escolhe revisão; UUID/versão de regra não é `requirement_code`; blockers textuais e níveis/resultados não equivalem aos efeitos/estados tipados candidatos. Conversão exige publicação imutável e catálogo revisado; sem importação ou runtime.

2026-10-19 — M22: identificado que fontes/fingerprint são registrados apenas no assessment, sem vínculo evidência/fundamento por item `requirement_code`. Documentada a relação necessária para rastreabilidade item a item; nenhum DDL foi alterado.

2026-10-19 — M22: Etapa A descrita como prova estrutural/funcional selecionada concluída e Etapa B como pendente de pontes, citações por requisito e funções confiáveis. Roteiro inclui o limite de cobertura item a item como pré-condição para nova prova; sem schema/runtime alterados.

2026-10-19 — M22: comentário no schema de autoridade alinhado à lacuna documentada: fontes estão no nível do assessment e a Etapa A não prova citações por requisito. Somente comentário SQL, sem alteração executável.

2026-10-19 — M22: adicionada `technical_assessment_item_sources` ao schema candidato com FKs para item e snapshot, fingerprint/revisão da referência, papel tipado, RLS e append-only. Verificador PostgreSQL 17 descartável passou: 33/33 tabelas RLS forçada, 108 FKs, associação válida, snapshots/requisitos ausentes e papel incompatível negados, DML direto negado e cinco históricos imutáveis. Validação de inclusão da referência no agregado e completude por estado segue para Etapa B.

2026-10-19 — M22: definido contrato da validação confiável de citações por requisito: extração e fingerprints canônicos no mesmo lock/transactionId, associação à lista efetivamente lida, cobertura exata da política e papéis de fonte exigidos por estado técnico. Roteiro Etapa B atualizado; função ainda não implementada.

2026-10-19 — M22: `technical_assessment_source_members` passou a registrar os membros individuais de cada grupo capturado; a FK das citações agora exige o membro exato do snapshot. Prova PostgreSQL 17 descartável passou com 34/34 tabelas RLS forçada e 109 FKs; membro não capturado foi rejeitado e UPDATE/DELETE/TRUNCATE bloqueados nos seis históricos append-only. Verificação do digest agregado pela função confiável segue pendente.

2026-10-19 — testes focados M22: ampliados para gate de integração, relatório, análise de política e compilador de manifesto. Corrigida fixture de avaliação fictícia sem `notes` (campo obrigatório usado quando o resultado é pendente). Resultado final: 28/28 aprovados; nenhuma regra/runtime alterado.

## M22 — prova funcional dos candidatos de evidências — 2026-10-19
- Adicionado `examples/app/scripts/verify-m22-evidence-candidates.mjs`, verificador isolado Stage A: sem leitura de env, porta publicada ou volume; remove o container ao terminar.
- PostgreSQL 17 descartável confirmou isolamento RLS entre dois tenants reais da fixture, escopo ausente vazio, ausência de privilégios diretos no papel de evidências, FKs de escopo/hash/event-head, recusa de ASO e mapeamento PGR→PCMSO, e UPDATE/DELETE/TRUNCATE bloqueados nos quatro registros append-only cobertos.
- Corrigida a espera do servidor para ignorar a instância bootstrap temporária da imagem oficial. Nenhum runtime, banco ativo ou arquivo foi alterado.
- Etapa B permanece pendente de funções confiáveis, adapter de storage e fonte única/coerente de membership.

## M22 — prova estrutural isolada dos candidatos de evidências — 2026-10-19
- Etapa A do roteiro passou em PostgreSQL 17 descartável, sem volume/porta publicada; migrations-base 0001/0004/0005 e quatro schemas candidatos aplicaram na ordem documentada.
- Corrigida FK do event head que omitia `object_id`, encontrada durante o parse; repetição completa em container limpo passou.
- Verificados 32/32 tabelas candidatas com RLS habilitada/forçada, 106 FKs e ausência de privilégios diretos DML/SELECT em `document_versions` para papéis candidatos. Container removido.
- Etapa B continua pendente de funções confiáveis, storage e membership autoritativo. Nenhum banco ativo, runtime, PDF ou dado real foi tocado.

## M22 — Hierarquia e limites de autoridade — 2026-10-18
- Documentado o modelo para consultorias e clientes diretos, separando autoridade técnica, gerencial, administrativa, SaaS Master e principal de aplicativo.
- Explicita fluxo operacional: consultoria recomenda, SST do cliente autorizado pode exigir/bloquear, gestão do cliente decide apenas entre ações permitidas; bloqueio obrigatório e parecer técnico permanecem preservados.
- Criada matriz funcional ator × ação, com escopo mínimo, referências normativas versionadas, auditoria e ordem de validação no servidor. Planos/preços/assentos não orientam este trabalho.
- Criado catálogo candidato legível por máquina de ações e efeitos de política, incluindo negação de ações técnicas/gerenciais para aplicativos e requisito explícito para autorização condicionada.
- Evoluído schema candidato isolado com escada de delegação, teto de grants, limite técnico de aplicativos, escopo, auditoria, allowlist de API, rotação/revogação, expiração e cotas transacionais; suspensão revoga grants administrativos sem apagar histórico.
- Mapeado enforcement runtime: limites de empresas, trabalhadores e armazenamento são aplicados; administração de membros, consumo real de créditos de IA e principals API não estão ativos. Limites comerciais de assentos/plano foram postergados pelo usuário.
- Não aplicado ao banco nem conectado ao runtime. Prova PostgreSQL isolada pendente por Docker/WSL inacessíveis; fonte de identidade e integração do middleware seguem pendentes.

## M15 — SaaS Master e gestão das consultorias — 2026-10-10
- Identidade Master separada, estado/limites auditados e suporte restrito a configuração e contagens.
- Suspensão aplicada no servidor e nos portais; limites bloqueiam cadastro e reativação sem apagar histórico.
- 61 testes sequenciais, tipos e ESLint aprovados; telas e fluxos conferidos em desktop/celular. Limites padrão restaurados. M15 aguarda aceite humano.

## M14 — Painel operacional e avisos locais — 2026-10-10
- Prioridades por data, prazos internos com histórico e avisos por usuário/consultoria, sem conteúdo clínico.
- Preferências, leitura e deduplicação locais; geração ao abrir/atualizar, sem envio externo.
- 52 testes, tipos e ESLint aprovados; fluxos e telas desktop/celular conferidos. Avanço para M15 autorizado pelo usuário.

## M13 — EPI e confirmação fictícia — 2026-10-10
- Registro de entregas/itens com snapshot histórico e acesso por consultoria. Administradora gerencia; SST acompanha.
- Link e OTP mock locais, expiração técnica, bloqueio após cinco erros, renovação/cancelamento auditados e comprovante fictício protegido por sessão.
- 44 testes, tipos e ESLint aprovados; cadastro com dois itens, erro de código, confirmação e comprovante conferidos no navegador. M13 aguarda aceite humano.

## M12 — Pendências, correção e reavaliação — 2026-10-09
- Aceite de avanço do M11 registrado. Pendências de terceiros com responsável, comentários, evidências internas e reavaliação restrita ao responsável.
- Reenvios preservam arquivos e protocolos; novas solicitações de correção preservam instruções anteriores. Renovação de link invalida endereço anterior sem apagar histórico.
- 35 testes, tipos e ESLint aprovados; ciclo completo fictício e layout móvel/desktop conferidos no navegador. M12 aguarda aceite humano.

## M11 — Portal local de terceiros — 2026-10-09
- Convites com expiração/revogação e escopo por consultoria, cliente e unidade; envio de PDFs fictícios com protocolo e preservação.
- Administradora/SST acompanham recebimentos; recebimento não representa aprovação documental.
- 28 testes, tipos e ESLint aprovados. Criação, portal, upload e acompanhamento conferidos no navegador. Checkpoint M11 aguarda aceite humano.

## Aplicação — M02 (2026-10-08)
- Criada tela de acesso com conta fictícia de demonstração.
- Implementado cookie de sessão assinado, limite local de tentativas e saída.
- QA de build, lint e TypeScript passou; teste manual de navegador aguarda usuário.
- Código da aplicação em `examples/app`.

## Aplicação — M03 (2026-10-08)
- Associadas três contas fictícias a dois tenants e papéis distintos.
- Escopo de tenant e seções visíveis derivados de vínculos e permissões no servidor.
- Adicionada auditoria temporária de login/logout com filtro por tenant.
- Nove testes automatizados passaram; dados ainda são fixtures em memória, sem PostgreSQL.

## Aplicação — persistência local da auditoria (2026-10-08)
- Eventos de entrada e saída agora são acrescentados em `examples/app/data/audit-log.jsonl` no computador local.
- O arquivo sobrevive ao reinício do servidor e fica excluído do Git.
- Tenants e membros continuam fictícios e em memória; a mudança não adiciona banco de dados.

## Aplicação — M04 cadastro local de empresas (2026-10-08)
- Adicionado cadastro de empresa, contato e múltiplos CNPJs/unidades, com arquivamento e reativação sem exclusão.
- Acesso de criação/alteração fica restrito a administradores; perfil SST pode consultar apenas empresas da própria consultoria.
- Cadastros salvos localmente em `examples/app/data/clients.json`; arquivo ignorado pelo Git.
- Dados locais são texto sem criptografia; usar apenas conteúdo fictício até implementar banco e proteção operacional.

## Aplicação — M05 trabalhadores, funções e riscos (2026-10-08)
- Adicionado vínculo fictício de trabalhador a empresa e unidade com função e categorias ilustrativas de risco.
- Registrado histórico de criação e alteração de situação; arquivamento não apaga o histórico.
- Edição de função/categorias registra os campos alterados no histórico.
- Consulta limitada ao tenant; criação e alteração de situação autorizadas no servidor para a administradora.
- Dados ficam localmente em `examples/app/data/workers.json`, sem criptografia; tela pede conteúdo fictício e não inclui campos médicos.

## Aplicação — M06 documentos SST e versionamento local (2026-10-08)
- Adicionado envio local de PDF até 7 MB com metadados, empresa/unidade, validade e categorias demonstrativas.
- Substituição cria nova versão e preserva as anteriores; arquivamento mantém metadados e arquivos.
- Downloads exigem sessão e permissão do tenant; arquivos ficam fora de `public` e são enviados como anexo.
- Não há antivírus, criptografia, pré-visualização ou uso com arquivos reais; usar somente documentos fictícios.

## Aplicação — M07 avaliação configurável e evidências (2026-10-08)
- Adicionado cadastro de critérios informado pela equipe com fonte, jurisdição, versão, vigência e responsável pela revisão.
- Revisões substituem a regra vigente sem apagar a anterior; não há regra normativa pré-carregada.
- Adicionadas avaliações humanas append-only com resultado, justificativa, evidência, responsável e próximo passo para pendência/incerteza.
- Registros preservam snapshots da versão do critério e do documento; evidências podem referenciar PDF da mesma consultoria.
- Sem decisão automática, prazos presumidos ou parecer de conformidade; arquivo local sem criptografia, somente dados fictícios.
- Corrigido aviso de pré-renderização: a data corrente é calculada no segmento autenticado do servidor e enviada como propriedade da tela.

## Aplicação — M08 rascunho assistido de PGR (2026-10-08)
- Iniciada área de rascunho local com empresa/unidade, atividades, riscos descritos por pessoas e plano de ação.
- Administradora e perfil SST podem criar e editar rascunhos; envio para revisão e revisão interna ficam registrados no histórico e na auditoria.
- Cópia para impressão inclui identificação de demonstração e aviso de revisão profissional; sem assinatura nem avaliação automática.
- QA de lint, tipos e build passou; conferência manual aguarda usuário. Ver `M08_CHECKPOINT.md`.

## 1.2.0 — 2026-10-08
- Reconstruído pacote após perda do computador, com base nas decisões e requisitos preservados na conversa.
- Consolidado roadmap de 22 milestones M00–M21.
- Incluídos instruções Codex, requisitos, segurança, pipeline IA, design system, QA, UAT, perguntas abertas e schema inicial.
- Esta versão é uma reconstrução e não garante identidade byte a byte com o ZIP v1.1 anterior.

## Aplicação — retomada da conferência M08 (2026-10-08)
- Exibição expandida do conteúdo completo das versões anteriores de PGR.
- Ajustado teste de consulta de empresas pelo perfil SST e isolada a auditoria dos testes em pasta temporária.
- Nove testes, lint, tipos e build passaram; conferido estado vazio de Documentos/PGR no navegador. Ciclo completo e aceite humano permanecem pendentes.

### Correção de formulários — 2026-10-08
- Removido encType explícito dos formulários de envio e substituição de PDF: as funções de action do React definem automaticamente método e codificação.
- Verificação de tipos passou; ESLint do arquivo alterado passou.


### Aceite M08 — 2026-10-08
- Aprovação explícita do usuário registrada no checkpoint e no registro de decisões.
- Próxima etapa do roadmap: M09, PCMSO e fluxo médico responsável.


### M09 — 2026-10-09
- Escopo documental do PCMSO aprovado; papel médico específico e vínculo por empresa/unidade implementados.
- Conteúdo e versões restritos ao coordenador; administradora/SST acompanham apenas andamento.
- Revisão interna fictícia, preservação de versões, auditoria sem conteúdo e bloqueio de edição após envio.
- 13 testes, tipos e ESLint passaram; conferência visual e funcional dos perfis realizada. Aceite humano do M09 pendente.

### M10 — ASO, exames e aptidão fictícios — 2026-10-09
- Escopo autorizado pelo usuário e implementado com acesso médico por unidade, projeção administrativa e versões preservadas.
- Vinte testes e checagem de tipos passaram; conferidos criação, segunda versão, envio, revisão e perfis no navegador.
- Usuário solicitou testar; conta administradora aberta em ASO. M10 aguarda aceite humano antes de M11.




### Aceite M15 — 2026-10-11
- Usuário aprovou explicitamente o M15 após solicitar o teste do painel Master.
- Aceite registrado no checkpoint e no registro de decisões. Próximo marco: M16 — planos, módulos, limites e créditos simulados, sem cobrança real.


### M16 — fatia demonstrativa de planos — 2026-10-11
- Planos mensal/anual, adicionais, limites de cadastros aplicados no servidor e consumo simulado com histórico, saldo e revisão.
- 64 testes, tipos, ESLint dos arquivos alterados e build aprovados. Fluxo de plano/consumo conferido no navegador.
- Módulos e armazenamento real ainda sem bloqueio comercial; nenhuma cobrança ou integração. Aceite desta fatia pendente; M17 não iniciado.


### M16 — módulos e armazenamento físico — 2026-10-11
- Continuidade autorizada após a primeira fatia. Controle no servidor para novas operações EPI/terceiros/prazos e preferências, preservando consulta histórica.
- Cota por bytes físicos de PDFs e versões nas duas áreas; reserva simulada compartilha a cota. Bloqueio de upload/substituição/reenvio e downgrade acima da capacidade.
- 68 testes na execução conjunta final, tipos, ESLint e build aprovados. Uma execução conjunta anterior apresentou falhas em terceiros de causa inicial não confirmada; risco registrado no checkpoint.
- Configuração EPI restaurada após teste no navegador. Aceite humano do complemento pendente.


### Aceite M16 e M17 — 2026-10-11
- Usuário aprovou M16 e autorizou continuidade explicitamente. Aceite registrado nos dois checkpoints M16.
- M17 implementa assinaturas/cobranças fictícias, falha, reabertura, pagamento, cancelamento, estorno integral, disputas e conferência de extrato, com revisão, idempotência e histórico por consultoria.
- 74 testes aprovados na execução temporária fora da restrição local; tipos, ESLint e build aprovados. Execuções restritas apresentaram erros EPERM, inclusive fora do OneDrive; evidências e limites registrados no checkpoint.
- Fluxo manual de início/falha/pagamento/conferência e revisão desktop/celular executados. Nenhum serviço externo ou transação real. M17 aguarda aceite antes do M18.

### M18 — página pública e editor Master (2026-10-11)
Página /site, rascunho e prévia restritos, publicação local explícita, validação e histórico. Preços fixos do catálogo; nenhuma hospedagem externa. 78 testes, tipos, lint e build aprovados. Roteiro em M18_CHECKPOINT.md; aguarda aceite humano.


### M19 — primeira fatia local (2026-10-11)
Bancada Master para contratos fictícios de e-mail/OTP, cobrança e IA; assinatura interna, cenários de duplicação/recusa/falha, idempotência de requisição e histórico. 82 testes, tipos, lint e build aprovados. Provedores externos ainda não conectados; M19 não concluído. Ver M19_CHECKPOINT.md.


### M19 — receptor Asaas preparado (2026-10-11)
Endpoint desativado por padrão, autenticação por token de webhook, caixa imutável com deduplicação entre processos e vínculo de cobrança no servidor. Controle Master para registrar/repetir evento fictício. 87 testes aprovados, tipos/lint/build verificados. Nenhuma conexão externa ativada; ver M19_ASAAS_RECEPTOR_CHECKPOINT.md.


### M19 — códigos inteiramente fictícios (2026-10-11)
Por decisão explícita do usuário, manter demonstração sem contas externas. Fluxo Master de código local: validade, tentativas, uso único, substituição e histórico. 90 testes, tipos/lint/build aprovados; ver M19_FICTICIO_CHECKPOINT.md.


### M20 — primeira fatia de resiliência fictícia (2026-10-11)
Fila Master com três tentativas, intervalos, falhas preservadas e caixa de saída local. Nenhum envio externo. 94 testes, tipos/lint/build aprovados; M20 ainda tem governança pendente. Ver M20_CHECKPOINT.md.


### M20 — governança operacional fictícia (2026-10-11)
Incidentes com revisão/histórico, retenção simulada e bloqueio de descarte, exportação fechada com SHA-256. Nenhum descarte implementado. 98 testes, tipos/lint e build isolado aprovados. Ver M20_GOVERNANCA_CHECKPOINT.md.


### M20 — conferência de referências por consultoria (2026-10-11)
Reutiliza critérios M07; histórico de revisão, metadados/vigência e versão conferida exigidos antes de avaliar. Master sem revisão técnica. 102 testes, tipos/lint e build isolado aprovados. Ver M20_REFERENCIAS_CHECKPOINT.md.


2026-10-11 — M20: foco visível reforçado e indicadores em coluna em telas estreitas; evidência de governança a 320 px. Build bloqueado por arquivo local (EPERM).

2026-10-11 — M20: build isolado por identificador validado, sem apagar saída travada; build aprovado e validação obrigatória conferida por teclado.

2026-10-11 — M20: mensagens persistentes de status e progresso nas três áreas, aria-busy na fila e carregamentos identificados; fila validada em 320 px, build e lint aprovados.

2026-10-11 — M20: build de produção conferido em localhost:3001; seis medições HTTP públicas 200 e evidência visual da governança. Servidor temporário encerrado; sem alteração de código.

2026-10-11 — M20: checklist e revisão de referências passam a compartilhar o dia civil de São Paulo. Testes de fronteira de datas; suite 104 aprovada.

2026-10-11 — M20: cenário transitório conferido pela interface visível, duas falhas e sucesso na terceira; entrega local sem duplicação e histórico preservado.

2026-10-11 — M20: controles de histórico mostram contexto do registro no texto e nome acessível; teclado, lint e build aprovados.

2026-10-11 — M20: roteiro consolidado de aceite demonstrativo, estado atual e limitações reunidos em M20_ACEITE.md. Sem mudança de código nesta etapa.

M20 — aceite humano explícito registrado: APROVO O M20. Demonstração aprovada; limitações preservadas.

M21 iniciado por autorização explícita. Baseline de regressão: 104 testes aprovados; portões de lançamento e próxima fatia de backup registrados. Empresa fictícia completa adiada conforme pedido.

2026-10-18 — M22: aceite humano da fatia de contrato candidato da decisão do gestor registrado; módulo ainda desconectado do runtime.

2026-10-18 — M22: schema/adaptador candidatos da decisão do gestor e prova PostgreSQL descartável aprovados; nenhuma migration ativa ou nova permissão.

2026-10-18 — M22: aceite humano do modelo de vínculos cliente/consultoria/terceiras registrado.
2026-10-18 — M22: reconciliação autenticada read-only confirmou referência empresa/unidade da política de rigor no PostgreSQL persistente (1 correspondência, 0 divergências). Política segue no JSON; histórico próprio ausente e `readyForImport=false`; sem importação, atestação ou cutover.
2026-10-18 — M22/PGR: reconciliação somente leitura retornou `already_reconciled` (3 inventários, 3 revisões, 68 eventos); 0 conflitos/extras e 0 itens de risco estruturados. Nenhuma escrita; não reimportar lote.
2026-10-18 — M22/PGR: usuário aprovou o checkpoint da reconciliação somente leitura; itens de risco estruturados aguardam conteúdo e validação do profissional.
2026-10-18 — M22/PGR: rótulos e avisos deixam explícito que responsável/registro informado não é identidade ou habilitação verificada pelo sistema; sem alteração de dados.
2026-10-18 — M22/PGR: typecheck e ESLint focado passaram para os avisos de identidade declarada; conferência visual humana pendente.
2026-10-18 — M22: reconciliação read-only de rigor passa a expor códigos de bloqueio de importação separadamente do status da consulta; sem conexão de escrita ou mudança de dados.
2026-10-18 — M22: contrato isolado do gestor diferencia correção pré-ingresso, autorização condicionada com plano e devolução à SST; pendências ficam abertas, nível de bloqueio impede exceção; sem runtime/cadastro/decisão persistida.
2026-10-18 — M22: documentado modelo de decisor previamente cadastrado, grants por empresa/unidade, concessão administrativa separada e revogação histórica; ainda sem schema/runtime porque não há origem autoritativa de contas nem política definida para concedentes.
2026-10-18 — M22: schema SQL candidato de grants ligado por FK aos vínculos/empresas/unidades das migrations e prova PostgreSQL descartável aprovada; sem migration ou integração runtime/autenticação.
2026-10-18 — M22: inspeção confirmou login demo exclusivamente por contas de env; membership PostgreSQL não autentica. Cadastro/convite de usuário e autoridade de provisionamento seguem inexistentes; decisão do cliente permanece desligada.
2026-10-18 — M22: matriz de autoridade operacional alinhada ao catálogo candidato. Consultoria não encaminha fluxo como se fosse decisão do cliente; requisito SST e decisão gerencial pré-ingresso separados; automação auxiliar explicitamente não decisória; delegação administrativa limitada ao teto próprio; metadados opcionais de vigência final/referência documental. Comercial postergado. Sem alterações no runtime ou banco; Docker/WSL ainda impedem prova PostgreSQL. Ver `docs/M22_MATRIZ_ACOES_AUTORIDADE.md` e `docs/M22_CHECKPOINT.md`.

2026-10-18 — M22: especificado contrato candidato de grants por ação/escopo, com identidade autenticada, limites de delegação, expiração/revogação, validação transacional e auditoria. Corrigida política de rigor: `block` não admite exceção gerencial; ingresso condicionado exige `conditional_allowed` e mantém a pendência aberta. Sem runtime ou banco. Ver `docs/M22_CONTRATO_GRANTS_ACAO_ESCOPO.md`.

2026-10-18 — M22: reconciliação documental confirma que schemas de gestor/admin ainda representam papéis, não grants por ação com versão/validade, e não impõem append-only aos eventos por trigger. Hierarquia ajustada para postergar planos/capacidade comercial e manter SaaS Master em ciclo de vida/suporte. Sem runtime/banco.

2026-10-18 — M22: proposto modelo relacional de autoridade: presets de papel emitem grants individuais por ação/escopo/validade; política, atribuições, decisões/fontes e eventos ficam versionados e separados. Incluídas transações e invariantes de concorrência, revogação e bloqueios. Documento candidato sem SQL/runtime; PostgreSQL aguarda Docker/WSL.

2026-10-18 — M22: matriz candidata define quem pode conceder grants por ação e seus escopos mínimos, incluindo consultoria atribuída pelo cliente, SST, gestor/dono, hierarquia administrativa e APIs. Registrados pontos pendentes de validação de qualificação e concessão de atendimento. Sem SQL/runtime/banco.

2026-10-18 — M22: preparado schema SQL candidato de grants operacionais, separado das migrations, com catálogo/presets, grants individuais, registradores do cliente, atribuições SST, versões de política, decisões/fontes, auditoria, RLS e triggers de imutabilidade. Inspeção estática apenas; faltam funções de autorização, FKs autoritativas de Terceiros e prova PostgreSQL. Não aplicado.

2026-10-18 — M22: schema relacional candidato preparado e revisado estaticamente. Escopo SST/mobilização exige unidade explícita sem herança futura; autoridade do cliente em tenant de consultoria exige designação separada; unidades vinculadas por FK composta tenant/unidade/empresa; eventos e decisões têm bloqueio candidato de mutação. Sem parse/execução PostgreSQL, testes ou integração.

2026-10-18 — M22: criado roteiro de prova PostgreSQL descartável sem execução. Revisão estática do candidato achou e corrigiu política RLS tenant-scoped aplicada por engano ao catálogo global de ações. Sem migrations, banco ou testes.

2026-10-18 — M22: revisão estática acrescentou referência de autorização do representante do cliente em grants técnicos/gerenciais e FK de escopo composto na auditoria. Roteiro de prova separado em parse/estrutura e funções/concorrência; etapa funcional não pode rodar até existir camada server-side. Sem execução/testes.

2026-10-18 — M22: incluída ação explícita `thirdparty.policy.manage`; admin de tenant não recebe configuração SST por administrar usuários, e gestor não herda esse poder. Política por unidade agora usa início efetivo/versionamento e decisão FK composta da mesma empresa/unidade; publicação registra publicador, revisor e designação do cliente quando aplicável. Sem execução PostgreSQL.

2026-10-18 — M22: fluxo candidato de publicação de política SST documenta preparação, revisão, início efetivo, auditoria, reavaliação de casos e preservação de bloqueios. `thirdparty.policy.manage` separado dos papéis SST, gestor e admin; roteiro inclui testes de escopo e efeito histórico (não executados).

2026-10-18 — M22: definido ciclo de vida de membership, representante do cliente, grants, atribuições SST e qualificação. FKs compostas candidatas garantem escopo tenant/empresa/unidade coincidente para representante, atribuições e política. Registrada lacuna de ator de sistema para eventos de revogação causados por suspensão; nenhuma implementação ou prova executada.

2026-10-18 — M22: separado o efeito versionado da política do estado atual da avaliação técnica por requisito. Bloqueio obrigatório não admite exceção gerencial, mas pode ser resolvido em avaliação nova favorável baseada em evidência, sem apagar histórico; ingresso condicionado segue apenas para pendência configurada como permitida e mantém obrigação aberta. Catálogo/contratos candidatos refinados; runtime e banco inalterados.

2026-10-18 — M22: acrescentado ao schema SQL candidato o modelo de avaliações técnicas append-only por revisão e item de política; decisões exigem referência composta à avaliação e ao mesmo escopo/política. Manifesto de fontes alinhado aos grupos/revisões/digests do compilador candidato existente, sem presumir relação fonte→requisito ou mapeamento `scopeId`/`contractorId`; FKs autoritativas pendentes. Roteiro atualizado; nenhuma prova PostgreSQL foi executada.

2026-10-18 — M22: criado plano curto para fechar a fatia operacional de Terceiros sem ampliar o modelo indefinidamente. Reconciliação encontrou divergência 4×5 grupos entre compilador e readiness, sem tabela canônica de `scopeId`, ID estável de terceira ou equivalência confirmada de versão/pendência. Bloqueios registrados para resolver antes de congelar o schema e provar em PostgreSQL descartável.



2026-10-18 — M22: definido contrato lógico para IDs persistentes de terceiro/caso, catálogo de códigos estáveis de requisito e resolução de policyVersion pela chave tenant/empresa/unidade/versão. Nenhum dado foi associado automaticamente; runtime e migrations permanecem intactos. Ver docs/M22_CONTRATO_CASO_TERCEIRO.md.

2026-10-18 — M22: schema SQL candidato agora contém third_parties, third_party_cases e catálogo imutável de códigos de requisito por unidade; grants, atribuições, avaliações, decisões e auditoria recebem FKs de escopo compostas. Sem migration, runtime, escrita no banco, prova PostgreSQL ou testes. Associações a convites existentes seguem explícitas, sem deduplicação automática.

2026-10-18 — M22: compileTransactionalAnalysisManifest une os cinco marcadores autoritativos da mesma transação ao manifesto v2 e fingerprinta o transactionId. Publicador ainda precisa chamar o helper. Docker CLI acessível via elevação; app-db-1 saudável. Sem prova SQL ou testes.

2026-10-18 — M22: fingerprints do manifesto v2 usam serialização JSON canônica, mantendo digest estável quando a persistência altera a ordem das chaves dos objetos. Sem teste executado.
