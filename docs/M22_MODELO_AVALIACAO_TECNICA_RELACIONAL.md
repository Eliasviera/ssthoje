# M22 — Modelo relacional candidato de avaliação técnica

2026-10-18. Extensão não executada do schema candidato de grants. Define estrutura de histórico; não classifica documentos nem interpreta legislação.

## Vínculo entre avaliação, requisito e evidência

```text
policy_versions ── policy_items
       │                │
       └── technical_assessments ── technical_assessment_items
              │                              │
              │                              └── requisito da versão
              ├── technical_assessment_sources (manifesto de caso)
              └── analyst_assignments ── membership

technical_assessments ── decisions ── decision_sources
```

As referências do manifesto ainda não têm FK de domínio para a origem de evidência (pendente de reconciliação).

O SQL candidato ganhou três relações append-only:

- `technical_assessments`: uma revisão por caso, versão de política e atribuição; conserva empresa, unidade, terceira, fluxo, autor, justificativa, versão do contrato de fontes e fingerprint SHA-256 do conjunto.
- `technical_assessment_items`: um estado humano por requisito da versão, com fundamento. A FK composta obriga o requisito a pertencer à política referenciada pela avaliação.
- `technical_assessment_sources`: referências de caso (grupo, ID, revisão e fingerprint), alinhadas ao manifesto candidato v2 (`documents`, `requirements`, `evaluations`, `policies`, `criteria`). Não afirmam qual fonte comprova qual requisito; essa associação precisa de contrato autoritativo antes de ser criada.

`assessed_by` é ligado por FK composta ao analista da atribuição; apenas a existência desse vínculo estrutural não prova membership ativo, qualificação válida ou grant `analysis.recommend`. A função de emissão/avaliação terá de validar esses estados no commit.

## Decisão gerencial ou técnica

`decisions.technical_assessment_id` é obrigatório. A FK composta amarra avaliação, política, empresa, unidade, terceira e fluxo ao mesmo alvo da decisão. Assim, gestor não escolhe manualmente outra revisão/política para contornar pendência. A decisão armazena seu resultado próprio, e a avaliação permanece intacta.

O fingerprint de decisão deve coincidir com o fingerprint da avaliação atual e com o conjunto atual de evidências/política. Essa igualdade, cobertura de todos os itens da versão publicada e condição de “avaliação atual” são invariantes da função transacional, não de constraints DDL nesta proposta.

## Regras da função confiável ainda necessária

1. Derivar usuário/tenant da sessão autenticada e bloquear membership, grant, atribuição, terceira/fluxo e versão de política.
2. Verificar identidade do analista, validade da atribuição, qualificação, grant e designação do cliente no tenant da consultoria.
3. Bloquear a chave do caso para gerar `assessment_revision` sem duplicidade concorrente; não atualizar revisão anterior.
4. Exigir exatamente os requisitos ativos da versão de política. Evidências são referências versionadas; upload sozinho nunca cria estado `conforming`.
5. Exigir fundamento para todos os estados e evidência/referência adequada para `conforming`; `not_applicable` requer regra aplicável e justificativa explícita.
6. Calcular o efeito agregado da política e estado atual. `block` não permite exceção gerencial; pode ser resolvido por avaliação nova favorável de profissional autorizado, mantendo o bloqueio anterior no histórico.
7. Na decisão, revalidar fingerprint e versão atual. Se evidência, política, atribuição ou grant mudou, negar/recompilar; gravar decisão, fontes e auditoria atomicamente.
8. Impedir que um administrador, gestor, terceiro ou principal de API escreva avaliação/estado técnico.

## Limites e próxima reconciliação

O app contém `third-party-analysis-sources.mjs`, que compila manifesto candidato v2 com grupos `documents`, `requirements`, `evaluations`, `policies`, `criteria`, referências com revisão positiva e digest SHA-256. O grupo `criteria` entra no fingerprint; grupo ausente deixa `completeForTransactionalUse` falso e `assertCompleteAnalysisSourceManifest` rejeita o uso transacional incompleto e recalcula o fingerprint com serialização JSON canônica, independente da ordem de propriedades após persistência. `compileTransactionalAnalysisManifest` compõe o gate de extração (cinco fontes autoritativas/locked na mesma transação) com o compilador, inclui o ID da transação no fingerprint, exige que `policies[].revision` seja igual a `policyVersion` e só retorna um manifesto completo. O publicador candidato chama este helper, mas ainda não existe repositório que prove origem/lock nem cadastro de evidências autoritativo ligado por FK. O manifesto guarda dependências no nível do caso, não prova a relação fonte→requisito.

O contrato v2 entrega exatamente um snapshot agregado por grupo para cada avaliação. O DDL agora impõe unicidade `(tenant_id, assessment_id, source_kind)` em `technical_assessment_sources`; `decision_sources` também restringe os cinco grupos, IDs não vazios, revisão inteira positiva e digest SHA-256. Esses deltas recentes ainda precisam passar por nova Etapa A descartável antes de afirmar que o DDL atual foi revalidado.

