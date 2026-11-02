# M15 — SaaS Master e gestão das consultorias

Demonstração concluída em 2026-10-10. Usuário autorizou o avanço do M14 com “continua” e reiterou durante a implementação. Aceite humano aprovado explicitamente pelo usuário em 2026-10-11, após disponibilização para teste. M16 liberado como próximo marco.

## Entrega
- Área `/master` com identidade fictícia de plataforma separada dos vínculos das consultorias. Login e redirecionamento próprios; não concede acesso ao painel de clientes, documentos, dados médicos ou sessão de outra conta.
- Visão das duas consultorias fictícias existentes: estado, contagens de empresas/trabalhadores ativos e vínculos ativos, limites técnicos. Projeção restrita; não consulta documentos, ASO ou PCMSO.
- Suspensão e reativação com justificativa, confirmação explícita no formulário, valores anteriores/novos e histórico preservado. Suspensão bloqueia próximos acessos/ações das contas vinculadas e dos portais de terceiros/EPI. Conteúdo já exibido não é removido remotamente do navegador.
- Limites de empresas e trabalhadores ativos aplicados no servidor ao cadastrar ou reativar. Inteiros positivos, faixas técnicas de 1–10.000 empresas e 1–100.000 trabalhadores; não aceita limite abaixo do uso ativo. Padrões locais: 100/1.000, sem vínculo com plano comercial.
- Formulário desatualizado é rejeitado se a configuração mudou. Limite técnico de 20 ações administrativas por minuto e conta/processo.
- Suporte exige justificativa e retorna somente estado, configuração e contagens; histórico restrito ao Master. Sem entrar como cliente ou conceder acesso aos arquivos.
- Auditoria da plataforma separada da auditoria das consultorias. Registra consultas, alterações, suporte e tentativas administrativas negadas. Justificativas ficam no histórico administrativo; não são copiadas para o evento de auditoria.
- Mensagens de limite nos formulários existentes de cadastro e reativação. Dados anteriores preservados.

## Verificações executadas
- `node --experimental-strip-types --test --test-concurrency=1 tests/*.test.ts`: 61 aprovados, zero falhas. Nove testes novos cobrem autorização/negação auditada, projeção, validação, suspensão/reativação, capacidade, portais, auditoria, limite de ações e formulário antigo.
- A execução paralela anterior teve 60 aprovações e uma falha `EPERM` ao renomear arquivo temporário de teste de pendências no diretório OneDrive. A repetição sequencial completa passou. Esse risco do armazenamento local permanece registrado; não foi ocultado com repetição automática em código.
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- ESLint em todos os arquivos TypeScript alterados: aprovado; repetido no componente Master após ajuste final de estilos, também aprovado.
- Navegador: administradora bloqueada em `/master`; login Master, diagnóstico, suspensão, reativação, limites de um cadastro e restauração dos padrões conferidos. Durante suspensão, consulta de autorização no servidor confirmou Horizonte bloqueada e Aurora autorizada.
- Testes pela tela de empresa e trabalhador acima do limite retornaram mensagens no formulário, sem criar registros. A primeira tentativa de empresa revelou erro não tratado; corrigido e repetido com sucesso.
- Desktop 1280 × 900 e celular 390 × 844 conferidos visualmente, sem transbordamento horizontal. Estilos ajustados ao pipeline CSS existente.
- Evidências finais: `assets/m15-master.png`, `assets/m15-celular.png`, `assets/m15-limite.png`. A captura `m15-suspensao.png` é preliminar, anterior ao ajuste visual final.
- Não foi executado build de produção, cobrança ou integração externa.

## Como testar
1. Abra http://127.0.0.1:3000/master. A sessão Master fictícia ficou aberta ao lado.
2. Se precisar entrar: `master@ssthoje.local` / `MasterFicticio2026!`, somente neste ambiente de demonstração.
3. Em Horizonte SST, abra Gerenciar estado e limites. Revise valores, escreva justificativa fictícia e confirme o efeito antes de registrar.
4. Abra Diagnóstico de suporte e informe uma justificativa fictícia; confira a projeção mínima e os históricos.
5. Para testar capacidade, use limites de um cadastro e entre na conta administradora já documentada. Novos cadastros devem ser recusados com mensagem. Restaure os limites depois.

## Estado deixado para teste
Duas consultorias ativas; Horizonte com uma empresa e um trabalhador, limites restaurados para 100/1.000. Três alterações administrativas preservadas (suspender, reativar e restaurar limites), duas consultas de suporte e evento de acesso administrativo negado. Nenhum cadastro adicional foi criado pelos testes de limite.

## Arquivos alterados
Novos na aplicação `examples/app`:
- `src/lib/tenant-state.ts`, `src/lib/platform-identity.ts`, `src/lib/platform-store.ts`, `src/lib/platform-service.ts`.
- `src/app/master/page.tsx`, `src/app/master/actions.ts`, `src/app/master/master-dashboard.tsx`, `src/app/master/master.css`.
- `src/app/record-status-form.tsx` e `tests/platform.test.ts`.
Existentes alterados:
- `src/lib/tenant-access.ts`, `src/lib/demo-accounts.ts`, `src/lib/audit-log.ts`, `src/lib/client-store.ts`, `src/lib/worker-store.ts`, `src/lib/third-party-store.ts`, `src/lib/epi-store.ts`.
- `src/app/actions.ts`, `src/app/login/page.tsx`, `src/app/page.tsx`, `src/app/client-actions.ts`, `src/app/worker-actions.ts`, `src/app/client-section.tsx`, `src/app/worker-section.tsx`.
- `.env.example` e configuração fictícia local `.env.local` (segredo existente não exposto). Persistência demonstrativa nova em `data/platform.json`, eventos em `data/audit-log.jsonl`.
Documentação: `docs/M14_CHECKPOINT.md`, `docs/DECISION_LOG.md`, `docs/CHANGELOG.md`, este checkpoint. Evidências em `assets/m15-*.png`.

## Limites e próximo passo
Armazenamento JSON local, identidade Master fixa de demonstração e contadores em memória por processo não constituem arquitetura de produção. Criação/exclusão de consultorias, acesso delegado ao conteúdo, planos, cobrança, criptografia e integrações não estão nesta entrega. Próximo marco após aceite: M16 — planos, módulos, limites e créditos, inicialmente simulados e sem cobrança real.
