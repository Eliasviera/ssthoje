# M22 — Matriz candidata de concessão e escopo

2026-10-18. Regras de produto para revisão; não são grants ativos nem interpretação jurídica.

## Regras comuns

- Administração inicial do sistema/tenant é provisionada no onboarding conforme a titularidade comercial: cliente comprador recebe o grant candidato `tenant_admin` no próprio tenant (com `tenant_owner` como teto de delegação); em instalação pertencente à consultoria, o principal precisa ter membership `consultoria_admin` e somente ele recebe `tenant_admin`. Esses grants são distintos do papel da membership. Empresa cliente atendida pela consultoria não recebe admin do sistema; representante operacional não ganha administração por confirmar uma designação.
- O catálogo define as ações possíveis. Uma concessão sempre se refere a um `actionCode`; presets apenas agrupam ações para facilitar o cadastro.
- O principal precisa estar autenticado, ativo e previamente vinculado ao tenant. O tenant é obtido da sessão verificada pelo servidor.
- O alvo precisa estar ativo e pertencer ao tenant. Empresa, unidade, terceira e fluxo são validados por referências autoritativas compostas.
- Escopo de empresa não inclui unidades automaticamente. Ações operacionais de SST/mobilização exigem unidade explícita; unidade criada no futuro não herda grant existente. Unidade sem empresa é inválida.
- Escopo de terceira e fluxo é sempre adicional quando a ação é específica do caso. A concessão não pode usar `NULL` para significar “todas”. Abrangência deliberada de tenant é aceita apenas para operações administrativas que precisam dela, nunca para parecer/bloqueio/decisão de mobilização.
- Vínculo profissional (TST/PLH) é qualificação. Não dá grant, não prova atribuição e não expande escopo.
- Concedente precisa ter `tenant.authorization.grant` ativo e grant-base que cubra o alvo, os códigos delegados e a trilha. Nenhuma pessoa pode conceder poderes acima do teto que recebeu.
- Self-grant, ciclo de delegação, principal inativo, cross-tenant, terceiro/fluxo órfão ou escopo mais amplo que o do concedente são negados.

## Concessão administrativa de autoridades

| Quem concede | Pode delegar | Limites |
|---|---|---|
| Owner inicial do tenant provisionado | Admins e gestores administrativos abaixo do nível de owner; ações internas do catálogo explicitamente delegáveis | Somente próprio tenant; não cria SaaS Master, não altera catálogo global nem adquire autoridade técnica/gerencial por ser owner |
| Tenant admin com grant de delegação | `hierarchy_admin`, memberships e ações explicitamente abaixo de seu teto | Tenant e escopo recebidos; não se autoeleva, não concede outro tenant admin se o catálogo de delegação não o permitir, não delega concessões técnicas/gerenciais sem autoridade explícita para isso |
| `hierarchy_admin` | Membership comum e administração de conta que o produto permitir | Não emite grants de autoridade, nem técnico, gerencial ou outro papel administrativo |
| SaaS Master / provisionador confiável | Bootstrap do tenant, owner inicial e suporte de plataforma | Operação de provisionamento isolada e auditada; não decide mobilização nem insere decisão técnica/gerencial em nome do cliente |
| Administrador do tenant da consultoria | Administra identidades/escopos do tenant da consultoria e concede ações para seus próprios usuários | Não concede autoridade técnica/gerencial em nome do cliente. Vínculo de atendimento não é autorização administrativa ou consentimento do cliente |
| Representante de concessão designado pelo cliente | Pode solicitar/autorizar, no escopo empresarial explicitamente designado, concessões SST/gestor de usuários já autenticáveis | Precisa ser previamente identificado pelo cliente e ter delegação registrada no tenant; empresa/unidades específicas; não cria contas nem administra tenant ou plataforma |
| Gestor/dono ou SST | Nenhuma concessão derivada do papel decisório/técnico | Pode conceder somente se possuir grant administrativo separado, cujo escopo/códigos/teto sejam suficientes |
| Aplicativo/API/terceiro | Nenhuma concessão de autoridade | Não emite, revoga, estende nem altera grants humanos |

