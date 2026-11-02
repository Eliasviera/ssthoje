# M22 — contrato mínimo do caso de terceiro

2026-10-18. Contrato lógico candidato para fechar a identidade compartilhada entre convite, evidência, avaliação SST e decisão do cliente. Não é migration nem autoriza escrita no banco.

## Entidades e identidade

- **Terceiro (`third_party_id`)**: UUID próprio, pertencente ao tenant, associado à razão social e ao CNPJ normalizado do estabelecimento. O CNPJ ajuda a localizar um cadastro; convites e decisões guardam o UUID, não usam nome/CNPJ como FK.
- **Trabalhador da terceira (`third_party_worker_id`)**: identidade própria, pertencente ao mesmo tenant e vinculada à contratada. Não reutiliza o cadastro de empregados da empresa cliente. Nome, documento pessoal e função extraídos de um ASO são sugestões para rascunho; não se mescla trabalhador existente automaticamente por CPF, nome ou similaridade.
- **Caso (`workflow_id`)**: UUID próprio e imutável para a relação de uma empresa/unidade cliente, um terceiro e um escopo de serviço/contrato. Escopo textual é descrição; não é identidade. Reconvite, novas evidências e reavaliações do mesmo trabalho continuam no caso existente.
- **Alocação do trabalhador ao caso**: relação explícita entre trabalhador terceiro e caso/escopo, com função declarada para aquele serviço. Uma pessoa pode atuar em mais de um escopo; a função em um caso não altera os outros.
- **Convite**: mantém seu próprio ID e passa a referenciar `third_party_id` e `workflow_id`. Um caso pode ter vários convites; revogar um link não apaga nem substitui o histórico do caso.
- **ASO de terceiro**: evidência individual versionada vinculada ao trabalhador e à alocação/caso aplicável. O documento integral e seus dados permanecem no domínio de acesso médico restrito; os demais perfis recebem somente o estado mínimo de aptidão e validade necessários ao acompanhamento autorizado.
- **Avaliação e decisão**: usam a mesma chave composta `(tenant_id, company_id, unit_id, third_party_id, workflow_id)`. Novo escopo de trabalho recebe novo `workflow_id`; nova revisão da avaliação não cria novo caso.

## Ponte explícita dos identificadores legados

O manifesto candidato atual usa `tenantId`, `companyId`, `unitId`, `contractorId`, `scopeId` e `scope`; o modelo relacional usa `tenant_id`, `company_id`, `unit_id`, `third_party_id`, `workflow_id` e `work_scope`. O mapeamento pretendido e seu limite são:

| Origem do manifesto/convite | Destino candidato | Regra de resolução |
|---|---|---|
| `tenantId` | `tenant_id` | Igualdade exata com tenant autenticado; não aceitar valor enviado pelo browser como autoridade. |
| `companyId` | `company_id` | Resolver no tenant e confirmar que a unidade pertence à empresa pela FK composta. |
| `unitId` | `unit_id` | Resolver junto da empresa no mesmo tenant; divergência nega. |
| `contractorId` | `third_party_id` | A identidade de domínio deve ser UUID persistente. CNPJ normalizado só localiza candidato; pessoa autorizada confirma a associação. O manifesto legado não fornece uma ponte autoritativa. |
| `scopeId` | `workflow_id` | Não há conversão automática. O caso deve ser selecionado por UUID persistente ou criado explicitamente com empresa/unidade/terceiro/escopo confirmados. Convite e agrupamento do relatório não são IDs de caso. |
| `scope` / convite `scope` | `work_scope` | Descrição a revisar e preservar; texto normalizado não é chave nem critério automático de igualdade. Ausência de escopo exige preencher/revisar antes de criar caso. |
| `invitation.id` | chave opaca de origem | Continua ID de convite. Cada convite legado que será usado no caso precisa de associação explícita e auditável; um caso pode receber vários convites. |

O schema candidato atual grava o alvo do recibo em eventos `matched`, mas não tem uma relação independente para vincular convite sem recibo, nem uma ponte durável de cada `invitation.id` ao caso. O design da próxima relação deve ser por `(tenant_id, source_store, source_invitation_id)`, apontar para a chave composta do caso/terceiro/empresa/unidade e guardar ator, instante e motivo; seu histórico deve ser append-only, com reabertura explícita em caso de correção. Não criar essa relação por este contrato e não derivar `workflow_id` de CNPJ, texto ou UUID do convite.

