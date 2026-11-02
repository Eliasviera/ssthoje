# M20 — Consistência do dia de vigência

2026-10-11. Corrigida diferença entre avaliação de checklist (dia UTC) e revisão de referências (America/Sao_Paulo). Entre 21h e meia-noite locais, a avaliação poderia considerar dia posterior ao da revisão. Ambas agora usam saoPauloDate, que monta YYYY-MM-DD com partes da data no fuso de São Paulo, sem depender da ordem de formatação do idioma. Não altera timestamps de histórico nem datas previamente cadastradas.

Arquivos: src/lib/business-date.ts (novo), src/lib/reference-governance.ts, src/app/compliance-actions.ts, tests/business-date.test.ts (novo). tsconfig.json recebeu automaticamente os tipos do build isolado. Documentação: este checkpoint, M20_CHECKPOINT.md, CHANGELOG.md e DECISION_LOG.md.

Verificação: dois testes novos cobrem o instante anterior e posterior à meia-noite local, virada de ano e dia bissexto. Suite completa em diretório temporário: 104 aprovados, zero falhas (log data/m20-date-tests.txt). Comando node --experimental-strip-types --test --test-concurrency=1 com os arquivos tests/*.test.ts e tests/*.test.mjs. ESLint dos quatro arquivos alterados: exit 0. Build isolado m20-20261011134829: exit 0, incluindo TypeScript e 19 páginas. Tela lateral continuou visível em /master/operacao, sem alteração de sessão ou de dados pela UI.

Escopo: dia civil somente do checklist e revisão de referências. Não é revisão global de datas de todos os módulos. Não presume norma, prazo ou conformidade. M20 permanece aberto para aceite humano; M21 não iniciado.
