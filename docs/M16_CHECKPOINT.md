# M16 — Planos, limites e consumo simulados

Entrega demonstrativa em 2026-10-11, autorizada pelo usuário com “continue” após aceite explícito do M15. Aceite humano pendente. Não avançar ao M17 antes do aceite.

## Entrega funcional
- Painel Master com planos Essencial e Profissional, ciclos mensal/anual e prévia em reais. Preços ilustrativos, sem oferta comercial ou cobrança. Adicionais de empresas, trabalhadores, armazenamento e créditos, sem precificação nesta etapa.
- Alterar o plano aplica os limites de empresas e trabalhadores aos cadastros existentes no servidor. Ajustes manuais do M15 continuam disponíveis como exceções; a próxima alteração de plano os substitui, mantendo histórico.
- Contadores de armazenamento em MB e créditos de IA exclusivamente simulados. Consumo inteiro, acumulado e limitado ao saldo; excesso não registra consumo parcial. Troca de plano/ciclo não zera uso. Não há renovação automática.
- Não permite plano abaixo dos cadastros ativos ou do consumo simulado. Não remove cadastros, documentos ou eventos anteriores.
- Ações restritas ao Master no servidor, alvo validado, justificativa e confirmação no formulário, limite administrativo existente de 20 ações por minuto e rejeição de revisão antiga.
- Persistência conjunta no JSON da plataforma; histórico anterior/novo por consultoria e evento de auditoria administrativo sem justificativa.

## O que permanece simulado
- Módulos são uma descrição comercial associada ao plano; não bloqueiam telas ou permissões SST nesta fatia.
- Armazenamento não mede PDFs reais nem bloqueia uploads. Créditos não representam tokens ou chamadas reais de IA.
- Sem cobrança, provedor de pagamentos, integração externa, renovação, reposição automática ou aplicação de preço aos adicionais. Catálogo fixo de demonstração. Sem prontidão de produção.

## Como testar
1. Abra http://127.0.0.1:3000/master. Para iniciar: na pasta `examples/app`, execute `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1`.
2. Perfil Master fictício: `master@ssthoje.local` / `MasterFicticio2026!`.
3. Em Horizonte SST, expanda “Planos e créditos · simulação”. Escolha Profissional e Anual. Confira a prévia: 300 empresas, 3.000 trabalhadores, 500 MB, 500 créditos e base ilustrativa R$ 1.990/ano, sem adicionais.
4. Informe justificativa fictícia, marque a confirmação e aplique. As contagens devem mostrar os limites novos.
5. Abra “Simular consumo”. Registre 1 MB e 1 crédito, com justificativa e confirmação. Os dois contadores devem aumentar em uma unidade.
6. Tente consumir 100.000 créditos: deve mostrar saldo insuficiente e preservar os contadores.
7. Confira o “Histórico de planos e consumo”. Compare antes/depois, justificativa e consultoria. Aurora deve permanecer independente.
8. Restaure Essencial/Mensal e adicionais zero ao terminar. Limites voltam a 100/1.000, preservando consumo e histórico.

## Verificações
- `node --experimental-strip-types --test --test-concurrency=1 tests/*.test.ts`: 64 testes aprovados, zero falhas. Três testes novos cobrem autorização, isolamento, revisão, limites, consumo exato/excedido, downgrade e entradas adulteradas.
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- `node node_modules/next/dist/bin/next build`: aprovado, compilação, tipos e geração das páginas concluídos.
- Navegador: aplicação do Profissional/Anual e atualização de limites; consumo de 1 MB/1 crédito e confirmação no saldo/histórico. Formulário ajustado para remontar após mudança de revisão e manter seleção coerente.
- Layout observado na largura disponível do painel e em 390 × 844, com campos empilhados. Sem transbordamento visível nas áreas observadas; sem auditoria completa de acessibilidade.

## Arquivos
- Novos: `examples/app/src/lib/plan-catalog.ts`, `examples/app/src/app/master/plan-panel.tsx`, `examples/app/tests/plans.test.ts`.
- Alterados: `tenant-state.ts`, `platform-store.ts`, `platform-service.ts`, `master/actions.ts`, `master/master-dashboard.tsx`, `master/master.css`.
- Dados demonstrativos: `examples/app/data/platform.json` e `audit-log.jsonl`. Histórico preservado.
- Documentação: este checkpoint, `CHANGELOG.md`, `DECISION_LOG.md`.

## Limites e próximo passo
JSON local e controles por processo permanecem limitados ao ambiente demonstrativo. Não há banco transacional ou coordenação entre processos. Próximo passo: teste e aceite humano desta fatia do M16; revisar o restante do escopo de módulos/armazenamento real antes de considerá-lo implementado integralmente. M17 ainda não iniciado.

## Verificação final e estado para teste
- ESLint dos oito arquivos TypeScript alterados/novos: aprovado, sem mensagens.
- Plano Essencial/Mensal restaurado no navegador: Horizonte com limites 100/1.000, consumo simulado 1 MB/1 crédito e três eventos M16 preservados. Aurora sem alterações de plano.
- Evidência: assets/m16-planos.jpg. Ajuste final de CSS apenas quebra textos longos no histórico; build e tipos aprovados anteriormente, sem nova alteração TypeScript após essas verificações.


## Continuidade — 2026-10-11
Usuário autorizou avançar com “continua”. Os limites descritos acima registram a primeira fatia histórica. O controle de novas operações de módulos e de armazenamento físico foi acrescentado em M16_MODULOS_ARMAZENAMENTO_CHECKPOINT.md; esse complemento aguarda aceite humano.

## Aceite final M16 — 2026-10-11
Usuário aprovou o complemento e autorizou M17 com “aprovado, pode continuar”. Histórico das fatias anteriores preservado.