Para manifesto novo, o adaptador deve resolver primeiro o caso por IDs autoritativos e emitir `contractorId = third_party_id` e `scopeId = workflow_id` no snapshot; até essa troca contratual ser implementada, o publicador atual não é compatível com as FKs candidatas e não pode gravar nelas.

## Requisitos e política

- Um requisito tem `requirement_code` imutável, nome e regra de aplicação. Cada publicação da política registra sua versão e os `requirement_code` ativos com efeito, referência normativa versionada e regra de evidência.
- O UUID de uma regra antiga (`ComplianceRule.id`) identifica aquela revisão; não deve virar o código lógico do requisito, porque a edição cria outra regra/ID. O texto do bloqueio também não é chave.
- `policyVersion` numérica do snapshot resolve para UUID de `policy_versions.id` exclusivamente por `(tenant_id, company_id, unit_id, version)`. O modelo SQL candidato já tem unicidade nessa chave; a publicação/compilação runtime ainda precisa emitir uma versão imutável compatível.
- Pendências guardam `requirement_code` e estado/efeito tipado. Não inferir `authorization`, `block` ou `conditional_allowed` analisando texto.

### Ponte da política e das pendências legadas

| Fonte legada | Campo candidato | Limite e resolução necessária |
|---|---|---|
| `Policy.version` | `policy_versions.version` | A chave numérica é compatível somente quando tenant/empresa/unidade coincidem e o conteúdo imutável publicado corresponde ao digest. O lookup atual seleciona a primeira política JSON por tenant/empresa/unidade e não seleciona uma revisão explicitamente; número gravado no snapshot não prova, sozinho, qual versão foi avaliada. |
| `ComplianceRule.id/version` e snapshots da regra | `policy_items` + catálogo | São identidade e revisão da regra legada, não `requirement_code`. Pessoa revisora precisa associar cada regra vigente a um código estável no escopo correto e validar a semântica; títulos/texto não geram códigos automaticamente. |
| Categorias de documento e `companyRequirements` | `requirement_code` + `evidence_rule_snapshot` | Categorias e requisito documental podem ser relacionados por uma regra de aplicação publicada, mas categoria igual não prova que requisito/efeito é igual. ASO fica fora do catálogo genérico atual até existir modelo médico autorizado. |
| Gate `blockers: string[]` / manifesto `pending[]` | itens da avaliação técnica | O gate entrega frases, enquanto o manifesto aceita IDs/níveis e o SQL espera `requirement_code` e estados tipados. Não há conversor autoritativo; cada pendência precisa de código explícito e revisão de significado antes de entrar na avaliação. |
| `inform` / `authorization` / `block` e resultados de avaliação | `effect` / `technical_state` | Vocabulários não são equivalentes. Nenhuma conversão automática; regra `block` e `authorization` não se tornam estado técnico nem autorização condicionada por inferência. |

Até essa ponte estar publicada e versionada, uma política JSON pode servir apenas como proveniência/referência legada; não pode ser importada como `policy_versions` ou usada para decidir por simples igualdade de número, título ou chave textual.

### Fontes por requisito avaliado

`technical_assessment_sources` registra dependências no nível da avaliação inteira (`source_kind`, ID, revisão e fingerprint). `technical_assessment_source_members` registra os membros individuais extraídos por grupo. `technical_assessment_item_sources` liga cada item (`requirement_code`) ao membro exato no snapshot e armazena seu ID/revisão/fingerprint e papel (`evidence`, `applicability_basis`, `prior_evaluation` ou `criterion`). FKs e CHECKs garantem que item, grupo e membro existem no mesmo assessment e que grupo e papel são compatíveis.

As FKs agora impedem citar ID/revisão/fingerprint que não foi registrado como membro do grupo do assessment. Ainda cabe ao repositório/função confiável garantir que a lista de membros veio da extração autoritativa bloqueada e que seu fingerprint canônico corresponde ao digest agregado no mesmo transactionId. Também deve validar completude dependente do estado (por exemplo, evidência para `conforming`, base de aplicabilidade para `not_applicable`), sem exigir referência de suporte fabricada para `insufficient_evidence`. A política aplicada permanece ligada pelo `policy_version_id` da avaliação. A Etapa A provou o vínculo estrutural e a rejeição de membro ausente; a proveniência do conjunto e as regras semânticas/transacionais continuam pendentes.

### Provisionamento candidato de identidade e caso — opção aprovada em 2026-10-22

