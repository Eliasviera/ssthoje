# M22 — Identidade do gestor de contrato: desenho candidato

2026-10-18. Preparação; não cria conta, papel de login, vínculo ou acesso no ambiente ativo.

## Fronteiras propostas

1. Obter userId exclusivamente da sessão autenticada e validada no servidor. Não aceitar gestor, tenant ou papel como autoridade enviados por formulário.
2. Resolver o tenant por vínculo ativo da conta. O gestor recebe apenas os escopos explicitamente atribuídos (empresa/unidade); vínculo da consultoria não significa acesso a todos os clientes.
3. O papel candidato gestor_contrato ainda não está nas permissões runtime. Atribuição deve ser ação administrativa explícita e auditada, com responsável e possibilidade de revogação. Sem vínculo, negar; nenhum fallback para administradora.
4. Relê-lo com lock na mesma transação da decisão. Revogação confirmada antes do início da decisão impede a gravação; uma transação já em curso serializa antes da revogação, não é cancelada retroativamente.
5. A análise deve ser compilada de fontes transacionais verificadas, incluindo política vigente, requisitos e avaliações da mesma empresa/unidade/escopo. O snapshot não pode vir do navegador. O contrato de hoje usa fixture e não é suficiente para ligar ao painel.
6. Gestor vê apenas conclusão administrativa e pendências permitidas; não recebe PDFs médicos, diagnósticos ou conteúdo clínico por ganhar esse papel.
7. Decisão e auditoria são imutáveis e atômicas; retorno para SST exige justificativa. Nova análise/revisão após devolução; aprovação antiga não é reescrita. Agendamento é etapa própria e continua sujeito a verificações médicas/documentais.

## Evidência de concorrência executada

verify-contract-manager-candidate.mjs: transação runtime segura locks de leitura do vínculo e snapshot. Outro cliente tenta revogar e editar com lock_timeout 200 ms: ambas as operações recebem 55P03. Após liberar locks, revogação conclui; tentativa de decisão posterior é recusada. A decisão histórica anterior continua presente. Prova usa container sem volume, removido ao final; não é revogação no banco ativo.

Próximos requisitos: decidir modelo de atribuição e administração de vínculos; adaptar a identidade real sem criar acessos implicitamente; origem transacional confiável da análise; provas de isolamento por unidade, mudanças de política e acesso médico negado. Somente depois preparar migration e integração de tela em etapas autorizadas.

## Estrutura confirmada pelo usuário — 2026-10-18

Consultoria → empresa cliente → empresas terceiras. O gestor de contrato pertence à empresa cliente. O analista é TST do cliente ou profissional SST da consultoria explicitamente atribuído ao cliente/unidade/terceira/escopo. Não é TST da terceira neste fluxo. Não exigir TST próprio de todo cliente, não inferir necessidade por porte/grau de risco e não conceder fallback automático: a consultoria recebe atribuição explícita para analisar. Perfil profissional não equivale a permissão, nem permite conteúdo médico.

Contrato candidato third-party-analyst-assignment.mjs valida esse recorte, sem ligação ao runtime. contract-manager-decision.mjs exige employerCompanyId igual à empresa cliente da análise. Schema candidato acrescenta employer_company_id ao vínculo e o devolve pela função de leitura com lock; aplicado somente ao container descartável. Nenhuma alteração de vínculos reais.

## Decisão pré/pós-ingresso — contrato candidato

`contract-manager-decision.mjs` aceita três comandos explícitos: exigir correção antes do ingresso, autorizar ingresso condicionado ou devolver para nova análise SST. Correção prévia e devolução preservam o estado bloqueado. A autorização condicionada exige descrição do plano pós-ingresso; responsável e prazo são opcionais e só são registrados quando informados. O validador não inventa esses dados, não altera a análise técnica e devolve `mobilizationStatus: conditional` com `pendingRemainsOpen: true`. Pendência com nível `block` da política impede autorização condicionada. Decisões sem pendências são recusadas.

O contrato continua desconectado do runtime e não constitui cadastro de usuários, concessão de vínculo, análise publicada de fontes reais, gravação transacional ativa ou liberação operacional. Os casos existentes do validador foram atualizados; testes não executados nesta fatia. `node --check`, ESLint focado e `pnpm typecheck` passaram.

## Concessão e revogação do vínculo — preparação

O vínculo candidato representa uma conta já existente e autenticável; cadastrar uma pessoa como decisora não deve criar uma senha/conta implícita nem aceitar somente nome ou e-mail. O principal de identidade precisa estar ativo no servidor antes da concessão. A tela deverá selecionar essa conta registrada e a empresa/unidade cliente correspondente.