Cliente direto: admin inicial do tenant é provisionado no onboarding da compra; depois, administra sua hierarquia dentro dos limites acima. Tenant operado por consultoria: o admin da consultoria administra a equipe e a instalação; o cliente não recebe admin do sistema. A designação do representante do cliente ainda depende da revisão da consultoria e da confirmação operacional independente por conta cliente ativa, sem elevar essa conta a admin. Concessão que habilita poder técnico/decisório do cliente depende de representante de concessão designado pelo cliente e escopo registrado. Cliente sem SST mantém a decisão com gestor/dono previamente concedido. Não há fallback à consultoria.

## Concessão de ações operacionais

| Ação | Concedente permitido | Escopo mínimo | Pré-condições adicionais |
|---|---|---|---|
| `thirdparty.analysis.recommend` para SST do cliente | Owner/admin do tenant cliente direto, ou representante de concessão designado pelo cliente no tenant da consultoria | Empresa + unidade; terceira + fluxo na atribuição se análise for específica | Conta ativa; qualificação SST verificada por fluxo confiável; atribuição a cada escopo; cliente decide se habilita autoridade técnica própria |
| `thirdparty.analysis.recommend` para consultoria SST | Admin do tenant da consultoria concede à sua equipe; representante designado pelo cliente autoriza a atribuição de atendimento | Empresa + unidade; terceira + fluxo quando análise for específica | Grant de recomendação no tenant da consultoria e atribuição cliente-escopo vigente; recomendação não é decisão final |
| `thirdparty.policy.manage` | Owner/admin do tenant cliente direto, ou representante designado pelo cliente com poder expresso de delegação | Empresa + unidade, uma versão por empresa/unidade | Responsável de política ativo; justificativa, revisão e instante de início; não pode ser API nem grant implícito de gestor; SST cliente só recebe por grant/preset separado |
| `thirdparty.requirement.set` | Owner/admin do tenant cliente direto, ou representante de concessão designado pelo cliente para o escopo | Empresa + unidade, restringindo por terceira/fluxo quando requisito não é geral | SST do cliente ativo e atribuído; política aplicável versionada; requisito e fundamento registrados |
| `thirdparty.technical.block` | Owner/admin do tenant cliente direto, ou representante de concessão designado pelo cliente para o escopo | Empresa + unidade; restringir por terceira/fluxo quando bloqueio for individual | SST do cliente ativo e atribuído; política vigente e fundamento/snapshot; bloqueio persiste até avaliação competente posterior |
| `thirdparty.technical.release` | Owner/admin do tenant cliente direto, ou representante de concessão designado pelo cliente para o escopo | Unidade e mesmo alvo do bloqueio que será revisado | Exige evidência atual e avaliação favorável autorizada para resolver bloqueio não conforme; gestor não pode conceder exceção; não apaga bloqueio histórico |
| `thirdparty.mobilization.require_pre_entry_correction` | Owner/admin do tenant cliente direto, ou representante de concessão designado pelo cliente | Unidade + terceira + fluxo da mobilização | Gestor/dono ativo e previamente cadastrado; decisão referencia a análise atual |
| `thirdparty.mobilization.authorize_conditional_entry` | Owner/admin do tenant cliente direto, ou representante de concessão designado pelo cliente | Unidade + terceira + fluxo específicos | Gestor/dono ativo; política `conditional_allowed`; justificativa e plano registrados; bloqueio obrigatório ausente; pendência permanece aberta |
| `thirdparty.analysis.return_to_sst` | SST cliente; ou gestor/dono designado para encaminhar | Unidade + terceira + fluxo | Motivo; retorno cria tarefa/estado novo; consultoria só reanalisa após atribuição vigente |
| `tenant.membership.manage` | Admin delegado do tenant | Tenant para administração comum; separar da concessão de autoridade sobre unidade | Conta de destino previamente existente no provedor de identidade; alterar/suspender não pode apagar decisões passadas |
| `tenant.application.manage` | Admin delegado do tenant | Tenant + empresa/unidade explícitas; terceira quando aplicável | Principal de máquina próprio; allowlist não decisória, expiração, rotação/revogação e cotas técnicas |
| `thirdparty.evidence.submit_own`, `thirdparty.status.read_own` | Admin da própria terceira, conforme onboarding, ou concessão de principal de máquina não decisório | Apenas a terceira do principal + fluxo/documento explicitamente autorizado | Não acessa avaliação interna, dados de concorrente ou decisões; upload valida formato e vínculo |
| `documents.read_scoped` para API | Admin do tenant com delegação de integração | Tenant + empresa/unidade + terceira/documento quando aplicável | Allowlist somente de classes documentais autorizadas; excluir conteúdo médico salvo fluxo médico segregado e autorizado |

