# Níveis de acesso e Passaporte Digital de SST — checkpoint de proposta

**Data:** 2026-11-15  
**Estado:** proposta de produto e sequência técnica; sem mudança de runtime, banco, permissões ou dados de trabalhadores.  
**Objetivo:** comparar a proposta de níveis 01–03 com a implementação atual e definir etapas seguras para preparar o recurso.

## Resumo

O app tem peças que podem ser reaproveitadas: perfil de trabalhador/campo, relatos de desvio com foto, DDS com lista de participantes e assinaturas na tela, início de APR/PT/PTE, manifesto PWA e filas offline limitadas. Não tem Passaporte Digital, QR, portal individual do colaborador, presença por leitura, cache offline do aplicativo inteiro, central unificada de assinaturas ou permissões configuráveis por usuário.

O primeiro trabalho de código deve estabelecer identidade e autorização por pessoa/escopo e ligar uma conta autenticada ao cadastro correto de trabalhador. Depois disso, pode-se preparar uma carteira de dados mínimos com fontes e estados de validação. QR, sincronização offline e bloqueios operacionais dependem dessa base.

## Inventário confirmado no app

- A autorização em runtime usa uma matriz fixa por papel em examples/app/src/lib/tenant-access.ts. Existem papéis de trabalhador e Campo; trabalhador pode relatar desvio, e Campo pode acessar funções selecionadas de DDS/checklist/desvio. Não há painel ativo de exceções individuais.
- O cadastro em examples/app/src/lib/worker-store.ts guarda dados operacionais básicos e alguns estados de treinamento. Não registra foto, CPF parcial, matrícula do RH, datas de validade ou vínculo autenticado entre conta individual e pessoa cadastrada. O estado de treinamento não comprova validade.
- A rota de trabalhadores é de administração da consultoria e está rotulada como demonstração; não é portal pessoal do trabalhador.
- A sugestão de IA para desvio é marcada como simulada e declara não analisar a imagem, classificar risco ou confirmar conformidade.
- DDS permite participantes cadastrados e nomes manuais, além de assinaturas desenhadas na tela. Não usa QR nem fila offline própria.
- Há filas locais limitadas para checklist e EPI. Existe manifesto e ícones PWA; não foi encontrado service worker nem mecanismo de cache do app para abrir e navegar amplamente sem rede.
- A preparação de APR/PT/PTE não emite autorização operacional. A avaliação de prontidão mantém a emissão bloqueada enquanto faltam critérios técnicos e vínculos autenticados.
- A área chamada “Confirmações” é voltada a propostas de vínculo, não a uma caixa única de documentos aguardando assinatura.
- Há uma proposta M22 de permissões por ação e escopo em docs/M22_CONTRATO_GRANTS_ACAO_ESCOPO.md, mas ela ainda é candidata e não está ligada ao runtime.

## Matriz funcional validada com a proposta do usuário

A estrutura abaixo foi conferida com os requisitos informados pelo usuário. A validação é funcional e de arquitetura; ainda não é configuração do sistema nem aceite técnico, médico, jurídico ou normativo.

