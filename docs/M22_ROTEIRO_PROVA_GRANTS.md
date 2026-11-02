# M22 — Roteiro de prova isolada dos grants operacionais

2026-10-18. Plano de validação; não executado. Requer Docker/WSL funcional.

## Etapas separadas

- **Etapa A — parse/estrutura:** só depois de uma inspeção estática aprovada, criar container sem volume e confirmar que as migrations-base e o DDL candidato carregam e deixam apenas schema/role/tabelas fictícios. Não conectar adaptadores nem executar testes de autorização nesta etapa.
- **Etapa B — autorização/concorrência:** só depois que funções server-side candidatas estiverem implementadas, auditadas estaticamente e concedidas apenas ao papel runtime do container, executar a matriz de casos abaixo. O DDL atual revoga todo DML/EXECUTE e não implementa grants ou decisões; portanto ainda não é possível obter resultados funcionais esperados.
- Cada etapa requer execução explicitamente autorizada pelo usuário no turno em que for realizada, e é limitada ao container descartável descrito neste roteiro.

## Revisão estática complementar — 2026-10-18

- `gen_random_uuid()` é fornecido pelo PostgreSQL 13+; o cabeçalho do schema declara essa versão mínima. O DDL não precisa criar extensão no banco-base.
- O catálogo de ações é global e tem RLS própria; as demais tabelas tenant-scoped incluem `tenant_id`. O papel candidato não recebe DML nem EXECUTE, conforme intenção da Etapa A.
- A auditoria permite ator humano ou de aplicação, mas `actor_application_id` ainda não possui catálogo/FK de principals de aplicação. O próprio schema marca essa integração como pendente. Não inserir ator de máquina até definir origem, lifecycle e FK confiável.
- A FK da versão de política para `client_registrars` mantém a mesma empresa/unidade; vigência e revogação do representante ainda dependem de função confiável com lock, não da FK isolada.
- Não identifiquei correção estrutural autônoma para fazer sem decidir autoridade de grants, atores de sistema, origem de evidências e política versionada. O DDL permanece deliberadamente sem grants de escrita/funções. Etapas A/B continuam sem execução até Docker/WSL estar disponível e, para B, até as funções serem desenhadas e revisadas.

## Limite da prova

- Executar somente em container PostgreSQL descartável, sem volume e sem portas compartilhadas com o banco ativo. Conferir nome/ID do container e ausência de volume antes de iniciar.
- Aplicar em sequência apenas as migrations-base necessárias (0001, 0004, 0005) e o schema `operational-authority-grants-candidate.sql` no container descartável.
- Não conectar o roteiro ao runtime, URL/credencial de desenvolvimento ou banco ativo; não executar migrations do app completas.
- Usar tenants, usuários, empresas, unidades, terceiras e fluxos fictícios. Usar hashes/identificadores sem segredos reais.
- Ao final, confirmar que container e redes/volumes temporários próprios foram removidos. Nunca limpar recursos por nome genérico.

## Gate de parse e privilégio

1. Aplicar o candidato depois das migrations-base; confirmar criação do catálogo global sem `tenant_id` e RLS tenant-scoped nas demais relações. Isso detecta regressão que tenta filtrar o catálogo global por tenant.
2. Conferir que papel runtime é `NOSUPERUSER NOBYPASSRLS`, não possui DML direto, TRUNCATE nem EXECUTE em função não concedida.
3. Conferir que catálogo global só expõe ações habilitadas a leitores autorizados e nenhum tenant consegue inserir/alterar/desabilitar código.
4. Confirmar triggers impedem UPDATE/DELETE/TRUNCATE em grants, presets versionados, atribuições, política, decisões e eventos, inclusive por função de prova com privilégios de escrita.
5. Fazer rollback e confirmar que o estado fictício usado pelo gate não deixa linhas residuais.

## Fixtures mínimas

- Tenant C em modo consultoria, com duas empresas clientes, duas unidades por empresa e dois usuários de consultoria.
- Tenant D em modo cliente direto, com uma empresa, duas unidades, um SST e um gestor/dono.
- Um representante do cliente designado em cada empresa atendida no tenant C; terceiros e fluxos fictícios por unidade.
- Grants administrativos com tetos diferentes; presets SST cliente, SST consultoria e gestor, todos versionados.
- Políticas imutáveis: um caso `conditional_allowed`, um `block` e uma segunda versão de política.
- Cada política fixture tem mais de um requisito; uma avaliação técnica completa precisa cobrir exatamente os itens aplicáveis. Evidências têm revisões/fingerprints fictícios; suas FKs só serão testadas quando existir tabela autoritativa ligada ao schema candidato.

## Casos e resultado esperado

