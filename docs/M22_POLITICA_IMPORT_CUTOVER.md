# M22 — Decisão de importação e cutover da política de rigor

Data: 2026-10-18  
Estado: decisão atual — política fora do cutover, JSON continua como fonte operacional.

## Estado confirmado

- Há uma política v1 no JSON local. A reconciliação autenticada confirmou 1 correspondência de empresa/unidade e 0 divergências no PostgreSQL persistente do tenant. O conteúdo operacional da política continua no JSON; não foi importado.
- O histórico próprio da política está incompleto. O usuário escolheu atestar o snapshot atual no futuro, sem alegar autoria ou revisão histórica, com efeito somente a partir do timestamp da atestação.
- O usuário aprovou manter analistas e aprovadores fictícios até o cadastro futuro. Esses atores foram usados somente no PostgreSQL descartável.
- O adaptador candidato preserva o snapshot inteiro como `legacy_unverified`, calcula um digest determinístico e recusa versão legada que não começa em v1.
- A prova isolada passou. O escopo foi semeado no container a partir do JSON, então a prova não confirma o cadastro no banco persistente. Ela não altera o JSON, não liga o runtime e não constitui aceite de produção.

## Caminhos

| Opção | Ação | Efeito | Portões necessários |
|---|---|---|---|
| A — manter JSON ativo | Não importar. Continuar apenas preparação e provas descartáveis. | O app segue com o comportamento atual; PostgreSQL candidato não é fonte operacional. | Nenhuma escrita. A política legada permanece com histórico incompleto. |
| B — importar como legado não verificado | Aplicar schema no PostgreSQL persistente e gravar v1 com provenance `legacy_unverified`, sem atestação e sem trocar o runtime. | Cria uma cópia versionada no banco, mas não a torna efetiva nem muda o gate atual. | Autorização explícita separada para migration e importação; backup verificado; reconciliação final; ator técnico autenticado para importação; confirmação de que JSON e banco não divergem no momento da gravação. |
| C — preparar cutover após cadastro | Manter JSON ativo até existir cadastro/autenticação do gestor do cliente; então importar, o gestor conferir o snapshot/digest e atestar; ligar leitura do runtime em etapa posterior. | PostgreSQL pode virar fonte autoritativa após UAT e aceite, sem dupla escrita. | Identidade e vínculo do cliente; atribuição/revogação auditável; adaptador transacional das dependências; migration/importação autorizadas separadamente; UAT e aceite do corte. |

## Recomendação técnica

Seguir a opção A enquanto os responsáveis não estiverem cadastrados: manter o runtime e a fonte JSON atuais e usar atores fictícios somente em ambientes descartáveis. Isso preserva o escopo escolhido pelo usuário e evita apresentar a atestação sintética como aprovação real. A opção B é tecnicamente possível, mas não é necessária para continuar o desenvolvimento e exige autorização específica para alterar o banco persistente. A opção C é o destino de cutover futuro, depois de identidade, transação e aceite humano.

## Limites de autorização

O aceite “atestar o snapshot atual” define o tratamento futuro da política; não executa migration, importação, atestação no banco persistente, mudança de fonte, publicação nem ativação no painel. Os IDs `importador-demo`, `analista-demo` e `gestor-cliente-demo` são fixtures e não podem ser usados como usuários do banco ativo. Nenhum caminho de cutover pode inferir autoria histórica ou retroagir a vigência.

## Registro de decisão posterior — 2026-10-18

O usuário escolheu **2 — manter a política fora do cutover, preservando a dependência do JSON**. Esta é a decisão vigente e substitui a autorização anterior da opção B para importar uma cópia `legacy_unverified`. A política não será importada ao PostgreSQL persistente nesta etapa; nenhuma atestação será criada e o runtime continua lendo o JSON.

A autorização anterior de opção B fica encerrada por esta escolha posterior. Ela não deve ser usada para iniciar migration/importação. A futura publicação de uma nova versão aprovada segue recomendada tecnicamente, mas requer identidade autenticada do responsável do cliente, fluxo de revisão/publicação e autorização de implementação/cutover próprias. A atestação presente do snapshot, ainda que aprovada em etapa anterior como tratamento histórico, não será executada no banco/runtime enquanto a política permanecer fora do cutover.

## Estado de integração confirmado — 2026-10-18

Inspeção estática do runtime confirma que `third-party-store.ts` obtém a política via `third-party-rigor-policy.ts`, que lê `data/third-party-rigor-policies.json`; o fingerprint operacional inclui esse objeto JSON. O módulo `third-party-rigor-postgres-read.ts` também lê o JSON para reconciliação, e não constitui fonte operacional PostgreSQL. Portanto, preservar essa dependência é coerente com a escolha atual. Não há ligação do catálogo candidato de políticas ao runtime.

## Próxima decisão

Enquanto não houver autorização específica de escrita, preservar a fonte atual (opção A recomendada). A reconciliação positiva do escopo não autoriza opção B ou C; continuar com trabalho reversível e provas em banco descartável até cadastro dos responsáveis e checkpoint/autorização específicos.

## Atualização após leitura autenticada — 2026-10-18

A rota de reconciliação read-only, consultada pelo usuário após autenticação, retornou `ok`: 1 política na origem JSON, 1 correspondência de escopo empresa/unidade no PostgreSQL persistente do tenant, 0 divergências, 1 empresa com histórico agregado, nenhum erro. O histórico próprio da política continua indisponível (`policyHistoryAvailable=false`), então `readyForImport=false`. A confirmação elimina apenas o bloqueio de referência de empresa/unidade; não importa a política, não valida autoria histórica e não autoriza migration ou cutover. Manter a recomendação de opção A até cadastro dos responsáveis e autorização/checkpoint específico.




## Registro histórico de autorização — superado em 2026-10-18

Em uma etapa anterior, o usuário autorizou a opção B (importar uma cópia como legado não verificado, sem cutover). Essa autorização não incluía atestação ou ativação. **Ela foi superada pela decisão posterior de manter a política fora do cutover e preservar o JSON como fonte operacional.** Não executar a importação B com base neste registro histórico. A política e o runtime permanecem inalterados.