| Nível/trilha | Escopo padrão | Pode preparar/fazer | Limites obrigatórios |
|---|---|---|---|
| 01 — Colaborador | A própria identidade, registros e documentos atribuídos | Ver Passaporte mínimo; receber e assinar/confirmar documentos designados; relatar desvio/quase-acidente; consultar seu histórico permitido | Não consulta outros trabalhadores; não altera treinamentos ou ASO; não libera atividade; dados clínicos e CPF completo ficam fora do QR |
| 02 — Líder/encarregado | Equipe, atividade, empresa e unidade explicitamente atribuídas | **Herda as ações do Nível 01**; registrar DDS/presença; ler QR; abrir e gerir rascunhos APR/PT/PTE e encaminhar para revisão; conduzir operação de campo | Não altera evidência de treinamento/ASO; não substitui revisão técnica; não supera bloqueio obrigatório; liberação operacional só com grant específico e todas as condições exigidas satisfeitas |
| 03A — Dono/gerente do cliente ou tenant | Administração delegável do próprio tenant e escopos sob sua autoridade | Acessar o painel administrativo; conceder, limitar, expirar e revogar permissões por pessoa/ação/empresa/unidade; consultar auditoria de acessos | Não recebe autoridade técnica, médica ou legal pelo cargo; não concede acima do próprio teto; não elimina bloqueio técnico obrigatório |
| 03B — TST/engenheiro de SST | Empresas, unidades, módulos e atividades atribuídos | Preparar/revisar conteúdo técnico e acompanhar operação conforme qualificação, atribuição e grants vigentes | O título sozinho não concede administração de usuários; não acessa detalhes médicos sem permissão separada; não transmite ao governo apenas por ser TST/engenheiro |
| Trilha clínica — profissional habilitado | Trabalhador e escopo clínico autorizado | Acessar/registrar os dados de saúde necessários à função autorizada | Acesso separado e mínimo; dono e líder não recebem acesso clínico por herança; não usar o QR para revelar exames ou prontuário |
| Ação governamental futura — operador designado | Empresa/CNPJ, evento, ambiente e payload aprovados | Somente após integração oficial, grant específico, autorização vigente do cliente e aprovação do conteúdo exato | **Desativada hoje**; permissão administrativa geral ou papel de TST não bastam; mudança do conteúdo invalida a aprovação; revogação bloqueia o envio |

**Herança e autoridade:** o Nível 02 herda as capacidades operacionais de base do Nível 01. Nível 03 não significa acesso universal automático: cada trilha recebe apenas as ações necessárias. O dono administra concessões dentro de sua autoridade; não assina decisões técnicas ou médicas por esse motivo. A liberação de campo é uma ação própria, diferente de criar/editar rascunho, revisar tecnicamente ou conceder acesso.

**Escopo e autorização:** a matriz funcional foi alinhada ao contrato candidato M22 de concessões por ação e escopo. Na futura implementação, papel será um conjunto inicial de permissões; a autorização efetiva dependerá de identidade autenticada, grant ativo, validade, tenant, empresa/unidade/atividade e atribuição vigente, todos revalidados no servidor. A consultoria e o cliente mantêm autoridades separadas. O envio governamental exige uma camada adicional por cliente, serviço, ambiente e conteúdo.

**Status:** validada quanto à separação de funções descrita pelo usuário; pendente de aprovação de responsáveis do produto e profissionais competentes, reconciliação detalhada do catálogo de ações M22, testes de autorização e implementação. Nenhum papel/grant foi alterado no runtime.

## Mapeamento de ações e permissões — candidatos, não ativos

A leitura do catálogo M22 candidate version 1 e das permissões atuais confirmou que ainda não há um catálogo completo para estes níveis. O arquivo schemas/operational-authority-catalog.json tem grants de tenant e fluxo de terceiros; não contém ações para Passaporte, DDS, APR/PT, ASO ou eSocial. O schema SQL de grants também é candidato sem funções de emissão/revogação conectadas ao runtime.

Foi preparado schemas/operational-authority-catalog-v2-candidate.json como proposta separada: preserva os 15 action codes e 10 papéis da versão 1 e acrescenta 26 ações candidatas. Todas as novas ações estão marcadas runtimeEnabled=false. A estrutura passou por parse JSON, checagem de preservação das entradas antigas, referências entre papéis/ações e cobertura das dimensões de escopo. A busca confirmou que o app e as migrations não referenciam o arquivo v2.

A compatibilidade com SQL continua pendente: o DDL M22 atual só representa dimensões e raízes relacionais de terceiros/casos; ainda faltam escopos e raízes persistentes para trabalhador, documento, DDS, atividade/APR/PT, serviço, evento e ambiente, além das trilhas novas. O candidato v2 não pode ser aplicado nem usado para conceder acesso enquanto essa dependência não for resolvida.

As permissões do app, como workers.manage, dds.manage, documents.review, aso.manage e safety.risk_analysis.manage, são verificadas hoje por perfil fixo. Elas não são ainda grants individuais com ação, escopo, validade, delegação e auditoria M22. Não converter uma permissão genérica em autoridade nova sem decompor o efeito que ela permite.

