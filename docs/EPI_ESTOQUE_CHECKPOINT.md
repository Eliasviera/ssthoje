# Ficha e estoque de EPI — primeira fatia (2026-10-24)

- Estado: implementado localmente; pronto para teste humano inicial, aceite pendente.
- Estoque: http://127.0.0.1:3107/epi/estoque
- Fichas: http://127.0.0.1:3107/epi/fichas
- Iniciar: ABRIR-PAINEL.cmd na raiz; entrar na conta demo existente (instruções em M02_CHECKPOINT.md), abrir EPI e os links de fichas/estoque.
- Perfil usado na UI: administradora demonstrativa da Horizonte SST. Gestão exige epi.manage; consulta exige epi.read. Suspensão do tenant e desativação do módulo são respeitadas.
- Dados: ficha lê a entrega fictícia M13 existente; nenhum item ou movimento de estoque foi criado no armazenamento ativo. Consulta das entregas usa o serviço existente, que registra eventos epi.read na auditoria.

## Entrega funcional

- Fichas agrupam as entregas existentes por trabalhador, preservando empresa/unidade registradas na entrega, itens, quantidades, data e estado pendente/confirmado no simulador/cancelado. Comprovante existente permanece acessível.
- Catálogo de estoque por empresa/unidade, código interno único no escopo (normalizado em maiúsculas), nome, referência/CA declarado, tamanho/modelo e local de armazenamento.
- Cada item nasce com saldo zero. Entradas e saídas manuais exigem quantidade inteira e motivo/referência; limite técnico de saldo/quantidade de 1.000.000, sem significado normativo.
- Saldo calculado do histórico, nunca negativo. Controle de revisão recusa movimentos com saldo/revisão desatualizados, inclusive repetição da mesma submissão.
- Histórico por item conserva movimentos, motivo, conta autenticada e data. Correção usa movimento compensatório; não há exclusão ou edição silenciosa de movimento anterior.
- Página/actions validam autorização e derivam tenant/ator no servidor. Actions conferem empresa/unidade ativas pelo serviço de empresas. A camada de estoque também verifica permissão, módulo e tenant a cada operação.

## Teste humano

1. Conferir /epi/fichas: deve aparecer a entrega demonstrativa existente e seu comprovante; isso não constitui assinatura real.
2. Abrir /epi/estoque e Cadastrar item de estoque. Selecionar empresa/unidade fictícias e usar código, nome, referência, tamanho e local de teste: item deve aparecer com saldo zero.
3. Registrar entrada de 10 com motivo fictício: saldo deve ficar 10, mantendo data e conta no histórico.
4. Registrar saída de 3: saldo deve ficar 7. Tentar saída de 8: deve recusar sem registrar movimento.
5. Abrir o mesmo item em duas abas e salvar em uma; a outra deve recusar revisão antiga até atualizar.
6. Registrar entrada compensatória de 3 com justificativa: saldo volta a 10, preservando entrada/saída anteriores.
7. Consultar com perfil SST demonstrativo: pode ler; não deve cadastrar/movimentar. Outra consultoria não deve ver os itens.

## QA executado

- Comando: node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/epi-stock-store.test.ts tests/epi.test.ts
- Resultado: 14/14 aprovados (5 estoque + 9 regressão EPI), repetidos após ajuste final da fixture tipada. Fixtures temporárias sintéticas fora do sandbox devido à restrição de rename.
- node node_modules/typescript/bin/tsc --noEmit: aprovado. Build também concluiu a etapa TypeScript após a fixture final.
- ESLint focado em store, páginas/actions/section novas, link em epi-section e teste: aprovado antes da alteração final somente de fixture de plano.
- Build isolado com SST_ISOLATED_BUILD=1 e SST_BUILD_VERIFY_ID=epi-stock-20261024: compilação aprovada; build completo reprovado no prerender da rota existente /configuracoes/terceiros (dados runtime fora de Suspense). Aviso adicional em /api/health por padrão amplo de arquivos. Sem alterações nessas rotas. Inclusões temporárias desse build no tsconfig removidas.
- UI: estoque/estado vazio/cadastro e opções conferidos no painel estreito; ficha com entrega demonstrativa existente e link do comprovante conferidos. Capturas EPI_ESTOQUE_VALIDACAO_2026-10-24.png e EPI_FICHA_VALIDACAO_2026-10-24.png.
- Sem submissão de cadastro/movimento pelo browser no armazenamento ativo: fluxo completo pela UI ainda pendente. Testes automatizados não substituem essa conferência.

