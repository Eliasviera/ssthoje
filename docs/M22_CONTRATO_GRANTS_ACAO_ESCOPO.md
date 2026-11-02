# M22 — Contrato candidato de concessões por ação e escopo

2026-10-18. Especificação funcional; ainda sem migration, integração ao runtime ou decisão jurídica automatizada.

## Finalidade

Definir como o sistema prova que um principal pode executar uma ação específica sobre um alvo específico, no estado atual do fluxo. O grant é uma concessão administrativa auditável; não substitui autenticação, atribuição ao fluxo, qualificação profissional, política vigente ou validação da transição.

## Identidade da concessão

Cada concessão humana deve conter:

- `grantId` imutável e `revision` monotônica;
- `tenantId`, `principalUserId` e exatamente um `actionCode` do catálogo;
- escopo explícito: `companyId`, `unitId`, `thirdPartyId` e/ou `workflowId` conforme exigidos pela ação;
- `validFrom`, `validUntil` opcional, estado (`active`/`revoked`) e motivo;
- ator autenticado que concedeu, instante do servidor e concessão-base que autoriza a delegação;
- referência à trilha/papel operacional, sem transformar título em permissão implícita.

Uma API usa identidade própria de máquina e allowlist equivalente de ações/escopos. Não recebe `principalUserId` humano nem pode assinar decisão de SST ou do gestor.

## Regra de escopo

O escopo do grant deve cobrir integralmente o alvo da ação. Grant de empresa cobre suas unidades somente se essa abrangência estiver explicitamente indicada; grant de unidade não cobre a empresa inteira. Terceira e fluxo são filtros adicionais, nunca expansão implícita. Escopo ausente, incompatível ou global sem concessão expressa nega a operação. Tenant vem da sessão validada, não do navegador.

Para consultoria, exigir atribuição vigente e separada ao cliente/unidade/terceira/fluxo. O grant técnico de consultoria continua recomendatório. Para cliente direto, a hierarquia é mantida pelo administrador provisionado do próprio tenant. A ausência de SST do cliente não atribui poder decisório à consultoria.

## Delegação e ciclo de vida

1. Concedente deve estar ativo e possuir autoridade administrativa delegável no tenant, ação administrativa explícita e escopo que contenha o grant solicitado.
2. Negar autoatribuição, concessão acima do teto, criação de SaaS Master pelo tenant, concessão de ação não delegável e concessões humanas por principal de máquina.
3. Alvo deve ser uma conta autenticável previamente cadastrada e membership ativo no mesmo tenant. Nome/e-mail digitado não comprova identidade.
4. Mudança relevante cria revisão/evento; não sobrescreve snapshot histórico. Mudança de escopo é revogação da concessão antiga e nova concessão.
5. Suspensão de conta, membership, tenant, atribuição, grant ou credencial bloqueia novas operações. Reativar a conta não reativa grants revogados. Nova autorização exige nova concessão.
6. Expiração é calculada pelo servidor. Nenhum cliente pode prolongar validade ou reativar/revogar grant diretamente por campo enviado.

## Avaliação no instante da ação

Na mesma transação serializável/consistente que valida e grava a ação, o servidor deve reler e bloquear, conforme necessário: identidade autenticada; membership/tenant; grant e revisão; atribuição; empresa/unidade/terceira/fluxo; estado atual; revisão e escopo da política; e versões das evidências/avaliações usadas. A operação registra as revisões lidas e falha se uma dependência mudar antes do commit. A decisão e auditoria são atômicas.

Ordem lógica: autenticação → tenant/modo → membership ativo → grant ativo e vigente → delegação-base válida → escopo cobre alvo → atribuição vigente → código permitido ao principal → transição possível → política/revisão permite efeito → estado das evidências atual → gravação e auditoria atômicas.

## Ações de Terceiros

