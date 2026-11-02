# M20 — Verificação visual inicial de acessibilidade

2026-10-11. Alteração em examples/app/src/app/master/master.css: foco escuro com contorno de 3 px, quebra de textos extensos, área mínima de summary e indicadores em coluna única até 480 px. Sem mudanças em dados ou autorização.

Verificado no navegador: /master/governanca em viewport 320 × 844, largura do conteúdo 305 px (sem transbordamento horizontal), idioma pt-BR, um h1 e primeiro link focado por Tab com contorno visível. Screenshot assets/m20-acessibilidade-320.jpg. Dimensões restauradas e sessão Master mantida. A observação da fila ocorreu durante carregamento; não conta como validação de seu conteúdo.

Comando de build: SST_ISOLATED_BUILD=1; node node_modules/next/dist/bin/next build. Resultado: bloqueado por EPERM no unlink de arquivo já existente em .next-verify-m20/static. Não houve exclusão manual nem novo build aprovado nesta fatia. Os 102 testes pertencem à fatia anterior; não foram repetidos para este ajuste CSS.

Limites: verificação pontual, não certificação WCAG. Desempenho, leitor de tela e percurso completo de formulários ainda pendentes. Próximo passo: resolver o bloqueio de arquivos do build e ampliar a verificação de teclado. M20 permanece aberto; M21 não iniciado.

## Continuação — build desbloqueado e teclado

Build aprovado em 2026-10-11: SST_ISOLATED_BUILD=1, SST_BUILD_VERIFY_ID=m20-20261011131621, node node_modules/next/dist/bin/next build. Compilação 22,2 s; TypeScript 22,7 s; 19 páginas geradas. Estes tempos são de build, não métricas de desempenho de navegação.

next.config.ts permite identificador validado (letras minúsculas, números, hífens, até 40 caracteres) para uma saída de verificação nova dentro do app. Não remove saídas antigas nem toca na saída .next do servidor. .gitignore ignora .next-verify-*/; tsconfig.json usa padrão para os tipos dessas verificações. Pastas antigas continuam ocupando disco; limpeza não executada.

No navegador, /master/governanca: Tab percorreu os dois links, prazo, checkbox, justificativa e botão. Enter no botão sem justificativa bloqueou o envio, focou o campo obrigatório e exibiu “Preencha este campo.”; política continuou revisão 1, 45 dias, bloqueio ativo. Evidência assets/m20-teclado-formulario.jpg. Retorno ao painel Master confirmado.

Arquivos desta continuação: next.config.ts, .gitignore, tsconfig.json e documentação. M20 ainda requer avaliação mais ampla de acessibilidade e desempenho; não é certificação WCAG nem liberação para produção.

Correção: a tentativa de consolidar tipos em padrão amplo ficou sem conclusão e foi interrompida. tsconfig.json voltou aos caminhos explícitos usados no build aprovado. Não há aprovação separada de tsc/lint nesta continuação; o build concluído incluiu TypeScript.

## Continuação — mensagens e fila em celular

2026-10-11. Operação, governança e referências agora mantêm um parágrafo role=status com aria-atomic presente antes do envio; durante envio exibem texto de progresso. Todos os formulários da operação indicam aria-busy. Os três fallbacks de Suspense têm mensagem role=status. Não muda autenticação, dados ou regras técnicas.

Arquivos: examples/app/src/app/master/operacao/{panel,page}.tsx, master/governanca/{panel,page}.tsx, referencias/{panel,page}.tsx; tsconfig.json atualizado automaticamente pelo Next com a nova saída de build.

Verificação navegador: fila completa em 320 × 844, largura medida de conteúdo 305 px, três formulários com aria-busy=false e uma região status. Tab percorreu links, seletores, justificativa e botão; Enter sem justificativa bloqueou envio e focou o campo obrigatório. Processar sem tarefas pendentes exibiu progresso e desabilitou botões; retornou “Nenhuma tarefa pronta. Confira o prazo da próxima tentativa e o estado da consultoria.”, mantendo zero pendentes, uma falha e histórico existente. Evidência assets/m20-fila-status-celular.jpg. Não foi usado leitor de tela; anúncio audível não confirmado.

ESLint dos seis arquivos: exit 0, sem erros. Build isolado SST_BUILD_VERIFY_ID=m20-20261011132120: exit 0, compilação 10,2 s, TypeScript 10,1 s, 19 páginas geradas. Não são métricas de navegação e não comprovam desempenho de produção. Suite de domínio não repetida porque a mudança é de apresentação; 102 testes continuam sendo a evidência da fatia de referências.

Próximo passo: revisão de acessibilidade mais ampla e medição de navegação em servidor de produção isolado antes de consolidar M20. Sem certificação WCAG ou liberação para produção.

## Continuação — histórico por teclado e painel visível

2026-10-11. A pedido do usuário, navegador lateral mantido visível. Em /master/operacao, Enter no controle Consultar histórico expandiu a tarefa fictícia com falha; exibiu criação, falhas com intervalos de 5 e 10 segundos e encerramento após a terceira falha. Enter novamente recolheu o histórico, mantendo foco no mesmo controle. Sem alteração de dados ou código. Evidência assets/m20-historico-teclado.jpg. Fila deixada aberta ao usuário.

Próximo passo para aceite demonstrativo: conferir a fila, a governança e a revisão de referências com as contas correspondentes. M20 continua sem certificação de acessibilidade e sem liberação de produção; não repetir build ou testes de domínio para esta conferência somente de leitura.

## Continuação — identificação dos controles de histórico

2026-10-11. Em master/operacao/panel.tsx, o summary mostra estado e data/hora de criação da tarefa além de Consultar histórico. Em master/governanca/panel.tsx, mostra o título do incidente. O texto visível também compõe o nome acessível; não depende de tooltip. Ajuda a distinguir registros, sem alegar identificador globalmente único.

Navegador visível: os três controles da fila exibiram estado e horário na árvore de acessibilidade; Enter expandiu o registro concluído em três tentativas, com foco visível. Screenshot assets/m20-historicos-identificados.jpg. Não houve mutação de dados. Não foi feito teste audível com leitor de tela.

ESLint dos dois painéis: exit 0. Build isolado m20-20261011135919: exit 0, incluindo TypeScript e 19 páginas. tsconfig.json recebeu tipos desse build automaticamente. Suite de domínio não repetida para alteração de texto; última execução completa permanece 104 testes aprovados na correção de datas. M20 segue demonstrativo, aguardando aceite humano; sem M21.