## Dependências de persistência — inspeção do runtime

Inspeção estática das migrations `0001`–`0022` e dos stores da aplicação identificou esta situação. Isto descreve o estado do código; não é prova de implantação ou migração em banco de produção.

| Domínio | Estado encontrado | Consequência para a matriz |
|---|---|---|
| Tenant, empresas/unidades e vínculos | Há raízes PostgreSQL e migrations. | Podem servir de base de escopo após autenticação/membership real. |
| Trabalhadores | `worker-store.ts` usa arquivo JSON. `tenant-worker-quota-candidate.sql` define alternativa candidata isolada, ainda não é migration nem caminho usado pelo store. | Não emitir QR confiável nem vincular usuário a trabalhador até persistir e verificar identidade/vínculo. |
| DDS/presenças | `dds-store.ts` usa arquivo JSON; presença pode referenciar workerId, mas não há FK relacional. | Leitura QR/offline e auditoria de presença não ficam garantidas por banco. |
| APR/checklists | `safety-operations-store.ts` usa arquivo JSON, inclusive APRs, respostas e assinaturas. | Grants por `aprId`/atividade não têm alvo relacional autoritativo no runtime. |
| PT/PTE | Migrations `0011` e `0012` criam rascunhos tenant-scoped e revisões imutáveis PostgreSQL; o store usa PostgreSQL quando disponível e fallback JSON. Status é `draft_demo`. | Persistência de rascunho existe parcialmente; não equivale a revisão técnica, liberação ou autorização operacional. `apr_id` é texto, não FK para APR. |
| ASO/saúde | Existem stores e permissões de módulo no app, mas nenhuma raiz ASO/saúde foi identificada nas migrations `0001`–`0022`; a inspeção não confirmou integração relacional autoritativa. | Acesso clínico precisa de domínio separado, mínimo e restrito; não expor status como se fosse validado por esta matriz. |
| Login e grants individuais | O login demonstrativo não autentica memberships PostgreSQL; o catálogo M22 e o v2 estão desligados do runtime. | Nenhum dos novos grants pode ser tratado como controle efetivo; negação por padrão requer identidade e autorização server-side integradas. |

### Ordem técnica recomendada

1. Fechar identidade real, membership ativa, escopo tenant/empresa/unidade e ciclo de suspensão/revogação.
2. Migrar trabalhadores e vínculos para PostgreSQL com histórico; reconciliar o DDL candidato de quota sem aplicá-lo isoladamente.
3. Persistir documentos/evidências e DDS/presenças com chaves estrangeiras, revisão, auditoria e estratégia de sincronização idempotente.
4. Persistir APR e atividade; ligar referências do PT/PTE por FK e separar rascunho, revisão, aprovação e liberação.
5. Definir persistência clínica ASO sob acesso mínimo e segregado, com retenção e auditoria apropriadas.
6. Só então adaptar trilhas/escopos do DDL de grants, conectar verificações no servidor e provar isolamento, expiração e revogação em PostgreSQL descartável.
7. Implementar Passaporte/QR/PWA e modo offline usando somente dados mínimos assinados e datados; estado offline não pode liberar atividade quando for necessária confirmação atual.

Nenhuma migration, integração runtime, conta ou grant foi criada nesta etapa. Esta ordem evita conceder permissões por recurso cujo identificador ainda não tem fonte persistente autoritativa.