## Limitações

Estoque manual independente das entregas: entregar, confirmar ou cancelar no fluxo de fichas não altera o saldo. A saída é registrada manualmente e vinculada a uma ficha existente; não há correspondência automática por nome/CA, importação retroativa, dupla gravação ou sincronização atômica entre arquivos.

Persistência demonstrativa JSON sem criptografia em data/epi-stock.json, ignorada pelo Git. Nenhuma migration, importação, banco persistente ou comprovante existente foi alterado. Histórico do estoque é próprio, sem integração à listagem global de auditoria, e a operação é limitada a processo único local, sem garantias multi-servidor. O código atual controla lotes e validade do produto, alerta saldo mínimo, registra custos/notas fiscais e mantém devoluções separadas do saldo. Para CA, a equipe informa os dados após consulta manual: não há consulta em tempo real nem validação automática de CA ou adequação. Nova entrada com CA informado vencido é bloqueada; saída de lote com validade do produto vencida continua bloqueada; saída de estoque cujo CA informado venceu exige confirmação justificada de conta autorizada com epi.manage, registrada com a movimentação. Essa confirmação é uma decisão interna e não declara conformidade. Ainda não há reserva, exportação/PDF novo, assinatura real ou integração externa. Fichas não substituem revisão técnica/jurídica. Usar apenas dados fictícios.

## Arquivos desta fatia

- examples/app/src/lib/epi-stock-store.ts
- examples/app/src/app/epi/estoque/{actions.ts,page.tsx,section.tsx}
- examples/app/src/app/epi/fichas/page.tsx
- examples/app/src/app/epi-section.tsx
- examples/app/tests/epi-stock-store.test.ts
- docs/EPI_ESTOQUE_CHECKPOINT.md e duas capturas de validação
- docs/NC_CHECKPOINT.md e docs/RETOMAR_PROJETO.md

## Decisão necessária

Conferir esta primeira fatia: aprova ou quer correções? Não iniciar PT/PTE antes do aceite humano, conforme START_HERE_CODEX.md: “Se o checkpoint exigir teste/aceite do usuário, pare e aguarde.”

2026-10-24 — usuário respondeu “continua” ao checkpoint de EPI, interpretado como aceite da primeira fatia para seguir à preparação PT/PTE. Isso não confirma execução do roteiro de gravação humana. Na etapa PT/PTE, corrigido carregamento Suspense de /configuracoes/terceiros; build completo final aprovado, incluindo fichas e estoque. Demais limitações de estoque manual seguem vigentes. Ver PT_PTE_CHECKPOINT.md.

## Retomada do controle de CA — 2026-11-01

- Decisão do usuário: quando o CA informado estiver vencido na saída, sinalizar e exigir confirmação justificada de gestor autorizado, sem declarar conformidade.
- A saída deve registrar a confirmação, a justificativa, a conta responsável e o horário no histórico. A validação acontece no servidor e exige permissão `epi.manage`.
- O bloqueio por validade vencida do produto/lote permanece independente e não pode ser contornado pela confirmação de CA.
- O CAEPI permanece consulta manual informada pela equipe; esta mudança não valida fonte, adequação nem situação normativa.
- QA desta retomada: estoque e regressão de entregas EPI, 18/18 testes aprovados; `tsc --noEmit` e ESLint focado aprovados. As fixtures de entrega foram alinhadas aos campos atuais usando valores sintéticos. Corrigido também o fechamento JSX no link EPI/estoque que impedia o typecheck.
- A interface não foi submetida pelo navegador nesta retomada; nenhuma movimentação foi gravada em armazenamento ativo.
- Na entrada/saída, o gestor deve declarar que consultou o CAEPI manualmente e informar a validade transcrita para aquela movimentação. O sistema registra a declaração, validade, conta e horário; isso não comprova a consulta nem representa verificação automática. Entrada com validade transcrita vencida é bloqueada; saída com validade transcrita vencida requer confirmação justificada de gestor.