Cada concessão deve identificar tenant, usuário, empresa cliente, unidade, papel declarado (`gestor_contrato` ou `dono`), ator administrativo que concedeu e instante do servidor. O escopo é sempre empresa + unidade explícitas; não há concessão por tenant inteiro nem herança a todas as terceiras. A autorização de quem pode conceder ainda não foi definida pelo usuário nem existe no runtime: não presumir que `consultoria_admin` possa cadastrar decisores do cliente. O provisionador candidato deve exigir uma autorização de administração registrada separadamente, e o vínculo concedido não pode servir para conceder novos administradores.

Revogação deve acrescentar evento identificável sem apagar a concessão nem decisões anteriores. O estado vigente deriva do evento mais recente; concessão após revogação cria novo vínculo/histórico, sem reativação silenciosa. A decisão relê o vínculo ativo e seu escopo sob lock na mesma transação; revogação concorrente serializa com a decisão. O snapshot da decisão guarda o identificador/revisão do vínculo utilizado, para que uma alteração posterior não reescreva a autoria histórica.

Critérios antes de qualquer integração: origem autoritativa das contas existente no banco, política explícita para concedentes, empresa/unidade reconciliadas sob tenant, concessão/revogação auditáveis e atômicas, bloqueio por conta suspensa/revogação, escopo cruzado negado, histórico imutável, e decisão e auditoria atômicas. Até isso existir, a tela atual continua sem registrar decisões do cliente; a fixture PostgreSQL anterior comprova somente a leitura/lock de um vínculo sem fluxo de concessão.

## Schema candidato de grants — 2026-10-18

Criado `schemas/manager-grants-candidate.sql`, separado das migrations e do schema de decisão. Ele modela principais previamente cadastrados, unidades ativas, concedentes explicitamente delegados por empresa e grants individuais por usuário/empresa/unidade com papel `gestor_contrato` ou `dono_cliente`. Concessão e revogação são funções de servidor: revalidam e bloqueiam as referências, gravam evento com ator/snapshot na mesma transação, impedem autoatribuição e regrant ativo duplicado. Nova concessão após revogação produz novo grant; o evento anterior permanece. Leitura da autoridade ativa também bloqueia linhas durante o uso para serializar com revogação.

O schema agora referencia `sst.tenant_memberships`, `sst.client_companies` e `sst.client_units` dos migrations existentes: o decisor deve ter vínculo ativo com papel `cliente`; concedente, conta e empresa/unidade são bloqueados e revalidados na operação. O poder de conceder continua em tabela separada `registrars`, sem inferência por `consultoria_admin`.

Prova `pnpm thirdparty:manager-grants:verify-isolated` executada em PostgreSQL descartável, carregando migrations 0001 e 0004; sem volume, container removido. Passaram: vínculo cliente inexistente/inativo, empresa arquivada, unidade de outra empresa, concedente suspenso/fora do escopo, autoatribuição e grant duplicado negados; grants e eventos atômicos com rollback induzido; acesso direto negado e leitura cross-tenant vazia; revogação bloqueada enquanto grant está sob lock por decisão; novo grant após revogação preserva IDs/eventos antigos. `node --check` e ESLint focado passaram.

Limites: schema/prova não estão conectados a `manager_candidate` da decisão nem ao app. O login ativo continua usando contas fictícias em variáveis de ambiente; `tenant_memberships` por si só não autentica a pessoa. Dados da prova são fictícios, `registrars` não foi provisionado em banco real e sua autoridade permanece por definir. Nenhuma migration/cutover ativo foi feito.

## Fonte de identidade do app — inspeção

`src/lib/demo-accounts.ts` carrega exclusivamente as cinco contas fixas de demonstração a partir de variáveis de ambiente; `src/app/actions.ts` autentica comparando senha configurada e cria sessão assinada; `src/lib/session.ts` valida a sessão contra essa mesma lista. Não há cadastro/invite de usuário nem tabela de contas/senhas. A migration `0001_tenant_registry.sql` tem somente `sst.tenant_memberships` com `user_id`, papel e nome de exibição, sem prova de conta ou autenticação. Logo, o FK candidato ao membership valida pre-cadastro de vínculo, mas não prova que a pessoa consiga autenticar-se.

Não adicionar conta fictícia de gestor ao runtime nem tratar `cliente` como autenticação. Próxima etapa de runtime exige um provedor de conta/sessão real ou fluxo explícito de provisionamento de contas para demonstração, mais definição de quem atribui o grant `registrars`; sem isso, a decisão do cliente permanece indisponível.