| Grupo de ações proposto | Exemplos de identificadores para discussão | Escopo que deve ser exigido | Observação |
|---|---|---|---|
| Colaborador — carteira e documentos próprios | worker.passport.read_own; documents.assignment.read_own; documents.sign_assigned; deviation.report | tenant + própria identidade; documento atribuído | O vínculo entre conta e trabalhador deve vir de fonte verificada. Assinatura/ciência é evento separado da leitura. |
| Liderança — campo | worker.passport.read_assigned; dds.create; dds.attendance.scan; dds.attendance.review_offline; safety.apr.draft.create; safety.apr.submit_review; workpermit.draft.create; workpermit.draft.update | tenant + empresa + unidade + equipe/atividade quando houver | O preset do Nível 02 inclui os grants do Nível 01. Registros offline permanecem pendentes de sincronização/revisão; não viram liberação automática. |
| SST/engenharia — revisão técnica | worker.evidence.read_status_assigned; worker.evidence.review; safety.apr.technical_review; workpermit.technical_review; safety.risk_analysis.manage | tenant + empresa + unidade + atividade/fluxo atribuído | Qualificação e atribuição são verificadas separadamente do grant. Revisão técnica não é concessão administrativa nem decisão médica. |
| Liderança autorizada — decisão operacional | workpermit.release | tenant + empresa + unidade + atividade/PT específica | Só depois de checklist e evidências atuais. Bloqueio obrigatório não pode ser contornado por grant de liderança. Confirmar quem pode liberar e em quais tipos de PT. |
| Dono/admin do tenant — administração de acessos | tenant.membership.manage; tenant.authorization.grant | tenant próprio; no máximo empresa/unidade dentro do teto do concedente | O catálogo já tem estes códigos. tenant_owner aparece com grantableThroughRuntime=false: tratar o titular como bootstrap provisionado, não permitir autoatribuição ou concessão do papel de dono pelo painel. |
| Trilha clínica | medical.aso.read_status_assigned; medical.aso.manage_assigned | tenant + empresa/unidade + trabalhador/atendimento atribuídos | Identificadores candidatos. A tela do líder recebe, se aprovada, apenas o sinal mínimo de status; não recebe exames/detalhes do ASO. |
| Envio governamental futuro | government.event.prepare; government.event.review; government.event.client_approve; government.event.transmit; government.event.receipt.read | tenant + CNPJ/estabelecimento + serviço/evento + versão de leiaute + ambiente | Todos são novos candidatos. Envio permanece desligado; autorização legal do cliente e aprovação do conteúdo exato são controles separados do grant de usuário. |

Os nomes acima são rótulos de trabalho para decompor requisitos; ainda não foram adicionados ao catálogo global nem devem ser enviados pelo navegador como autoridade. Antes de adotá-los, reconciliar nomes, trilhas e validações com o catálogo M22, definir exigências de escopo por ação e provar as transições em banco descartável.

### Regras de concessão derivadas da matriz

- Presets de acesso são conveniência para atribuir vários grants, não uma permissão genérica. Cada grant conserva ação, usuário, escopo, vigência, concedente, grant-base, revisão e histórico.
- O dono provisionado do tenant pode delegar somente ações abaixo do próprio teto. SaaS Master não concede autoridade operacional sobre clientes.
- Dono da consultoria/tenant e representante do cliente não são a mesma autoridade. Um administrador da consultoria não pode autorizar transmissão, aprovar conteúdo ou decidir liberação em nome do cliente.
- Para eSocial, separar preparação, revisão técnica, aprovação do representante da empresa, autorização do canal e transmissão. O cliente pode desligar/revogar a autorização; mudar o payload invalida a aprovação anterior.
- Manter separado role preset de Nível 03 para TST, administração do tenant, profissional de saúde e operador de transmissão. Não herdar ASO ou eSocial por estar no “Nível 03”.
- A concessão/revogação é reavaliada no servidor em cada ação; escopo ausente, conta suspensa, atribuição vencida, grant revogado ou política desatualizada resultam em negação e auditoria.

## Passaporte e identidade — dados e regras a especificar

1. Vincular trabalhador ↔ conta autenticada usando fonte confiável e processo de confirmação. Nome digitado, selfie ou posse de celular não devem, isoladamente, provar identidade ou poderes.
2. Cada habilitação deve ter tipo, datas, documento/fonte, origem, quem conferiu, estado (não informado, pendente, validado, vencido, revogado) e histórico. Validade só será calculada com regra e evidência aprovadas; não inferir vencimento pela NR ou por texto livre.
3. Separar o resumo que pode ser consultado pelo líder dos documentos e dados médicos. A tela de campo deve exibir apenas o mínimo necessário para a decisão autorizada; não exibir exames ou detalhes clínicos.
4. O semáforo resume evidências atuais e deve mostrar pendências, origem e data da última sincronização. “Desconhecido” ou “desatualizado” nunca vira “apto”.
5. O QR deve carregar identificador opaco assinado, sem nome/CPF/ASO em claro. Preferir validade curta, uso definido e proteção contra repetição. Captura de tela não pode se tornar credencial permanente.
6. Em contingência sem celular, permitir busca em lista previamente sincronizada e escopo autorizado. Novo trabalhador fica provisório e bloqueado para liberação até confirmação por fonte responsável; não cadastrar CPF/selfie no campo como atalho de verificação.

