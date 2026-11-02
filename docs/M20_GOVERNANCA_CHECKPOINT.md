# M20 — Governança operacional fictícia

2026-10-11. Usuário autorizou com “PODE CONTINUAR” após fila local e reiterou “CONTINUA” durante a validação. Mantido escopo inteiramente fictício. Esta fatia aguarda teste humano; governança normativa e readiness completa do M20 ainda pendentes. M21 não iniciado.

## Entrega
Área `/master/governanca`, com acesso Master no servidor e link no painel. Política técnica de retenção apenas para a fila demonstrativa: 1 a 365 dias após último evento da tarefa terminal. Padrão inicial 30 dias e bloqueio de descarte ativo. Tarefa em andamento nunca é elegível; bloqueio elimina toda elegibilidade. A política apenas simula, sem apagar registros. Prazo técnico não é prazo normativo e não afeta documentos SST, saúde, billing ou auditoria.

Alterações da política exigem revisão atual e justificativa, guardam antes/depois/autor/data. Incidentes fictícios seguem Aberto → Em análise → Resolvido, com justificativa e revisão a cada etapa. Formulários antigos e saltos são rejeitados. Resolver incidente não altera a fila nem corrige tarefa automaticamente.

Exportação autenticada `/api/operations-export`, JSON para download, sem cache. Projeta política, IDs/estados/datas da fila e outbox, IDs/estados/revisões dos incidentes. Exclui chaves, justificativas, títulos/descrições de incidentes e todos os módulos regulatórios/médicos. Manifesto SHA-256 calculado sobre a string UTF-8 `payload` incluída no envelope. Confere integridade do conteúdo; não é assinatura digital nem comprovação de origem. Todas as operações relevantes são auditadas, com limite administrativo compartilhado nas mutações e exportação.

## Verificação
- Suite completa: 98 testes aprovados, zero falhas. `node --experimental-strip-types --test --test-concurrency=1 <app>/tests/*.test.ts <app>/tests/*.test.mjs`, em pasta temporária fora das restrições Windows. Log: `examples/app/data/m20-governance-tests.txt`.
- Quatro testes novos cobrem autorização/revisão/validação de política; bloqueio, último evento e tarefas em curso; transições/histórico de incidentes; projeção de exportação e manifesto verificável.
- TypeScript `node node_modules/typescript/bin/tsc --noEmit`: aprovado. ESLint dos arquivos novos/alterados: aprovado; configuração Next também verificada após ajuste.
- Build inicial falhou com EPERM ao remover saída anterior em `.next/static`. Nenhum arquivo bloqueado foi apagado à força. Configurado diretório dedicado de verificação, selecionável por `SST_ISOLATED_BUILD=1` e ignorado pelo Git. Build isolado `node node_modules/next/dist/bin/next build` aprovado, incluindo página e endpoint. Sem o sinalizador, saída padrão continua `.next`. Next adicionou includes de tipos da saída isolada ao tsconfig.json.
- Navegador: política 45 dias com bloqueio ativo, incidente aberto/analisado/resolvido e histórico de três etapas preservado. Contagem de falhas da fila permaneceu 1. Zero elegíveis, nada removido.
- Download realizado pelo navegador em `C:/Users/elias/Downloads/sst-operacao-ficticia.json`. Conferência independente PowerShell do SHA-256 e número de bytes UTF-8: ambos verdadeiros; escopo `operational_mock_only`. O download demorou, mas foi concluído e validado.
- Visual desktop 1280 × 900 e celular 390 × 844 nas áreas observadas, sem transbordamento visível; tamanho restaurado. Evidências: `assets/m20-governanca-desktop.jpg`, `assets/m20-governanca-celular.jpg`.

## Arquivos
Novos: `src/lib/operations-governance.ts`; `src/app/master/governanca/page.tsx`, `actions.ts`, `panel.tsx`; `src/app/api/operations-export/route.ts`; `tests/operations-governance.test.ts`.
Alterados: `src/lib/audit-log.ts`, `src/app/master/master-dashboard.tsx`, `next.config.ts`, `.gitignore`, `tsconfig.json` (Next). Dados fictícios em `data/operations-governance.json`, ignorados pelo Git. Documentação: este checkpoint, M20_CHECKPOINT.md, CHANGELOG.md e DECISION_LOG.md.

## Roteiro humano
1. Abrir `/master/governanca` como Master; confirmar prazo e bloqueio ativo.
2. Alterar prazo com justificativa fictícia; conferir histórico. Desmarcar bloqueio altera somente simulação, sem descarte. Restaurar bloqueio depois do teste.
3. Registrar incidente fictício, iniciar análise e registrar resolução com justificativas. Conferir histórico e que a falha da fila permanece.
4. Baixar retrato operacional e conferir o manifesto sobre `payload`, sem incluir a formatação do envelope no cálculo.

## Limites e próximo passo
JSON local, sem coordenação entre processos, banco transacional, proteção contra edição manual ou criptografia do arquivo. Bloqueio de descarte é indicador técnico da simulação; não implementa legal hold documental real. Exportação é retrato de dois arquivos lidos sequencialmente, não backup consistente de todos os módulos. Não há restore, descarte, automação de incidentes, reabertura ou deduplicação de criação de incidentes. Histórico guardado completo, tela limitada às últimas 30 entradas. Governança normativa, revisão completa de acessibilidade e performance permanecem no M20. Nenhuma liberação para produção.