Regra aprovada pelo usuário para a prova fictícia, ainda sem runtime: a identidade que recebe administração do sistema/tenant é provisionada no onboarding conforme titularidade: quando a empresa compra o sistema, provisiona-se seu admin inicial; quando a instalação pertence à consultoria, somente a consultoria recebe admin. Isso não impede que, na instalação da consultoria, um representante operacional do cliente confirme uma designação sem receber admin do sistema. Nesse fluxo, `consultoria_admin` revisa a evidência formal e propõe a designação, registrando ator, referência, justificativa e UUID idempotente. Uma conta cliente ativa, cuja identidade tenha sido associada humanamente à autorização do cliente, confirma a proposta e registra sua referência/justificativa; não pode ser o revisor nem a própria pessoa designada. A função só então cria o evento `designated`. A tabela de membership não distingue owner/responsável de outros membros `cliente`; portanto, a função candidata só confere membership ativo, e a checagem de que a pessoa realmente está autorizada pelo cliente permanece uma validação humana externa obrigatória. A função registra a dupla confirmação, mas não prova poderes legais nem autentica documentos. O representante já designado confirma depois a empresa, unidade, terceira e escopo exatos do caso. A função gera `third_party_id`/`workflow_id` no servidor, grava eventos append-only e auditoria administrativa. Designação não confirmada/revogada, tenant ou membership inativo, escopo divergente, empresa arquivada, conflito de retry ou CNPJ duplicado são negados. CNPJ duplicado nunca retorna ou mescla automaticamente identidade existente. A proposição/revogação usa role SQL separada `NOLOGIN`/`NOBYPASSRLS`, não concedida ao app; a confirmação da proposta é uma função protegida por sessão que somente aceita membership cliente ativo. Eventos concorrentes são serializados pelo lock do representante usado na criação do caso.

O SQL foi isolado em `schemas/operational-authority-case-provisioning-functions-candidate.sql`, aplicado apenas pelo verificador a PostgreSQL efêmero. A prova usa membership, empresa, unidade, terceira, caso e designação sintéticos; cobre proposta sem ativação, confirmação cliente por ator distinto, tentativas por consultoria/auto-confirmação/membership suspenso, retry idempotente, conflito de payload, CNPJ duplicado, escopo de outro tenant, revogação, RLS, privilégios, FKs e append-only. O executor permanece sem bypass de RLS; políticas internas restringem leitura e update da coluna `row_version` das memberships ao tenant corrente, permitindo o lock de validação sem expor a tabela ao app. A prova integrada A+B passou. O schema instalado no banco local persistente permanece sem esses eventos/funções e sem qualquer identidade real. A aprovação da regra não autoriza migration, aplicação no banco persistente, importação de convites existentes ou ligação ao runtime.

#### Contrato mínimo da validação na Etapa B

1. Abrir transação e derivar sessão, tenant, ator, atribuição e caso; bloquear atribuição/caso/avaliação corrente, versão de política, critérios e fontes autoritativas pela ordem única definida pelo repositório.
2. Extrair cada grupo uma única vez. O repositório confiável calcula o fingerprint do grupo sobre a lista canônica de `(source_id, revision, source_fingerprint)` realmente lida, e mantém essa lista na memória da transação. O digest agregado e os metadados declarativos do cliente não substituem essa extração.
3. Resolver cada citação submetida contra a lista em memória do grupo correto, comparando tenant, caso, ID, revisão e fingerprint exatos. Rejeitar fonte ausente, substituída, divergente, de outro grupo/escopo ou não coberta pelo digest calculado. IDs/fingerprints recebidos do browser são seletores para validação, nunca prova.
4. Confirmar que o conjunto de `requirement_code` da avaliação é exatamente o conjunto de itens da versão de política bloqueada; nenhum requisito ausente, extra ou duplicado.
5. Validar papéis por estado: `conforming` exige critério e ao menos uma evidência; `nonconforming` exige critério e evidência que sustente a não conformidade; `not_applicable` exige critério e base de aplicabilidade; `insufficient_evidence` exige justificativa explicando a lacuna e pode ter zero ou mais fontes já examinadas; `not_assessed` não pode declarar citações conclusivas e requer motivo. A política é validada pela FK `policy_version_id` e sua publicação, não por citação textual.
6. Inserir assessment, snapshot dos cinco grupos, itens e citações no mesmo commit. Conferir `expectedFingerprint`/revisão corrente e gravar auditoria transacional; qualquer divergência aborta tudo. Retry idempotente retorna o assessment existente apenas se fingerprint, ator autorizado e resultado coincidirem.