“Concedente permitido” descreve o poder que precisa existir no catálogo/tenant; os papéis ainda não são grantáveis no runtime. O representante do cliente autoriza somente escopo e ação indicados na delegação, sem poder geral de administrar a consultoria. A identidade e a autoridade desse representante precisam ser confirmadas por processo explícito do cliente. Sem confirmação, negar. A separação consultoria recomenda / cliente decide aplica-se a todos os presets.

## Revisão, revogação e mudança de escopo

- Cada grant emitido registra grant-base/revisão e catálogo. A concessão é imutável; sua revogação é evento separado com motivo, ator e instante.
- Alterar ação ou escopo cria novo grant e revoga o anterior na mesma transação. Alterar preset não modifica grants ativos já emitidos.
- Expiração ou suspensão do principal, membership, tenant, unidade, atribuição ou credencial impede novas ações imediatamente; decisões anteriores continuam auditáveis.
- Reativação não reabre autoridade revogada. Novo grant exige nova concessão e cadeia delegável atual.
- Revogação do grant-base torna grants descendentes ineficazes a partir do commit da revogação; gravar eventos derivados de modo idempotente. A prova deve verificar que não há janela de uso do descendente.
- Uma concessão não confirma o estado da política futura. Decisão lê política vigente e registra versão/fingerprint no commit.

## Pontos em aberto que não bloqueiam este contrato

1. O cliente precisa definir como nomeia e substitui seu representante de concessão em tenant de consultoria e quais evidências registram essa autorização; não inferir isso do vínculo comercial.
2. O método para verificar qualificações TST/PLH ainda precisa de fonte/processo confiável e escopo. Até lá, grant pode exigir atributo `qualification_verified` provido por fluxo confiável; nome/registro digitado não deve ser tratado como prova.
3. A categoria de documento liberada à API precisa ser definida pelo cliente. Política padrão é negação, especialmente para dado médico.
4. Grants de tenant inteiro devem ficar restritos a tarefas administrativas do tenant; ações sobre empresa/terceira/fluxo requerem escopo operacional correspondente.
5. Se cliente não tiver SST, ele deverá designar separadamente quem configura a política; o gestor que decide mobilização não recebe esse poder automaticamente.

## Critérios para schema e prova

- FK composta e RLS para todo vínculo; tentativa de criar escopo misto resulta em negação.
- Tabela/evento de emissão e revogação sem UPDATE/DELETE/TRUNCATE pelo runtime.
- Outorga de preset é atômica, sem grants parciais ou duplicados ativos por ação/escopo.
- Revogar grant-base invalida descendentes e serializa com qualquer decisão que os use.
- Cliente direto, consultoria e duas empresas/unidades da mesma consultoria ficam isolados.
- Testar ação fora de preset, código não catalogado, API pedindo ação decisória, política sem revisão, efeito `block`, atribuição expirada e unidade futura não explicitamente incluída.
- Todo SQL será candidato isolado até prova descartável; nenhuma migration ativa é autorizada por este documento.