## Consulta automática ao CAEPI — requisito e bloqueio técnico

- Decisão do usuário em 2026-11-01: o sistema deve consultar automaticamente o CAEPI para verificar o CA tanto na entrada no estoque quanto na saída vinculada à ficha; a produção depende de avaliação da integração oficial e consentimento explícito.
- A página pública consultada apresenta formulário ASP.NET Web Forms com POST/ViewState, não uma API documentada. A tentativa de leitura HTTP direta também recebeu desafio anti-automação. Não há contrato de API oficial, autorização de automação, limites de uso nem esquema de resposta confirmado nesta investigação.
- Não implementar scraping do formulário como se fosse uma integração oficial: é frágil, pode falhar sem aviso e a página contém dados embutidos que não devem ser coletados ou armazenados. Nenhuma chamada de produção foi ativada e nenhum dado de CA foi consultado para movimentos.
- Para prosseguir com verificação automática, obter do MTE/CAEPI documentação e autorização oficial de integração (ou confirmação formal de que o endpoint público pode ser automatizado), com URL e método, parâmetros, campos de resposta necessários para identificar status/vigência, autenticação se aplicável, limites e condições de uso. Depois disso, implementar primeiro adapter/mock isolado, teste de falha fechada e revisão; só então solicitar consentimento explícito antes de habilitar o adapter real.
- Até existir fonte automatizável aprovada, o sistema continua identificando a conferência como manual/informada. Não deve apresentar CA como verificado automaticamente nem converter indisponibilidade da fonte em aprovação.

## Entrega de EPI sem internet — decisão e estado

- Decisão do usuário em 2026-11-01: se a entrega acontecer sem internet, registrar localmente como pendente de sincronização e conferência do CA; não marcar CA como confirmado.
- Implementado em 2026-11-02: na rota `/epi/entregas`, a administradora pode guardar um rascunho mínimo neste dispositivo usando IndexedDB. A chave de escopo é derivada de tenant+usuário e não contém os identificadores originais; dados ficam no navegador sem criptografia. Não se incluem observações internas nem se declara conferência de CA. A tela deve estar aberta e carregada antes da perda de conexão; não há service worker/cache para iniciar ou reabrir o app offline. Limpar dados do navegador ou perder o dispositivo pode apagar/expor rascunhos.
- Com conexão, a sincronização é manual e revalida sessão/permissão, trabalhador ativo e escopo no servidor. A chave de requisição torna o reenvio idempotente; a fila local só é removida após resposta de sucesso. Falhas e trabalhador arquivado mantêm o rascunho local.
- A sincronização cria um registro separado `pending_ca_review`, com recebimento e auditoria no servidor. Ele não cria ficha operacional nem baixa de estoque; não reutiliza o estado do simulador `pending` e não confirma CA. A lista do servidor apresenta a pendência, mas ainda não existe ação de revisão/regularização desse registro; isso precisa de etapa futura explícita para definir revisão manual/evidência e efeito permitido. Não registrar esse rascunho como CA validado.
- A funcionalidade não depende da integração real CAEPI; esta continua bloqueada até receber documentação e autorização formal do MTE/CAEPI. Os testes automatizados, typecheck, lint e build foram executados. O usuário aceitou esta fatia e seus limites em 2026-11-02; a conferência visual e o ensaio manual sem rede continuam pendentes.
- QA executado: `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/epi.test.ts tests/epi-stock-store.test.ts` (20/20); `npm run typecheck`; ESLint focado nos arquivos EPI; `npm run build` (todos aprovados). Build emitiu o aviso preexistente de padrão amplo de arquivos em `src/app/api/health/route.ts`; sem relação com esta alteração. O fluxo local IndexedDB não foi exercitado manualmente em navegador e nenhum rascunho/entrega foi gravado no armazenamento ativo.
- Arquivos alterados nesta fatia: `examples/app/src/lib/epi-store.ts`, `examples/app/src/lib/epi-service.ts`, `examples/app/src/lib/epi-offline-queue.ts`, `examples/app/src/lib/audit-log.ts`, `examples/app/src/app/epi-actions.ts`, `examples/app/src/app/epi/entregas/page.tsx`, `examples/app/src/app/epi/entregas/offline-capture.tsx`, `examples/app/tests/epi.test.ts`, `docs/DECISION_LOG.md`, `docs/CHANGELOG.md` e este checkpoint.