### Limite do uso offline

A assinatura criptográfica permite verificar que um QR foi emitido pelo sistema; ela não informa revogação ocorrida depois da última sincronização. Em modo offline, o app deve mostrar horário e idade dos dados, expiração da credencial e estado “verificação limitada offline”. Operações sensíveis exigem atualização quando a política de frescor definida pelo responsável não puder ser atendida. Nenhum bloqueio pode ser apresentado como verificação governamental em tempo real sem comunicação com a fonte.

## Sequência de implementação e aceite

### Etapa 0 — decisões e autoridade

- Definir quem provisiona/valida identidade do trabalhador, habilitações e ASO; qual fonte documental é aceita; como corrigir/revogar.
- Reconciliar papéis existentes e proposta Nível 01–03 com M22. Definir ações delegáveis, escopos, concessores e limites; preservar admin de SaaS separado.
- Definir retenção, proteção de dados locais, dispositivos perdidos e política de atualização offline.
- **Aceite:** matriz funcional conferida com a proposta do usuário; validação por responsáveis do produto e profissionais técnicos/médicos segue pendente. Nenhuma permissão de produção é criada automaticamente.

### Etapa 1 — autorização por usuário e escopo

- Primeiro fechar o catálogo de action codes descrito nesta proposta, reconciliando-o com M22 e definindo os escopos obrigatórios. Depois conectar grants server-side por ação, tenant, empresa/unidade, validade e revogação; auditoria append-only e negação por padrão.
- Painel do dono para conceder/revogar dentro de sua própria autoridade; mudança com justificativa e histórico.
- Provar usuário sem grant, escopo de outra empresa, grant expirado/revogado, suspensão e tentativas de autoelevação.
- **Aceite:** ensaio isolado de PostgreSQL e rotas/actions provam a mesma autorização no servidor; nenhuma autorização depende só de botão escondido.

### Etapa 2 — identidade do trabalhador e carteira básica

- Criar vínculo explícito e auditado entre identidade autenticada e cadastro existente.
- Implementar página pessoal com dados demonstrativos e estados de origem/validação; sem QR e sem decisão automática inicialmente.
- Introduzir habilitações versionadas após fechar fonte, histórico e controle de duplicidade.
- **Aceite:** trabalhador vê somente seu próprio cadastro; outro trabalhador/tenant não acessa por ID ou URL; estados incompletos ficam desconhecidos/pendentes.

### Etapa 3 — PWA, QR e operação de campo

- Implementar service worker com versão e cache mínimo do app; filas IndexedDB com identificador idempotente, revisão de conflitos e auditoria na sincronização.
- Criar emissão/rotação e validação do QR assinado; leitura com câmera e registro de DDS em lote, sem duplicidade.
- **Aceite:** ensaio sem rede mostra o último horário sincronizado; QR expirado, alterado ou de outro escopo é recusado; duplicidade/replay é detectado; filas não incluem conteúdo clínico desnecessário.
- **Limite:** revogação imediata e estado atual não são verificáveis enquanto o aparelho permanece offline.

### Etapa 4 — bloqueios de atividade e central de assinaturas

- Ligar requisitos da atividade às evidências validadas e ao escopo de empresa/unidade. Mostrar bloqueadores com fonte e data.
- Implementar fila unificada de documentos com versão exata, destinatário, papel, ciência/assinatura, revogação/substituição e histórico.
- **Aceite:** validação humana e autoridade exigida ficam claras; edição invalida aprovação anterior; modo offline não libera quando a política exigir dados atuais.

