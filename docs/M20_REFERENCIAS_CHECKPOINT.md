# M20 — Revisão de referências do checklist

2026-10-11. Usuário solicitou “CONTINUA” após governança operacional. Implementação fictícia reutiliza os critérios M07, sem criar catálogo normativo separado. M20 ainda tem revisão de acessibilidade e desempenho pendente; M21 não iniciado.

## Entrega e alteração do fluxo
Área `/referencias`, acessível à equipe da consultoria com permissão `documents.review` (administradora e SST da demonstração). Master e médico não recebem essa permissão. Link em Documentos → Checklist. Fonte, versão, âmbito, vigência, responsável e texto do critério vêm do cadastro existente; não há norma real pré-carregada.

Revisões registram Precisa de revisão ou Referência conferida, justificativa, ator, data, ID/versão do critério e impressão SHA-256 dos metadados usados. Conferir exige metadados completos, versão ativa e vigência informada atual. Datas impossíveis, período invertido e fora de vigência impedem conferir. O formulário exige declaração de conferência humana.

**Mudança intencional:** novas avaliações no checklist exigem referência conferida da versão atual. Referência sem conferência, marcada para revisão ou com metadados alterados é recusada pelo servidor antes de gravar avaliação. Nova versão não herda conferência. Avaliações históricas e snapshots anteriores permanecem intactos. A vigência é reavaliada na tentativa de avaliação; expiração não apaga histórico.

Conferência é declaração do operador fictício, não verificação automática de fonte, qualificação, interpretação ou conformidade normativa. O responsável informado no critério e o ator autenticado da revisão são registros distintos. A aplicação não comprova habilitação profissional. Master permanece sem aprovação técnica ou leitura dessas referências de clientes.

## Verificação
- Suite completa: 102 testes aprovados, zero falhas, em diretório temporário fora da restrição Windows. Comando `node --experimental-strip-types --test --test-concurrency=1 <app>/tests/*.test.ts <app>/tests/*.test.mjs`. Log `examples/app/data/m20-reference-tests.txt`.
- Quatro testes novos: autorização/isolamento/Master negado; conferência exigida e bloqueio posterior sem mudar avaliações; metadados/vigência/versão; alterações e versão nova sem herdar revisão.
- TypeScript `node node_modules/typescript/bin/tsc --noEmit`: aprovado. ESLint dos arquivos novos/alterados: aprovado após substituir navegação raiz por Next Link, como exigido pelo lint.
- Build com `SST_ISOLATED_BUILD=1` e `node node_modules/next/dist/bin/next build`: aprovado, incluindo `/referencias`. Ajuste posterior foi apenas o componente Link, validado pelo lint.
- Navegador: Master negado em `/referencias`. Conta fictícia da administradora Horizonte criou critério via formulário M07, categoria Outro, fonte/edição/âmbito/revisor fictícios, vigência inicial 2026-10-11. Registrou Precisa de revisão e depois Referência conferida; dois eventos preservados. Não foi enviado PDF nem criada avaliação nessa conferência visual; bloqueio da avaliação testado no serviço e integrado à action existente.
- Visual desktop 1280 × 900 e celular 390 × 844 nas áreas observadas, sem transbordamento visível; dimensões restauradas. Evidências `assets/m20-referencias-desktop.jpg` e `assets/m20-referencias-celular.jpg`. Sessão da consultoria usada apenas para QA e retorno ao Master ao final.

## Arquivos
Novos: `src/lib/reference-governance.ts`; `src/app/referencias/page.tsx`, `actions.ts`, `panel.tsx`; `tests/reference-governance.test.ts`.
Alterados: `src/lib/audit-log.ts`, `src/app/compliance-actions.ts`, `src/app/compliance-section.tsx`. Dados de revisão em `data/reference-reviews.json`, ignorados pelo Git. Critério fictício no cadastro existente `data/compliance.json`. Documentação: este checkpoint, M20_CHECKPOINT.md, CHANGELOG.md e DECISION_LOG.md.

## Roteiro humano
1. Entrar como administradora/SST fictícia, acessar Documentos → Checklist → Revisar fontes e referências.
2. Conferir o critério fictício M20 e seus dois eventos de revisão; registrar justificativa própria se desejar alterar a declaração.
3. Marcar Precisa de revisão e tentar avaliar um PDF fictício da mesma categoria: o servidor deve pedir revisão da referência.
4. Conferir referência e repetir avaliação; nova revisão do critério deve exigir nova conferência. Não alterar nem apagar avaliações antigas.

## Limites e próximo passo
JSON local sem coordenação entre processos. Impressão de metadados identifica mudanças; não é assinatura nem proteção contra edição manual de arquivos. Fonte e qualificações permanecem declaradas, sem monitoramento externo. A vigência desta área usa America/Sao_Paulo; outros módulos anteriores ainda têm datas baseadas em UTC e precisam de revisão na próxima verificação de consistência. Sem prazo normativo presumido. Próximo passo: aceite desta fatia e revisão de acessibilidade/desempenho para consolidar M20 demonstrativo; sem liberação para produção.
