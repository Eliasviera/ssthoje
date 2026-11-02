# M22 — Modelo relacional candidato para autoridade operacional

2026-10-18. Proposta lógica de dados e schema SQL candidato separado; sem migration, runtime ou validação PostgreSQL.

## Decisão do modelo

Papéis como `client_sst`, `client_manager` e `consultancy_sst` são agrupamentos de configuração para facilitar a concessão. Ao atribuir um papel, o sistema emite grants individuais para as ações do catálogo, com escopo e validade próprios. A autorização em tempo de execução consulta sempre o `action_code`; não basta verificar um texto de papel.

Administração do tenant é uma trilha distinta: `tenant.authorization.grant` permite delegar grants somente abaixo do teto de delegação do ator. Essa ação administrativa não cria por si só autoridade técnica ou gerencial. SaaS Master não é grantável por tenant.

## Entidades propostas

| Entidade | Conteúdo e invariantes |
|---|---|
| `authority_action_catalog` | Código imutável, versão do catálogo, trilha, escopo obrigatório, elegibilidade humana/máquina e regras de política. Nenhum código arbitrário enviado pelo cliente. |
| `tenant_role_presets` + `tenant_role_preset_actions` | Rótulos e agrupamentos de ações configuráveis dentro do catálogo permitido. Alterar um preset afeta concessões futuras, não grants emitidos anteriormente. Papéis de plataforma não são editáveis pelo tenant. |
| `authority_grants` | Concessão individual: tenant, principal, action code, escopo, validade, emissor, grant-base, autorização do representante do cliente quando aplicável, preset de origem opcional e revisão do catálogo. Uma linha é uma ação; alteração de escopo/ação significa nova concessão, não edição. |
| `authority_grant_events` | Emissão, revogação e negação com ator, instante, motivo e snapshot. Append-only com proteção no banco; o estado efetivo deriva da emissão e do evento de revogação. |
| `third_party_assignments` + eventos | Atribui analista humano a empresa/unidade/terceira/fluxo e finalidade técnica. Não concede ação; deve coexistir com grant `analysis.recommend`. Consultoria e cliente têm atribuições separadas. |
| `operational_policy_versions` + `policy_items` | Política por tenant/empresa/unidade/escopo com versão, publicador, revisor, instante de início (`effective_at`), autorização do representante do cliente quando aplicável e efeito por requisito. A versão vale até a próxima versão da mesma unidade; referências normativas preservam sua própria vigência. Revisão publica nova versão e não altera política/decisão anterior. |
| `technical_assessments`, `technical_assessment_items`, `technical_assessment_sources` | Revisão humana imutável por empresa/unidade/terceira/fluxo e versão de política; estado por requisito, autor que coincide com profissional atribuído e manifesto das dependências de caso. O manifesto ainda não associa cada fonte a cada requisito; upload não altera avaliação. |
| `operational_decisions` + `decision_sources` | Decisão gerencial ou técnica imutável vinculada ao grant/revisão, avaliação técnica exata, política/versão, escopo e fontes efetivamente lidas. A chave composta obriga que avaliação e decisão tratem do mesmo caso e política. Armazena o resultado sem substituir a análise SST. |
| `authority_audit_events` | Negação/uso de autoridade e referências de revisão. Sem dados clínicos; alvo e escopo tenant-scoped. Escrita atômica com a operação. |

Identidade de usuário vem de provedor/sessão confiável existente; membership valida pertencimento ao tenant, mas não autentica sozinho. Aplicativos ficam em principal de máquina separado com allowlist, credencial fingerprint, validade, rotação, cotas técnicas e eventos próprios. Não recebem grants humanos nem preset decisório.

## Chaves e escopo relacional

- Todas as tabelas de domínio carregam `tenant_id`; chaves estrangeiras compostas incluem `tenant_id` para impedir vínculo cruzado.
- Grant referencia membership humano ativo ou principal de máquina, de acordo com tipo; nunca ambos.
- Unidade deve pertencer à empresa indicada. Terceira e fluxo devem pertencer ao mesmo tenant/empresa/unidade conforme os registros autoritativos.
- Dimensões nulas significam “não especificado” e não expandem escopo. Tenant inteiro requer sinalização explícita e ação que aceite esse escopo.
- Ações SST/mobilização carregam unidade explícita; unidades criadas depois não herdam grants. Admin do tenant e permissões operacionais usam escopos distintos.
- `action_code` deve existir no catálogo e seu escopo requerido tem de estar completo antes da emissão.
- `valid_from < valid_until` quando houver fim. Operação valida vigência com relógio do servidor.
- Emissor e `grant_base_id` devem provar autorização administrativa ativa, anterior à concessão e com escopo/teto suficiente. Proibir ciclos na cadeia de delegação.
- No tenant da consultoria, administrador da consultoria não representa automaticamente o cliente: um representante de concessão designado pelo cliente autoriza a atribuição e as concessões de autoridade do cliente no escopo registrado.
- Representante e atribuição SST precisam corresponder à mesma empresa/unidade; suspensão do membership invalida e revoga concessões/atribuições, e reativação não restaura autoridade antiga.
- Avaliação vincula política e atribuição do analista ao mesmo tenant/empresa/unidade/terceira/fluxo; `assessed_by` deve ser o usuário da atribuição ativa.
- Cada item da avaliação referencia requisito da versão de política; manifesto por caso segue grupos/revisões/fingerprints do compilador candidato. Mapeamento de fonte por requisito e FKs de Terceiros ainda aguardam origem autoritativa.
- Decisão tem referência composta à avaliação e à política/escopo exatos, além de grant e fontes; dados de snapshot são calculados pelo servidor.
- A política da decisão deve coincidir exatamente com o tenant/empresa/unidade do caso. O servidor escolhe a versão de maior `effective_at` que não seja posterior ao instante decisório; publicação deve bloquear a unidade e exigir instante estritamente posterior à última versão, sem retroatividade.