## Revisão offline, atualização do CA e conciliação — 2026-11-02

- Registros offline sincronizados agora podem ser revisados por pessoa autorizada (`epi.manage`). A ação exige CA numérico, validade informada e declaração de consulta manual; bloqueia CA vencido ou consulta com mais de 15 dias e cria uma ficha marcada `origin: offline` / `offline_recorded`. A repetição da revisão retorna a mesma ficha, sem duplicação.
- A ficha offline não cria portal, código OTP/mock, confirmação do trabalhador nem comprovante simulado. A captura exige CA, validade e data de consulta e faz validação local de formato/atualidade; o servidor ainda exige revisão manual após sincronização. Sem rede, o CA não é confirmado.
- A fila sincronizada exibe o estado da revisão e a referência da ficha resultante. Entregas e fichas exibem conciliação por ficha, CA, tamanho e quantidade. O servidor soma baixas equivalentes entre itens de estoque e sinaliza quantidades acima da ficha; retorno permanece separado e não apaga o histórico da saída.
- Cadastro e movimentação do estoque exigem data de consulta manual nos últimos 15 dias. A cada entrada/saída o cadastro corrente recebe a validade e a data transcritas, e o movimento arquiva os valores anteriores; a interface apresenta vencimento do CA, consulta desatualizada e lotes vencidos. Saída com CA vencido só segue com confirmação justificada de gestor, sem declaração de conformidade. Lote de produto vencido continua bloqueado.
- Isso é atualização baseada em transcrição manual, não ciclo automático: o sistema não visita nem consulta o CAEPI. Integração oficial permanece bloqueada até receber documentação e autorização formal do CAEPI/MTE. Não fazer scraping.
- QA executado após implementação: `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/epi.test.ts tests/epi-stock-store.test.ts` (23/23), `npm run typecheck`, ESLint focado nos arquivos EPI e `npm run build` passaram. O build emitiu o aviso preexistente de padrão amplo de arquivos em `src/app/api/health/route.ts`. Teste manual com perda/retorno de rede continua pendente; nenhuma ficha/movimentação foi gravada no armazenamento ativo.
- Aceite humano anterior cobre a decisão de fila offline, janela de 15 dias, revisão manual e baixa pendente. O fluxo visual da revisão e conciliação ainda requer conferência manual no navegador antes de uso demonstrativo.
- Arquivos alterados nesta etapa incluem `examples/app/src/lib/epi-store.ts`, `examples/app/src/lib/epi-service.ts`, `examples/app/src/lib/epi-stock-store.ts`, `examples/app/src/app/epi-actions.ts`, `examples/app/src/app/epi/entregas/page.tsx`, `examples/app/src/app/epi/entregas/offline-capture.tsx`, `examples/app/src/app/epi-section.tsx`, `examples/app/src/app/epi/fichas/page.tsx`, `examples/app/src/app/epi/worker-ficha.tsx`, `examples/app/src/app/epi/estoque/actions.ts`, `examples/app/src/app/epi/estoque/section.tsx`, `examples/app/tests/epi.test.ts`, `examples/app/tests/epi-stock-store.test.ts` e os três documentos de EPI.

