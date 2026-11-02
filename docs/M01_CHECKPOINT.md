# M01 — Fundação da aplicação e design system

- **Estado:** primeira versão executável pronta para avaliação humana.
- **Aceite humano:** aprovada pelo usuário ao solicitar “CONTINUE” depois do checkpoint M01; trabalho avançou para M02.
- **Proposta de stack aprovada pelo usuário:** Next.js, TypeScript, pnpm; PostgreSQL fica para a etapa de dados.
- **Local do app:** `examples/app`.
- **Como iniciar:** nesta pasta, execute `pnpm dev` e abra `http://localhost:3000` no navegador. Para encerrar, pressione `Ctrl+C` no terminal.
- **Conta demo:** nenhuma autenticação nesta milestone.
- **Dados:** nenhum cadastro nem persistência; a aplicação não coleta dados.

## O que testar

1. Abra o painel em `http://localhost:3000`.
   - Esperado: título SST Hoje, visão geral e cartões vazios com explicação clara.
2. Clique em Empresas, Documentos, Pendências e Trabalhadores.
   - Esperado: o título e a mensagem de estado vazio mudam; nenhuma área afirma que já cadastra ou salva.
3. Reduza a largura do navegador ou abra num celular.
   - Esperado: a navegação passa para a barra inferior, sem necessidade de rolagem horizontal.
4. Use `Tab` para navegar pelas opções e confira o destaque de foco.
   - Esperado: botões navegáveis por teclado com foco visível.

## QA executado

- `pnpm build` — passou; rota `/` estática gerada.
- `pnpm lint` — passou.
- `pnpm typecheck` (`pnpm exec tsc --noEmit`) — passou.
- Inspeção visual no navegador: desktop (1440 px) e celular (390 px) — layout exibido; navegação para Empresas mudou para o estado vazio esperado.

## Limitações

- Os menus e cartões são demonstrativos; não existe autenticação, banco, cadastro ou persistência.
- A fonte Manrope é priorizada pela interface, com fontes locais alternativas; nenhuma fonte externa é baixada pelo app.
- Não é produto pronto para uso operacional nem armazena documentos SST.

**Decisão solicitada:** a interface inicial está clara no computador e no celular? Aprove a M01 ou descreva os ajustes desejados antes de começar M02.