RLS forçada em todas as relações tenant-owned, `NOBYPASSRLS` para runtime, privilégios diretos revogados e operações expostas por funções server-side com contexto de sessão confiável. Eventos e decisões não aceitam UPDATE/DELETE/TRUNCATE pelo runtime; revogação é novo evento. Proteção do caminho `SECURITY DEFINER` precisa ser comprovada, incluindo dono, `search_path`, políticas e permissões sobre tabelas legadas.

## Mapa ação → elegibilidade → dependências

| Ação do catálogo | Quem pode receber | Condição adicional além do grant |
|---|---|---|
| `thirdparty.analysis.recommend` | SST cliente ou SST consultoria | Atribuição vigente ao alvo e competência registrada conforme fluxo do cliente |
| `thirdparty.policy.manage` | SST do cliente ou responsável de política designado separadamente | Grant específico por empresa/unidade; publicação versionada e revisada; não implica decisão de mobilização |
| `thirdparty.requirement.set`, `.technical.block`, `.technical.release` | SST do cliente | Política/escopo vigentes; `block` sem resolução atual nega release; reavaliação favorável pode permitir nova liberação preservando histórico |
| `thirdparty.mobilization.require_pre_entry_correction`, `.authorize_conditional_entry` | Gestor/dono do cliente | Grant gerencial; decisão pré-cadastrada; `conditional_allowed` para ingresso condicionado |
| `thirdparty.analysis.return_to_sst` | SST do cliente ou gestor/dono | Motivo obrigatório; cria encaminhamento; reanálise da consultoria requer nova atribuição |
| `tenant.authorization.grant` | Administrador delegado do tenant | Alvo/ação/escopo abaixo do teto e grant-base; nunca SaaS Master |
| Ações de evidência/leitura | Terceiro próprio ou API allowlisted | Escopo restrito à própria terceira/documentos autorizados; API não recebe decisão humana |

Um papel de preset pode oferecer combinações dessas ações, mas cada grant emitido mantém autor, alvo, ação, escopo, validade e histórico individuais. Função profissional cadastrada é qualificação, não autorização.

## Transações de negócio

### Emitir grants de preset

Em uma transação: autenticar concedente; validar tenant e membership; bloquear grant-base/teto; validar alvo, ações do catálogo e escopos; criar um grant por ação; registrar cada emissão e auditoria. Se qualquer ação for inválida, desfazer o conjunto para evitar preset parcialmente aplicado. A concessão-base fica identificada em cada grant.

### Revogar ou suspender

Bloquear a linha de autoridade usada para serializar com decisões em andamento; anexar evento de revogação e auditoria na mesma transação. A suspensão do membership ou da atribuição torna a autoridade inefetiva imediatamente por validação de estado, mesmo que se processe a revogação dos grants em lote. Reativação não restaura grants revogados.

### Decidir mobilização

Em uma transação única: derivar identidade/tenant; bloquear membership, grant, atribuição, escopo do fluxo e versão de política; validar que a avaliação SST referenciada cobre os requisitos e ainda corresponde ao fingerprint das fontes atuais; aplicar somente a transição gerencial permitida; inserir decisão e fontes/revisões; inserir auditoria. Se alguma referência mudou, faltar ou houver bloqueio obrigatório não resolvido, rollback e negação clara. Se a avaliação estiver desatualizada, retornar para reavaliação SST em vez de compilar ou alterar avaliação pelo gestor. Ingresso condicionado mantém pendências abertas; decisão anterior nunca é atualizada.

## Invariantes verificáveis antes de ligar à UI

1. Grant administrativo não autoriza análise, bloqueio técnico nem mobilização.
2. Grant técnico não autoriza decisão gerencial; recomendação da consultoria não autoriza mobilização do cliente.
3. Conta suspensa, grant revogado/expirado ou atribuição encerrada falha antes da gravação.
4. Escopo cruzado entre tenant, empresa, unidade, terceira ou fluxo não produz linhas acessíveis nem decisão.
5. Evento/decisão sem versão da política e fontes requeridas não pode ser confirmado.
6. Efeito `block` impede ingresso enquanto a pendência não está resolvida e nunca permite exceção gerencial; nova evidência + avaliação SST favorável pode permitir nova liberação técnica, com histórico preservado.
7. Corrida entre revogação e decisão serializa; ou a decisão confirma antes da revogação, ou a decisão posterior é negada.
8. Preset alterado não muda autoridade histórica; revogação não apaga emissão nem decisão passada.
9. API não executa ação decisória, mesmo que a credencial solicite o código.
10. Auditoria não contém diagnóstico, resultado clínico ou PDF médico.

## Etapas seguintes

1. Reconciliar IDs e revisões do cadastro autoritativo de evidências, terceiros e fluxos; preservar separação entre snapshots de importação e registros operacionais.
2. Fazer inspeção estática completa do schema candidato, incluindo avaliação técnica, RLS, FKs compostas, autoria e histórico.
3. Quando PostgreSQL descartável estiver disponível, provar RLS, transação, concorrência, cadeia de delegação, expiração, revogação, append-only e negação de escopo cruzado.
4. Somente após a prova: preparar adaptadores desconectados e interface de administração de grants, com fixtures fictícias. Runtime e banco ativo permanecem intocados até autorização específica.

O SQL candidato foi ampliado com avaliação por requisito e FK composta da decisão, mas ainda não foi parseado/executado pelo PostgreSQL. Docker/WSL continua indisponível nesta sessão.