Hash agregado baseado em lista só demonstra inclusão se o algoritmo de canonicalização e o conjunto de membros forem produzidos e verificados pelo mesmo repositório confiável. Uma FK para o snapshot, isoladamente, não autentica o conteúdo da referência individual. Esses passos são contrato de implementação/prova, não função existente.

## Tratamento de MEI

- O cadastro deve distinguir “titular executa o serviço” de “MEI possui empregado”, sem tratar o enquadramento como aprovação do serviço.
- Para MEI, a dispensa de elaboração do PGR próprio deve ser um estado documental explícito (`dispensado`, com base e vigência da referência normativa), não “pendente” nem “aprovado”. A avaliação dos riscos do serviço/local e a inclusão preventiva pelo cliente seguem registradas no caso/escopo do cliente.
- A ficha MEI oficial é subsídio inicial exemplificativo. Perigos e controles precisam ser revisados considerando atividade real, local e escopo.
- Requisitos de atividade crítica permanecem avaliados por tarefa; não se dispensam por enquadramento MEI. Requisitos como ASO são configuráveis por aplicabilidade confirmada, nunca automaticamente exigidos ou dispensados só pela classificação.
- Quando houver empregado do MEI, sua identificação, função, documentos e requisitos aplicáveis são tratados em vínculo de trabalhador separado; não presumir que a condição MEI elimine deveres relativos ao empregado.

## Sequência de adoção

1. Definir cadastro e unicidade do terceiro por tenant; tratar colisões/duplicidades de CNPJ por associação explícita, sem mesclar históricos automaticamente.
2. Criar o caso no servidor com empresa, unidade, terceiro e escopo; atribuir seu ID a convites e ao gate de integração.
3. Criar trabalhadores terceiros e alocações ao caso como registros separados; permitir rascunho pré-preenchido de PGR/ASO, confirmação humana e tratamento explícito de possíveis duplicidades.
4. Separar documentos médicos e autorização de leitura; não exibir o conteúdo integral do ASO na área documental geral nem enviá-lo pelo portal público genérico.
5. Definir códigos estáveis no catálogo de requisitos e adicionar esses códigos às regras/publicações de política.
6. Fazer avaliação e decisão resolverem os mesmos IDs e gravarem snapshot/fingerprint transacional.
7. Migrar dados existentes por associação explícita. Não inferir caso só pelo texto, nem descartar convites ou decisões antigas.

As entidades `third_parties`, `third_party_cases` e `policy_requirement_catalog` foram traduzidas ao schema SQL candidato; grants, atribuições, avaliações, decisões e auditoria agora usam UUIDs e FKs compostas para o mesmo terceiro/caso. Isso fecha a integridade relacional do desenho, não a associação de convites existentes. A Etapa A estrutural/funcional dos candidatos passou em PostgreSQL 17 descartável; a Etapa B ainda exige funções, adapter e fonte de identidade/membership coerente. O runtime atual segue JSON e não foi alterado nesta etapa.

Extensão candidata 2026-10-19: `schemas/third-party-workforce-candidate.sql` define contexto de força de trabalho por caso, cadastro separado do trabalhador terceiro, alocação por escopo e eventos de alocação. O perfil MEI e a condição titular/empregado são associados ao caso, não presumidos globalmente para todos os serviços da contratada. A classificação baseada em documento agora aponta para uma versão de documento por FK; a origem dessa versão ainda deve ser verificada pelo repositório transacional. O schema passou pelo parse/prova estrutural e pelos casos funcionais selecionados da Etapa A descartável; não foi aplicado a banco ativo. Não inclui CPF, extração/OCR, ligação aos recebimentos atuais ou ASO. Esses pontos exigem contrato de origem documental, revisão de privacidade e modelo médico separado antes da integração.

O contexto candidato distingue titular sozinho, titular com empregados, empregados sem atuação do titular e cenário não confirmado. Funções confiáveis ainda precisam conferir as alocações ativas contra esse contexto na mesma transação; DDL e RLS isolados não garantem essa coerência nem confirmam a origem documental da classificação.

Extensão candidata 2026-10-19: `schemas/third-party-evidence-candidate.sql` cria séries e versões de documentos empresariais não médicos e uma revisão separada de aplicabilidade por caso/unidade. Um documento da contratada pode ser associado a mais de um caso, e cada associação exige revisão própria. Aplicabilidade não equivale à avaliação de conformidade. Este desenho não referencia os recibos JSON nem os snapshots `sst.*_snapshots`; recebimentos legados precisam de associação explícita antes de qualquer importação. O armazenamento de bytes continua privado e fora do banco.