| Campo/semântica existente | Relação proposta | Situação |
|---|---|---|
| Grupo + `id` + `revision` + `digest` | `technical_assessment_sources` por avaliação e grupo | Forma estrutural compatível; origem ainda precisa de FK autoritativa. |
| `contractorId` | `third_party_id` | Convites agrupam por CNPJ, mas não há cadastro de domínio/FK; CNPJ não prova que o ID opaco é a mesma entidade. |
| `scopeId` | `workflow_id` | O relatório agrupa vários convites por empresa/unidade/CNPJ/escopo textual; ID de convite não é chave do caso. Criar caso persistente compartilhado antes da FK. |
| `policyVersion` numérica | `policy_versions.id`/`version` | JSON tem versão numérica, mas lookup atual não fixa/publica versão imutável; quando versionado no runtime, resolver pela chave tenant+empresa+unidade+version, nunca converter número em UUID. |
| `ComplianceEvaluation.result` | `technical_state` | `atende`/`inconclusivo` têm estados próximos, mas `pendente` é ambíguo e `nao_aplicavel` legado não exige autorização de política equivalente. Preservar resultado original; conversão exige revisão humana, evidência atual e política aplicável. |
| `pending[].id` | `requirement_code` | Gate atual emite texto montado de `documentKind`, título da regra e/ou nota livre; `ComplianceRule.id` é UUID de uma revisão, sem campo de código estável. Não há mapeamento um-para-um. Criar/associar explicitamente `requirement_code` no catálogo e fazer a avaliação retornar esse código antes de mapear. |
| `pending[].level` (`inform`, `authorization`, `block`) | Efeito da política/estado técnico | Vocabulários diferentes; equivalência requer decisão explícita. No gate atual, todo blocker mantém `ready=false`, então `inform`/`authorization` também não liberam nem abrem decisão condicionada. A leitura do nível pode cair no default para blocker `documentKind · título: motivo`. `authorization` não vira automaticamente `conditional_allowed`. |

### Dados preservados pela avaliação legada e lacunas de proveniência

`recordComplianceEvaluation` grava uma cópia dos dados visíveis da regra e do documento, incluindo `ruleId/ruleVersion`, `sourceTitle/sourceVersion`, `documentId/documentVersion`, resultado, justificativa, evidência textual ou vínculo opcional, responsável/próximo passo e `evaluatedBy/evaluatorRole/evaluatedAt`. Para documento de contratada, a ação exige a versão atual do recibo no momento da avaliação; o recibo também tem digest no store de terceiros. Isso oferece referências para revisão humana, mas não forma ainda um snapshot transacional único.

- `documentId` identifica o recibo legado, sem FK para `workflow_id` ou `third_party_id`; a versão é calculada pela contagem de recibos do tipo no agrupamento CNPJ/escopo, não por UUID de versão relacional. O digest continua no store de terceiros, não dentro do snapshot da avaliação.
- `ruleId` é UUID da revisão e `previousRuleId` liga revisões; nenhum deles é o `requirement_code` lógico estável. `documentKind` pode ter várias regras distintas.
- `evaluatedBy` e `evaluatorRole` registram a afirmação do momento, mas não congelam membership ativa, atribuição/grant nem qualificação do autor na mesma transação. A ação grava a avaliação e emite auditoria em stores separados.
- `evidenceDocumentId` opcional hoje valida um documento do store da consultoria; não é uma referência genérica a evidência médica/terceiro.

Consequência: uma revisão legada pode ser apresentada para conferência por pessoa, mas não pode ser promovida automaticamente a `technical_assessment_item`. A conversão depende da ligação caso/terceiro, código estável de requisito, estado escolhido, evidência atual/digest, autorização do avaliador e gravação transacional no modelo novo; a original permanece intacta.

A avaliação proposta também guarda estado técnico por requisito; o manifesto antigo não contém esse estado, então não importá-lo como avaliação humana.

`third-party-postgres-read-model.sql` contém snapshots imutáveis de importação/leitura e não deve ser tratado como cadastro operacional ou origem de novas avaliações. O candidato `third-party-analysis-candidate.sql` também pertence a um conjunto de prova descartável próprio; não compor schemas com nomes/ownership incompatíveis sem uma revisão de dependências.

Antes de criar FK de evidência, identificar qual registro autoritativo representa arquivo recebido, revisão, protocolo e empresa/unidade; associar apenas com prova de identidade existente. Não ligar por nome ou ordem. Se o legado não tiver chave confiável, manter origem histórica sem relação presumida e solicitar associação explícita em fluxo posterior. Até lá, registrar snapshots de dependência e fingerprint do manifesto no nível do caso; nunca replicar todas as fontes como se sustentassem cada item.

## Estado da entrega

As tabelas foram acrescentadas apenas a `operational-authority-grants-candidate.sql`, fora de `db/migrations`; listas candidatas de RLS forçada e triggers de imutabilidade incluem as três relações. O SQL não foi parseado/executado, não há função de escrita autorizada, nenhuma migration/runtime/banco foi alterado e Docker/WSL segue bloqueando a prova descartável. Próximo passo: reconciliar as referências de evidência e Terceiros, então fazer revisão estática do DDL completo antes da etapa A do roteiro PostgreSQL.
