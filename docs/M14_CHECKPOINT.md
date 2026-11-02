# M14 — Painel operacional e avisos locais

Demonstração concluída em 2026-10-10, após autorização de avanço do M13. Usuário respondeu “continua” em 2026-10-10, autorizando avanço ao M15. Aceite da demonstração, sem liberação profissional ou de produção.

## Entrega
- Início reúne empresas e trabalhadores ativos e tarefas de documentos, terceiros, correções e confirmações fictícias de EPI. Administradora e SST acessam somente a própria consultoria, sem conteúdo clínico.
- Administradora define ou remove prazo interno com justificativa e histórico. A data original de validade documental permanece preservada. Ordenação por data não representa avaliação de risco, obrigação legal ou conformidade.
- Avisos por conta e consultoria, com leitura, histórico, deduplicação e preferências de categorias e antecedência técnica de 0 a 30 dias. Desativar avisos não oculta tarefas.
- Contextos resolvidos ou alterados encerram o aviso anterior, preservando seu registro. Nenhuma aprovação automática de documentos.
- Avisos gerados somente ao abrir/atualizar o painel; sem processo em segundo plano, e-mail, SMS ou integração externa.

## Verificação executada
- `node --experimental-strip-types --test tests/*.test.ts`: 52 aprovados, zero falhas. Oito testes novos cobrem autorização, isolamento, projeção sem dados clínicos, datas de Brasília, prazos/histórico, deduplicação, leitura, preferências, resolução e auditoria.
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- ESLint nos arquivos TypeScript alterados: aprovado.
- Navegador: prazo interno fictício para 10/10/2026, prioridade de hoje, leitura e atualização sem duplicar avisos; silenciamento e reativação com tarefa preservada. Preferências reativadas ao final.
- Desktop 1280 × 900 e celular 390 × 844 conferidos, sem transbordamento horizontal. Evidências: `assets/m14-painel.png` e `assets/m14-celular.png`.
- Não foi executado build de produção nem integração externa.

## Como testar
1. Abra http://127.0.0.1:3000/ e escolha Início na conta administradora de demonstração.
2. Confira Treinamento aguardando envio e abra Configurar prazo interno. Informe uma data e justificativa fictícias.
3. Atualize o painel e confira a prioridade. Em Exibir avisos, selecione Histórico para ver contextos anteriores preservados.
4. Teste leitura e preferências; confira que as tarefas continuam disponíveis.

## Arquivos alterados
Na aplicação `examples/app`: `src/lib/operations-store.ts`, `src/lib/operations-service.ts`, `src/lib/tenant-access.ts`, `src/lib/audit-log.ts`, `src/app/operations-actions.ts`, `src/app/operations-section.tsx`, `src/app/page.tsx`, `src/app/dashboard.tsx`, `src/app/globals.css` e `tests/operations.test.ts`. Persistência demonstrativa em `data/operations.json` e eventos em `data/audit-log.jsonl` conforme armazenamento existente.
Documentação: `docs/DECISION_LOG.md`, `docs/M13_CHECKPOINT.md`, `docs/M14_CHECKPOINT.md`, `docs/CHANGELOG.md`. Evidências em `assets/m14-painel.png` e `assets/m14-celular.png`.

## Limites e próximo passo
Dados e fluxos locais de demonstração. Datas e validades exigem revisão humana; armazenamento JSON não constitui arquitetura de produção. Avanço para o M15 autorizado pelo usuário.