## Fila de revisão manual do CA — 2026-11-01

- Decisão do usuário: autorizado implementar fila e lembretes internos para revisar manualmente o CA a cada 15 dias. Esta autorização não é permissão do MTE/CAEPI para automação.
- A fila aparece ao abrir `/epi/estoque`, mostra itens desde o 10º dia como revisão próxima e destaca a consulta com mais de 15 dias como vencida; inclui atalho ao item. Não há tarefa agendada em segundo plano ou notificação fora da tela.
- Perfil autorizado pode registrar data/validade de consulta recente para o mesmo CA sem criar entrada/saída de estoque. Atualiza o estado vigente e preserva cada revisão com valor anterior, ator, data/hora e fonte manual; auditoria registra o evento sem incluir conteúdo do CA.
- CA diferente não pode ser aplicado ao cadastro atual; deve ser outro item. CA cuja validade está vencida pode ser registrado como resultado da revisão para alertar o estado real informado, mas as regras existentes de saída permanecem aplicáveis.
- Validação desta fatia: EPI, estoque, permissões e plataforma focados passaram 36/36; `npm run typecheck` e ESLint focado aprovados. A suíte completa será executada após esta atualização; inspeção manual da interface ainda pendente.

## Continuação da fila e QA — 2026-11-02

- Atendida a necessidade de manter visível a validade informada do CA: além do ciclo desde a última consulta (alerta a partir do 10º dia e vencido após 15), a fila também inclui CA com validade informada nos próximos 15 dias ou já vencida. Cada linha aponta para o cadastro do item. A fila é calculada na abertura da tela, sem consulta externa ou tarefa agendada; a validade é informação transcrita, não verificação oficial.
- Inspeção visual somente leitura em `/epi/estoque`: página e fila renderizaram corretamente no estado vazio; nenhum item/movimento foi criado. Como o estoque estava vazio, ainda não foi conferido o comportamento visual de linha preenchida/revisão manual. O ensaio de perda e retorno da rede segue pendente.
- QA desta atualização: testes focados EPI/estoque, permissões e plataforma, 36/36; `npm run typecheck`, ESLint focado em `section.tsx` e `npm run build` aprovados. Build mantém aviso preexistente de padrão amplo de arquivos em `src/app/api/health/route.ts`. A suíte completa executada anteriormente terminou com 476 aprovados, 2 falhas e 1 ignorado: `tests/pgr-digitalization-store.test.ts` (exceção ao mapear propriedade indefinida) e `tests/safety-checklist-suggestions.test.ts` (expectativa de rótulo “atividade diversa” diferente do atual “03 · APR Genérica”). Ambas fora da frente EPI; não alteradas nesta etapa.

## Formas de entrada e cadastro do protetor auditivo — 2026-11-01