| Área | Tentativa | Resultado esperado |
|---|---|---|
| Catálogo/DDL | Criar política RLS de tenant numa tabela global sem `tenant_id` | Schema não deve fazê-lo; catálogo continua global, versionado e imutável |
| Escopo composto | Referenciar unidade da empresa A junto da empresa B ou tenant diferente | FK/check nega |
| Herança de unidade | Usuário recebe grant para unidade A; criar unidade B depois | A não autoriza B; sem grant/atribuição explícitos, negar |
| Identidade | Grant a membership inexistente, suspenso ou de outro tenant | FK/validação de estado nega |
| Qualificação | `qualification_status=verified` sem referência confiável | Negar; texto digitado não prova qualificação |
| Concessor no cliente direto | Owner/admin delega ação abaixo do próprio teto e escopo | Permitir somente ação catalogada, escopo contido e principal ativo |
| Teto/cadeia | Admin delega ação fora do teto, para nível igual/superior, self-grant ou ciclo | Negar; sem evento de emissão parcial |
| Consultoria/cliente | Admin da consultoria tenta conceder decisão em nome do cliente | Negar; exigir designação explícita do representante do cliente e referência em `authorized_by_registrar_id` |
| Atribuição de consultoria | SST consultoria sem atribuição, ou após expiração/revogação | Negar análise; grant de análise sozinho não basta |
| Preset | Uma ação do preset é inválida ou não permitida ao emissor | Toda a concessão do preset faz rollback; nenhuma concessão parcial |
| Política | Decisão sem versão válida no escopo/data | Negar e auditar código fixo do motivo |
| Vigência de política | Duas versões da mesma unidade com o mesmo `effective_at`, versão retroativa ou duas sessões publicando ao mesmo tempo | Instante duplicado/retroativo negado; publicação concorrente serializada; versão mais recente anterior à decisão escolhida |
| Escopo da política | Decisão da unidade A referencia política da unidade B, ainda que no mesmo tenant/empresa | FK composta nega |
| Administração de política | Admin de usuário/gestor/SST sem `thirdparty.policy.manage` tenta publicar | Negar; papéis genéricos não implicam configuração de política |
| Representação do cliente | Admin da consultoria publica sem designação do cliente ou com designação de outra unidade | Negar; verificar `authorized_by_registrar_id` no escopo exato |
| Atribuição do analista | Cliente SST ou consultoria SST sem representante ativo para a mesma empresa/unidade | Negar; atribuição e unidade do representante devem coincidir por FK/validação |
| Revogação do representante | Revogar representante e tentar emitir grant/atribuição com sua designação | Negar novas concessões; grants descendentes ficam ineficazes conforme regra de revogação |
| Reativação de usuário | Suspender membership, reativar e reutilizar grants/atribuições/designações anteriores | Identidade pode autenticar novamente, mas autoridades antigas não são restauradas; novas emissões exigidas |
| Qualificação SST | Atribuição expira ou qualificação vence durante análise | Negar nova análise; nova verificação gera nova atribuição e preserva anterior |
| Efeito da nova política | Publicar nova versão com efeito distinto e consultar decisão/bloqueio antigo | Histórico antigo preservado; nova versão não cria decisão nem agenda e não limpa bloqueio automaticamente |
| Efeito block sem resolução | Gestor tenta ingresso condicionado, ou SST tenta release sem reavaliação favorável atual | Negar; pendência e estado técnico permanecem |
| Avaliação incompleta | SST tenta emitir avaliação omitindo requisito obrigatório da versão | Função confiável nega; nenhum snapshot parcial |
| Vínculo da avaliação | Avaliação combina assignment, analista, política, empresa, unidade, terceira ou fluxo de outro escopo | FK composta ou função nega |
| Histórico técnico | Nova avaliação tenta alterar item/fonte da revisão anterior | Trigger/privilegio nega; criar revisão nova |
| Evidência sem revisão | Avaliação referencia documento sem ID/revisão/fingerprint autoritativos | Negar classificação favorável; não inferir conformidade |
| Resolução de bloqueio | `block` + evidência nova + nova avaliação favorável por SST atribuído e concedido | Nova liberação técnica pode ser registrada; bloqueio e avaliação anteriores permanecem |
| Desatualização | Decisão usa avaliação cujo fingerprint/política/evidências não correspondem ao estado atual | Negar e exigir compilação/reavaliação |
| Conditional allowed | Gestor designado decide com plano e grant vigentes | Registrar decisão + fontes/auditoria; pendência fica aberta |
| API | Aplicação pede qualquer ação técnica/gerencial ou identity de usuário | Negar; principal de máquina não se torna ator humano |
| RLS | Tenant C lê IDs coincidentes do tenant D; contexto ausente | Zero acesso/erro fechado, sem linha cruzada |
| Revogação concorrente | Decisão bloqueia grant e outra transação tenta revogar | Serialização previsível: decisão confirma antes da revogação ou aguarda e a próxima é negada |
| Grant-base | Revogar grant-base usado por descendente e tentar usá-lo | Descendente fica ineficaz atomicamente; nenhum intervalo de uso posterior |
| Trilha | Forçar falha depois de inserir decisão e antes da auditoria | Rollback remove decisão e fontes; não há decisão sem auditoria |
| Imutabilidade | Alterar/excluir decisão ou apagar evento por runtime | Negar; histórico continua igual |
| Dados sensíveis | Consultar auditoria/decisão com papel de gestor | Nenhum PDF, diagnóstico ou conteúdo clínico presente |

## Critério para fechar a prova

Todos os casos críticos passam sob papel runtime limitado; tenant e usuário cruzados retornam negação sem vazamento; concorrência/revogação e rollback são observados com duas conexões; o ledger do container contém somente fixtures da prova; limpeza confirmada. Registrar versões do PostgreSQL, migrations aplicadas, comandos e códigos de resultado sem segredos nem dados pessoais.

Falha de parse ou de segurança exige corrigir o schema candidato e repetir o roteiro inteiro num novo container descartável. Resultado dessa prova não autoriza migration, importação, integração ao runtime, alteração de dados ativos ou publicação.