## Protótipo navegável fictício — 2026-11-15

Criada a rota `/passaporte-demo`, acessível apenas às contas internas fictícias de trabalhador, campo, SST e administração. Há atalhos na entrada de Desvios do trabalhador, DDS do líder de campo e Trabalhadores para os perfis que já acessam esse cadastro.

O protótipo mostra cartão sintético, status demonstrativo para quatro cenários (sem pendência, vencendo, vencido e não validado), lista fictícia de habilitações com status mínimo de ASO e a tela de ensaio do líder. A consulta reconhece somente `PASS-DEMO-001`; o fluxo manual carrega o mesmo trabalhador fictício. Os estados ficam somente na memória do navegador.

TypeScript (`tsc --noEmit`) e ESLint focalizado passaram. A bateria funcional existente de stores/fluxos fictícios executada antes desta tela teve 50 aprovações e uma falha conhecida na matriz: teste espera `consultoria_admin` sem `safety.risk_analysis.manage`, enquanto o mapa atual concede essa permissão. Essa discrepância não foi alterada neste protótipo.

Limites intencionais: o desenho de QR é ilustração estática, não código escaneável/assinado; consulta é entrada digitada, não câmera; nenhum estado persiste; não há trabalhador ligado à identidade, sync offline, captura de presença DDS, abertura/liberação de PT, nem aptidão médica real. O ASO exibido não contém dado clínico e todos os nomes/empresas/validade são fictícios. A rota não deve ser apresentada como autorização operacional.

## Fora desta etapa

Não implementar reconhecimento de face, uso de selfie como identidade, classificação automática de gravidade, aptidão decidida por IA, aprovação de trabalho por escaneamento isolado, credencial governamental no QR, envio eSocial, gravação de certificados privados ou coleta de dados reais em fixtures. O adapter do eSocial permanece desligado e depende de checkpoint próprio.

## Riscos e dependências

- Login/memberships do app ainda incluem contas demonstrativas; identidade de produção deve estar pronta antes de abrir portal a trabalhadores reais.
- Parte dos módulos usa armazenamento local JSON. A implantação real requer fechar persistência, isolamento, backup, proteção de arquivos, retenção e monitoramento.
- Foto, assinatura, identificadores trabalhistas e situação médica exigem minimização, finalidade, acesso restrito e revisão de retenção antes de cache ou captura offline.
- Bloqueios de atividade dependem de fonte e revisão profissional; cadastro incompleto não pode ser tratado como prova de habilitação nem como liberação.

## Critério de saída deste checkpoint

Este arquivo registra proposta e sequência para discussão. Não altera o runtime nem substitui validação técnica, médica, de privacidade, de segurança ou do cliente. O próximo passo recomendado é fechar as decisões da Etapa 0 e, depois, prototipar a matriz de permissões com dados fictícios, sem conectar decisões operacionais.

## Preparação relacional do vínculo do trabalhador — 2026-11-15

Foi preparado o candidato `schemas/tenant-worker-identity-link-candidate.sql`: convite por e-mail, aceite com sessão autenticada no tenant, estado pendente de revisão humana, aprovação/rejeição/revogação e consulta mínima do próprio cadastro somente após aprovação. O aceite do convite não prova identidade; a aprovação exige referência de verificação e outro ator autorizado. O DDL não foi aplicado nem conectado ao runtime. Ver dependências e critérios de prova no checkpoint LMS.
A preparação relacional de identidade inclui agora cancelamento/expiração auditáveis de convites e gates para tenant suspenso: aceite, aprovação e leitura do Passaporte exigem tenant ativo; apenas administrador pode cancelar/revogar. O verificador com cenários sintéticos foi criado, mas não executou porque as APIs locais do Docker negaram acesso; sem PostgreSQL descartável, a proposta continua não validada e sem integração ao login.
A proposta também prevê cancelar convites pendentes e recuperar convites vencidos com trilha de auditoria. Aceite, aprovação e leitura do resumo exigem tenant ativo; aprovação ainda exige configuração de autoridade ativa. O verificador cobre esses gates, mas não executa enquanto o Docker Engine local negar conexão.