- Decisão do usuário: oferecer três formas de registrar entrada de EPI: nota fiscal, relatório de almoxarifado e cadastro direto no sistema. Para NF e relatório, anexar PDF e digitar/conferir dados manualmente; sem extração automática. A entrada direta não exige anexo. Categorias anteriores de pedido de compra, transferência e ajuste foram preservadas.
- Implementação: a seleção da forma de entrada determina se o PDF é obrigatório e qual referência é apresentada. PDFs são arquivados com o movimento e podem ser baixados por rota autenticada; são dados externos não confiáveis e não preenchem campos. O registro continua exigindo dados do item/lote, custo e responsável, além da declaração de consulta manual do CA e sua validade.
- QA executado: `tests/epi-stock-store.test.ts`, 14/14; `npm run typecheck`; ESLint focado nos arquivos de estoque/API/teste; `npm run build`. Todos passaram. Build mantém aviso anterior de padrão amplo de arquivos em `src/app/api/health/route.ts`.
- Registro demonstrativo concluído após coleta dos campos e confirmação do usuário de que tudo é fictício: item `5745-ÚNICO · Protetor auditivo 3M Pomp Plus` e entrada de 10 unidades no escopo de teste EMA MAXIBUS · Estabelecimento de Erechim, local `Almoxarifado 01`. Forma escolhida para este lote: cadastro direto no sistema, sem anexo de NF. Lote identificado como fictício 205, validade do produto informada 12/05/2027, custo unitário informado R$ 3,95 (saldo valorizado demonstrativo R$ 39,50). Dados do CA 5745, descrição/proteção, consulta em 01/11/2026 e validade informada 08/08/2028 foram transcritos conforme fornecidos pelo usuário. O app não consultou o CAEPI e não avaliou adequação ou conformidade. Registro está no armazenamento local demonstrativo; não representa autorização de uso operacional.

## Leitura de documentos PDF para entrada — 2026-11-02