- `thirdparty.analysis.recommend`: analista de SST atribuído registra avaliação/recomendação fundamentada. Consultoria não toma decisão final do cliente.
- `thirdparty.requirement.set`, `thirdparty.technical.block` e `thirdparty.technical.release`: autoridade SST do cliente concedida para escopo. Release é negado enquanto houver bloqueio obrigatório não resolvido; nova avaliação favorável, baseada em evidência atual e política vigente, pode permitir nova liberação sem apagar o bloqueio anterior.
- `thirdparty.mobilization.require_pre_entry_correction` e `thirdparty.mobilization.authorize_conditional_entry`: gestor/dono do cliente com grant gerencial separado. Ingresso condicionado exige efeito `conditional_allowed`; mantém pendências abertas e não altera parecer técnico.
- `thirdparty.analysis.return_to_sst`: encaminhamento por SST do cliente ou gestor/dono. A consultoria só reanalisa quando recebe nova atribuição; não decide o encaminhamento do cliente.
- Aplicativos limitam-se à allowlist não decisória do catálogo. Nenhuma automação cria ou altera grant humano.

Uma pendência com efeito `block` não pode ser superada por gestor, administrador, consultoria, SaaS Master ou API. A resolução técnica exige evidência nova e avaliação favorável de autoridade SST ativa e atribuída; mudar o efeito exige responsável competente, nova versão auditada e nova avaliação. Nenhum desses passos reescreve o histórico anterior. Ver `docs/M22_ESTADOS_AVALIACAO_TECNICA.md`.

## Evento mínimo de auditoria

Cada concessão, revisão, revogação, negação ou uso de autoridade registra: `eventId`, instante do servidor, `tenantId`, ator autenticado (ou principal de máquina), papel/trilha efetivos, `grantId` e revisão, ação, escopo/alvo, resultado, motivo quando exigido, revisão da atribuição, versão/fingerprint da política e IDs/revisões das fontes consultadas. Não copiar conteúdo clínico para a trilha administrativa. Eventos são append-only; correções criam novo evento.

## Matriz de negação

| Situação | Resultado |
|---|---|
| Conta/membership/tenant suspenso ou grant expirado/revogado | Negar |
| Escopo do grant não cobre empresa/unidade/terceira/fluxo | Negar |
| Analista sem atribuição vigente ou concedente fora do próprio teto | Negar |
| Política ausente, desatualizada ou sem versão vinculada | Negar a decisão de mobilização; encaminhar para revisão |
| Efeito `block` e pedido de ingresso condicionado/liberação técnica | Negar; manter bloqueio e pendência |
| Efeito `conditional_allowed` e gestor autorizado escolhe ingresso condicionado | Registrar decisão; pendência continua aberta |
| API solicita ação decisória humana ou identidade humana | Negar e auditar |

## Lacunas e sequência

O `operational-authority-catalog.json` é allowlist candidata, não implementação de grants. Os schemas de hierarchy/admin e de gestor cobrem partes distintas e ainda não compõem um único contrato. Antes de qualquer runtime: reconciliar tabelas e chaves; decidir origem autenticada de contas e bootstrap confiável; modelar grants técnicos e gerenciais por ação/escopo; versionar política/atribuição; provar RLS, concorrência/revogação, tenant cruzado, expiração e auditoria em PostgreSQL descartável. Até lá, não habilitar a decisão operacional por esse contrato.

### Comparação com os schemas candidatos existentes

| Artefato | O que representa | Lacuna frente a este contrato |
|---|---|---|
| `tenant-authority-candidate.sql` | Perfil do tenant, papéis administrativos, principals de app e cotas técnicas | Grants administrativos são por papel, sem `actionCode`, revisão/validade individual ou referência de concessão-base no registro. Não representa grants SST/gestor. Eventos têm snapshots, mas imutabilidade append-only não está forçada por trigger. |
| `manager-grants-candidate.sql` | Papel gestor/dono por usuário, empresa e unidade, com concedente separado | Papel não é grant por ação; não cobre SST, atribuição analítica, workflow/terceira, vigência do grant nem versão de política. Eventos registram grant/revogação, mas imutabilidade append-only não está forçada por trigger. |
| `operational-authority-catalog.json` | Ações permitidas e separação das trilhas | Não persiste quem recebeu cada ação, revisões, escopo concedido, atribuição, validade ou cadeia de delegação. |

Não combinar ou aplicar os schemas como estão. A próxima proposta de dados deve decidir se papéis são agrupamentos de conveniência que expandem para grants de ação explícitos ou se cada concessão será cadastrada diretamente por ação. Em ambos os casos, autorização efetiva é por ação e escopo; histórico append-only deve ser impedido no banco, não apenas recomendado no texto.
