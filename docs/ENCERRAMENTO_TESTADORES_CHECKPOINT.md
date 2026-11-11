# Encerramento de testes — diagnóstico somente leitura

Data: 2026-11-02. Continuação dos convites de testadores; a inspeção foi interrompida como prioridade de produto para confirmar o isolamento empresa/consultoria em `ISOLAMENTO_EMPRESA_E_CONSULTORIA.md`.

## Resultado concreto

Criados `examples/app/src/lib/trial-closure-preflight.ts`, `examples/app/scripts/trial-closure-dry-run.mjs` e `examples/app/tests/trial-closure-preflight.test.ts`.

O comando exige `--dry-run` (simulação somente leitura) e `--user-id=trial-user-UUID`. Não recebe tenant pelo terminal: deriva-o da conta vinculada ao convite e confere IDs, unicidade e datas. A saída contém apenas nomes fixos dos armazenamentos, contagens, metadados e hashes de leituras JSON. Não contém nomes/e-mails de pessoas, nomes dos arquivos enviados, conteúdo médico/documental, senhas ou tokens.

Exemplo de uso, na pasta do aplicativo, com ID fictício:

```powershell
node --experimental-strip-types scripts/trial-closure-dry-run.mjs --dry-run --user-id=trial-user-00000000-0000-4000-8000-000000000001
```

Não foi executado contra os cadastros ativos. Os testes exercitam a CLI em pastas temporárias exclusivamente sintéticas. Código de saída 2 significa diagnóstico concluído com exclusão bloqueada; 1 significa entrada/fonte inválida. `--apply` é rejeitado antes da leitura dos dados. Nenhuma função de exclusão existe neste módulo.

## Por que a exclusão segue bloqueada

- Arquivos JSON contêm registros de vários tenants; a trava do convite não bloqueia escritores de todos os módulos. Ainda não existe transação de encerramento que coordene todos eles.
- Existem arquivos por tenant, documentos de estoque sem diretório por tenant, fontes administrativas/médicas, banco PostgreSQL e backups externos ao cadastro. Apagar só a conta não comprova eliminação completa.
- A confirmação de uso fictício no formulário não prova que nenhum documento real foi enviado. A política aprovada de 30 dias se limita aos dados fictícios de demonstração.
- O diagnóstico não inventaria PostgreSQL ou backups, não abre arquivos médicos nem administrativos e marca fontes não reconhecidas como bloqueios. Não infere que um arquivo desconhecido pertence ao testador.
- A leitura não é snapshot transacional. O hash da observação inclui hashes dos JSONs analisados e contagens/metadados das pastas; não é uma prova criptográfica do conteúdo dos PDFs nem do estado integral de todos os armazenamentos.

Por isso, `eligibleByTime` pode ser verdadeiro enquanto `deletionAllowed` permanece **sempre falso**. Vencimento continua bloqueando acesso; exclusão automática continua não implementada.

## Critérios e validação

Critério desta etapa: inventário agregado do alvo correto, rejeição de escopo adulterado e preservação byte a byte de todos os arquivos sintéticos, inclusive os de outra consultoria. Conteúdo médico não é parseado; links simbólicos/junctions são rejeitados; fontes inválidas/novas e arquivos `.tmp`/`.lock` impedem qualquer alegação de prontidão.

Rodada final: **42 testes aprovados, zero falhas e zero ignorados**, executados pelo comando abaixo. Inclui a negação ao Master para 13 permissões operacionais sem tenant e com os dois tenants fictícios, troca de tenant por cada administrador, diagnóstico, CLI, convites, prazo, autenticação e isolamento. A junction temporária foi criada na execução fora do sandbox e o teste confirmou que não foi percorrida. A primeira rodada no sandbox tinha seis testes novos aprovados e um ignorado por permissão de junction; a rodada final executou os sete. Um erro inicial de sintaxe TypeScript não suportada no modo strip-only foi corrigido antes das rodadas aprovadas.

```powershell
node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/trial-closure-preflight.test.ts tests/invite-store.test.ts tests/trial-invitation.test.ts tests/tenant-access.test.ts tests/platform.test.ts tests/session-token.test.ts tests/asaas.test.ts
```

`node node_modules/typescript/bin/tsc --noEmit` e `node node_modules/eslint/bin/eslint.js src/lib/trial-closure-preflight.ts scripts/trial-closure-dry-run.mjs tests/trial-closure-preflight.test.ts tests/tenant-access.test.ts`: **aprovados, saída zero**. `git diff --check` também passou. Não houve nova compilação Next, pois não foram alteradas rotas ou componentes da aplicação. `tests/tenant-access.test.ts` recebeu a proteção de regressão de acesso do Master e troca de tenant.

Não houve alteração de permissões, dados ativos, documentos regulatórios, migrations, banco ou publicação. As duas falhas antigas de PGR/APR da suíte completa não foram trabalhadas nesta etapa.

Próximo passo: priorizar a autoridade de acesso confirmada pelo usuário; retomar a coordenação de escritores, inventário relacional e política de backups antes de implementar ou agendar a exclusão.