- Decisão do usuário: o sistema deve ler PDFs de NF e relatório para extrair dados; primeira fatia cobre somente PDFs pesquisáveis. PDF escaneado deve ser identificado como indisponível até existir OCR.
- Implementação: `/api/epi/stock-document/extract` exige sessão e `epi.manage`, valida PDF e limite de 15 MB. O parser roda localmente e sugere produto/descrição, CA, quantidade, referência, fornecedor, lote, validade do produto e custo unitário quando encontra rótulos explícitos. Texto integral não é retornado pela API.
- Os valores sugeridos são editáveis e exigem revisão/envio manual no formulário. Ler um PDF não cria movimento, não confirma consulta ao CAEPI, não infere validade do CA e não altera saldo. PDF externo é dado não confiável; nenhuma instrução embutida é executada. Sem camada de texto, a interface informa que OCR ainda não está disponível.
- Corrigida a importação do parser para usar o módulo interno `pdf-parse/lib/pdf-parse.js`; o entrypoint padrão executa uma rotina de depuração que tentava abrir `test/data/05-versions-space.pdf`, ausente neste pacote. Também foi identificado que o parser falha em alguns PDFs válidos ao receber diretamente o `Buffer` do Node; copiar a entrada para `Uint8Array` evita a falha de XRef.
- QA executado: testes focados de extração, rota/API e estoque (26/26); `npx eslint src/app/epi/estoque/section.tsx src/lib/epi-stock-pdf-extractor.ts tests/epi-stock-pdf-extractor.test.ts tests/epi-stock-pdf-extractor-route.test.mjs`; `npm run typecheck`; `npm run build`; todos aprovados. A rota tem testes para sessão/permissão antes de processar, ausência/tipo/tamanho de arquivo, campos retornados sem texto integral, indicação de OCR e erro interno sem detalhes. Build mantém aviso preexistente sobre o padrão amplo de arquivos em `src/app/api/health/route.ts`.
- Inspeção visual confirmou o formulário restaurado. Teste ponta a ponta na interface e endpoint com PDF sintético pesquisável e rótulos fictícios: 8 campos sugeridos; produto detectado “Protetor de teste CA 5745”, CA 5745, quantidade 7, NF 20578946, fornecedor “Bunzai EPI”, lote “FICTICIO-TESTE”, validade do produto 12/05/2027 e custo unitário R$ 4,25. Campos operacionais foram preenchidos como sugestões editáveis; produto/CA foram apresentados para comparação. PDF sintético válido sem camada de texto também foi enviado ao endpoint real e retornou `422` com mensagem de OCR indisponível. Nenhum formulário foi enviado, e o saldo demonstrativo permaneceu em 10 unidades.
- Permanecem fora da validação a compatibilidade com formatos reais variados de NF/relatório, OCR, permissão em produção e regras específicas de layouts. Próxima etapa segura: comparar heurísticas com mais PDFs fictícios de layouts distintos e ajustar apenas campos inequivocamente rotulados; manter confirmação humana e nunca inferir validade do CA.
- Robustez acrescentada: aceita referência no formato `NF-e nº 20578946` e encerra sugestões de produto/fornecedor quando outro rótulo conhecido vem logo depois na mesma linha do texto extraído. Regressão cobre quantidade abreviada (`Qtd.`), valor brasileiro com milhar/decimal (`1.234,50`), lote e validade lado a lado. Isso amplia layouts de texto previsíveis, não constitui compatibilidade universal com NF eletrônica, tabelas ou PDF de fornecedor específico.
- Proteção da revisão manual: campos preenchidos pelo gestor não são sobrescritos pela extração. Ao selecionar outro PDF, a interface limpa só as sugestões anteriores que continuam sem edição; campos alterados pelo usuário são mantidos. Requisições de leitura são canceladas/invalidadas ao trocar de arquivo ou de forma de entrada, evitando aplicar resposta atrasada de um documento anterior.
- Validação desta proteção: regressão EPI/rota/extração 26/26, ESLint, `npm run typecheck` e `npm run build` aprovados. A prévia `127.0.0.1:3108` não estava acessível nesta retomada, portanto não foi feita nova confirmação visual específica de edição manual ou troca rápida de PDF. O teste visual anterior com PDF fictício e a resposta de OCR indisponível permanecem registrados acima.
- Continuação em 2026-11-02: suíte completa da frente EPI (`tests/epi.test.ts`, estoque, extrator e rota de extração) passou 38/38. A prévia existente respondeu em `localhost:3107`, porém redirecionou ao login; não foram usadas credenciais nem repetido o teste visual autenticado. Nenhum registro foi criado ou submetido.
- Homologação manual local em 2026-11-02: na tela de estoque, dois PDFs pesquisáveis sintéticos foram selecionados no campo real do formulário e processados pela rota local. Cada um sugeriu 8 campos, alertou quando o CA fictício não correspondia ao item, e preencheu os campos operacionais revisáveis. Alterar manualmente a quantidade sugerida de 7 para 99 foi preservado ao selecionar o segundo PDF; as demais sugestões não editadas foram substituídas pelas do novo documento. PDF sintético sem camada de texto mostrou a orientação de OCR indisponível e removeu as sugestões antigas sem apagar o valor 99 digitado manualmente. Arquivo `.txt` recebeu rejeição explícita; PDF sintético de 15 MiB + 1 byte recebeu rejeição pelo limite de 15 MB. A tela foi recarregada ao final: saldo continuou em 10 unidades e histórico em 1 movimentação. O formulário nunca foi enviado.
- Preparação de homologação privada limitada a este computador: `scripts/dev-with-postgres.mjs` agora inicia o Next.js com `--hostname localhost`; o texto do login foi corrigido para não apontar às credenciais históricas do M02. `node --check` e ESLint do formulário de login passaram. Após autorização explícita do usuário, o processo antigo foi reiniciado; a porta 3107 ficou escutando somente em `::1` (loopback IPv6), e `/login` respondeu HTTP 200. A rota de estoque abriu novamente sem alterações: saldo de 10 unidades e histórico com 1 movimentação. O atalho continua reutilizando servidores ativos, então processos iniciados com configuração antiga devem ser reiniciados antes de considerar o acesso local restrito.
- Bloqueio para qualquer homologação externa/operacional permanece: autenticação e dados são demonstrativos, o armazenamento local não oferece garantias de produção, e não há ambiente de hospedagem definido. Não publicar estes dados, `.env.local` ou credenciais.
- O app possui registros preexistentes de empresa/contato cuja origem não foi confirmada e que podem conter dados reais. Não foram usados como dados de teste, alterados ou incluídos em capturas/exportações; até a origem ser verificada, tratá-los como sensíveis e manter o ambiente sem acesso pela rede.
