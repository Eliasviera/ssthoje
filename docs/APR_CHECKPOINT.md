# APR e checklists — checkpoint inicial

**Estado:** primeira fatia implementada localmente; conferir no painel antes de iniciar outra frente.

## Decisões registradas

- APR considera riscos de um PGR aprovado, selecionados manualmente no escopo exato de empresa/unidade.
- Modelos de checklist são configuráveis, reutilizáveis e versionados; a versão anterior continua no histórico.
- Um APR começa como rascunho e só pode ser enviada para revisão humana depois de responder todos os itens.
- Itens marcados como não aplicáveis exigem justificativa. Pontos a tratar exigem descrição, próximo passo e responsável.
- Envio para revisão não aprova o documento, não declara conformidade e não libera o início de atividade.
- Sem textos normativos, riscos ou itens pré-carregados; referências externas são registradas somente se a equipe as fornecer e revisar.

## Implementado

- A área aparece no painel inicial, abaixo de “Segurança operacional”; o cartão APR leva diretamente ao formulário.
- Modelos: atividade, perguntas em linhas separadas, referência opcional com versão/jurisdição/vigência/responsável e criação de nova versão.
- APR: empresa/unidade, PGR aprovado, seleção explícita de riscos, etapa, local, responsável e modelo de checklist.
- Respostas, justificativas, responsáveis e próximos passos; controle de revisão esperado, estados rascunho/em revisão e trilha na auditoria local.
- Ações server-side verificam membership/permissão, tenant e versão aprovada do PGR antes de aceitar IDs de risco.
- Persistência demonstrativa em `examples/app/data/safety-operations.json`, ignorada pelo Git conforme `.gitignore` do app.
- Sem migration/cutover: essa persistência JSON é local, sem criptografia e não adequada para dados reais ou produção.

## Como abrir

Clique duas vezes em `ABRIR-PAINEL.cmd` na pasta do projeto. O script abre `http://localhost:3107/` se o servidor já responder; caso contrário, inicia o servidor local e aguarda a resposta. Login continua necessário.

## Validação e limites

- Testes do armazenamento: 5 cenários cobrindo versionamento, tenant, snapshots, revisão concorrente, respostas obrigatórias e estados.
- TypeScript (`tsc --noEmit`) e ESLint focado passaram na primeira execução; depois disso, um teste revelou somente uma expectativa de texto incorreta, ajustada no teste. Reexecutar suíte completa após essa correção.
- O PostgreSQL local pode não ter PGR aprovado com riscos estruturados; sem esse dado a criação de APR permanece bloqueada de propósito.
- Não criamos checklist, APR, caso, risco nem dados fictícios no armazenamento persistente.
- APR não inclui aprovação final, relatório de não conformidade, PT/PTE, assinatura ou gate de mobilização.

## Próximas frentes registradas

1. Conferir esta APR/checklist e aceitar a primeira fatia.
2. Relatórios de não conformidades.
3. Ficha e estoque de EPI (a tela de entregas existente não é estoque).
4. Permissões de trabalho (PT/PTE).


## Retomada e validação — 2026-10-24

- `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test tests/safety-operations-store.test.ts`: 5/5 aprovados fora do sandbox; execução restrita falhou por EPERM em rename de arquivos temporários.
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- ESLint focado em store, actions, seção APR e teste: aprovado fora do sandbox; execução restrita ficou sem conclusão.
- Painel local respondeu HTTP 200. Conferência na sessão demonstrativa autenticada confirmou seção APR, abertura do formulário de modelo, estado vazio e bloqueio de nova APR sem checklist e riscos estruturados em PGR aprovado.
- Evidência visual: `docs/APR_VALIDACAO_2026-10-24.png`.
- Nenhum modelo, APR, risco ou dado persistente foi criado. Fluxo preenchido/envio não foi exercitado na interface devido aos pré-requisitos ausentes; cobertura automatizada não substitui esse teste.
- Aceite humano da primeira fatia continua pendente; não iniciar relatórios de não conformidade antes desse aceite.

2026-10-24: usuário respondeu “continua” ao pedido de aceite; primeira fatia APR aceita para avançar à frente de não conformidades. Isso não aprova conteúdo técnico nem autoriza inventar riscos. Ver NC_CHECKPOINT.md.

## Modelos configuráveis — retomada 2026-10-24

- Modelos de espaço confinado (“referência NR-33 a validar”) e atividades diversas são configuráveis sem itens normativos pré-carregados e começam como rascunho.
- Ativação exige revisão autenticada; o modelo de espaço confinado também exige referência, versão, jurisdição, vigência e revisor. A ativação não comprova qualificação nem conformidade.
- Eventos de criação de rascunho, ativação de modelo, criação de APR, salvamento de respostas e envio para revisão humana têm rótulos explícitos na auditoria.
- Validação final desta retomada: 25 testes focados passaram; TypeScript, ESLint e build de produção passaram. O build manteve aviso preexistente de padrão amplo em `/api/health`.
- Não foram criados modelos/APRs persistentes; o PGR visível permanece sem o estado aprovado e riscos estruturados necessários. Conteúdo técnico revisado continua pendente.
- Aceite do usuário em 2026-10-24: aprovação da apresentação dos eventos APR na auditoria, sem aprovação de conteúdo técnico, critérios, conformidade ou liberação operacional.
- Validação complementar dos rótulos da auditoria: `tests/audit-log-labels.test.ts` e `tests/safety-operations-store.test.ts` passaram (8/8); `tsc --noEmit` e ESLint focado nos componentes de auditoria passaram. Os eventos de criação, salvamento e envio da APR e de criação/ativação do checklist têm descrições explícitas.
- A primeira conferência do browser detectou dependência Node (`fs`/`crypto`) entrando no bundle client-side. Os rótulos foram isolados em `src/lib/safety-audit-labels.ts`, sem dependências de servidor; após reload, a prévia autenticada voltou a carregar normalmente. A tela mantém 0 APRs e nenhum modelo cadastrado.
- Com autorização do usuário, o formulário agora oferece duas estruturas iniciais opcionais e editáveis: atividade diversa e espaço confinado (“referência NR-33 a validar”). São perguntas para organizar escopo, etapas, riscos selecionados manualmente do PGR aprovado, registros da equipe e pendências; não incluem critério, medida de controle ou conteúdo normativo pronto. O botão somente preenche o formulário; a gravação exige envio explícito como rascunho e revisão humana para ativação.
- Teste `tests/safety-checklist-suggestions.test.ts` cobre as duas estruturas e que a seleção retorna cópia independente; testes APR, TypeScript e ESLint focados aprovados. A prévia foi conferida sem criar modelo ou APR persistente.
- Conferência posterior em prévia autenticada isolada (`3108`), com PostgreSQL local saudável: os dois botões preencheram categoria, título, atividade e perguntas esperados; a sugestão de espaço confinado manteve “referência NR-33 a validar” somente como texto organizacional e não preencheu fonte técnica. Nenhum formulário foi enviado, e a tela continuou com zero modelos e APRs. A prévia foi encerrada, a configuração temporária restaurada e o cache exclusivo removido.
- A verificação confirma apenas a interação de preenchimento; não é aceite técnico do checklist. Permanecem pendentes conteúdo normativo revisado, revisão humana do modelo e ativação. Não habilitar emissão operacional.
- O usuário confirmou em 2026-10-24 que ainda não há referência técnica revisada e pediu que ela não seja solicitada novamente até haver nova informação. Não inserir conteúdo técnico nesse intervalo.
- Gates atuais: ativar modelo exige revisão humana autenticada; criar cada APR exige PGR aprovado para a mesma empresa/unidade e seleção explícita de riscos dessa revisão. A ativação do modelo, por si só, não aprova conteúdo técnico nem libera trabalho.
- Decisão confirmada pelo usuário: manter o modelo reutilizável independente de PGR específico. A seleção de PGR aprovado é por APR, no tenant/empresa/unidade exatos. A resolução desse gate foi extraída para helper server-side reutilizável, com testes para estado aprovado, tenant/escopo e pertencimento dos riscos à revisão selecionada; o teste de armazenamento também protege a exigência de pessoa revisora para ativação.
- Teste adicional confirma que modelo genérico pode ser ativado após revisão humana sem vínculo a PGR e sem criar APR. A referência técnica revisada continua indisponível; não solicitar novamente até nova informação.
- A suíte agora protege também contra duplicar modelo já ativo e contra duas versões em rascunho concorrentes do mesmo modelo; a versão ativa permanece preservada até a revisão/ativação da nova versão.
- Teste de snapshot ampliado: ao ativar a versão seguinte, a APR existente conserva título, versão e pergunta do checklist original; a versão anterior passa a substituída, sem alterar o snapshot da APR.
- Validação desta fatia: testes APR/PGR e estruturas iniciais passaram (14/14); TypeScript (`tsc --noEmit`) e ESLint focado passaram. Um primeiro comando de teste falhou por sintaxe Windows no caminho do loader; reexecutado com o caminho relativo aceito pelo Node, passou. Testes anteriores foram ajustados para comparar estado antes/depois porque a suíte compartilha fixtures no processo. Nenhum modelo, APR, PGR ou risco foi criado no armazenamento ativo.
- Regressão ampla subsequente: suíte completa do app aprovada (400 passaram, 1 ignorado, 0 falhas; 12,35 s), incluindo os testes de APR, PGR, permissões e PT/PTE. Execução somente com fixtures; sem prévia, mutação ou dado persistente.
- Aceite humano em 2026-10-24: “aprovado” para a preservação do snapshot histórico do checklist e o comportamento de versionamento. Não é aceite de conteúdo técnico, norma, conformidade, modelo concreto ou emissão.
- Regressão completa repetida após o teste de snapshot: 400 passaram, 1 ignorado, 0 falhas (13,65 s).
- Cobertura estrutural adicionada para o limite existente de 1–50 perguntas, até 300 caracteres por pergunta, datas de calendário válidas e intervalo de vigência não invertido. Referências de teste são claramente sintéticas e não indicam fonte normativa aprovada; tentativas inválidas não gravam rascunho.
- Validação após esses testes: focados APR/PGR/sugestões 16/16; suíte completa 402 passaram, 1 ignorado e 0 falharam (14,79 s); TypeScript e ESLint focado passaram.
- Aceite do usuário “aprovado” registrado como estrutural/versionamento apenas. Referência técnica ainda indisponível; não solicitar novamente até nova informação. Sem critérios normativos ou liberação operacional.
- O armazenamento agora normaliza espaços nos metadados opcionais de referência e aplica no servidor limites iguais aos da interface: fonte até 180, edição 80, jurisdição 100 e revisor 120 caracteres. O teste confirma dados normalizados e rejeição sem gravação acima de cada limite.
- Validação após normalização/limites: testes focados 17/17; TypeScript e ESLint focado aprovados; suíte completa 403 passaram, 1 ignorado e 0 falharam (13,24 s).
- A descrição da seção na interface esclarece a decisão de produto: o modelo reutilizável é ativado após revisão humana; cada APR seleciona riscos do PGR aprovado no próprio escopo de empresa/unidade. TypeScript, ESLint da seção e suíte completa passaram (403, 1 ignorado, 0 falhas).
- A ativação reaplica a validação dos metadados opcionais de referência, incluindo limites de tamanho e calendário, para impedir que dados persistidos alterados após a criação do rascunho contornem as verificações de criação. Teste sintético confirma que metadados corrompidos mantêm o modelo em rascunho.
- Teste também confirma atomicidade do versionamento: se metadados da nova versão falham na ativação, ela permanece como rascunho e a versão anterior continua ativa.
- Validação final desta continuação: testes focados 18/18, TypeScript e ESLint focado aprovados; suíte completa 404 passaram, 1 ignorado e 0 falharam (13,48 s). A primeira execução focada falhou somente por regex de mensagem esperada incompatível; expectativa alinhada e todos os testes passaram.

## Retomada — 2026-10-25: revalidação estrutural na ativação

- Ativação agora reconfere nome, atividade, categoria, versão e todas as perguntas persistidas: de 1 a 50, texto não vazio até 300 caracteres, identificadores não vazios e únicos.
- Versão sucessora precisa conservar nome/atividade/categoria e seguir exatamente a sequência da versão ativa. Modelo inicial deve começar em 1.
- Teste sintético altera apenas a fixture temporária em nove situações (pergunta vazia/longa, ID duplicado/vazio, lista vazia, nome/atividade trocados, versão fora de sequência e categoria desconhecida). Cada tentativa recusada preserva o arquivo, mantém anterior ativa e sucessora como rascunho; restauração da fixture permite ativar a versão válida.
- Arquivos: examples/app/src/lib/safety-operations-store.ts e examples/app/tests/safety-operations-store.test.ts. Sem mudança visual ou conteúdo técnico.
- QA: testes focados APR/PGR/sugestões 20/20; TypeScript e ESLint focado aprovados. Regressão completa: 407 testes, 406 aprovados, 1 ignorado e 0 falhas (16,32 s). Comandos executados pelo Node local com loader scripts/test-node-loader.mjs; suíte completa com --test-concurrency=1. Fixtures temporárias apenas; execução fora do sandbox para permitir operações de renomeação.
- Build não repetido nesta fatia de validação de biblioteca sem mudança visual; TypeScript e regressão completa executados. Não declarar build novo validado.
- Nenhum modelo/APR/risco persistente criado ou ativado. Referência técnica continua pendente; não solicitar novamente até nova informação. Emissão/liberação operacional permanecem indisponíveis.

## Continuação — 2026-10-25: retrato completo do checklist na APR

- Novas APRs guardam checklistSnapshot com cópia do modelo ativo escolhido: identificação, categoria, perguntas, referência opcional e revisão humana registrada. Esse campo é obtido do modelo no servidor, não do formulário.
- Leitura retorna cópia independente, incluindo perguntas e referência aninhadas. Mudança posterior do modelo ou alteração da resposta retornada não modifica o retrato persistido.
- Campo opcional para compatibilidade: APR legada sem snapshot continua legível e não recebe referência/revisor reconstruídos retroativamente. Título, versão e perguntas já registrados permanecem.
- Arquivos alterados: examples/app/src/lib/safety-operations-store.ts e tests/safety-operations-store.test.ts; documentação em APR_CHECKPOINT.md e RETOMAR_PROJETO.md.
- QA: focados APR/PGR/sugestões 21/21; TypeScript e ESLint focado aprovados. Suíte completa: 408 testes, 407 aprovados, 1 ignorado, zero falhas (12,19 s). Fixtures temporárias apenas. Build não repetido nesta fatia sem alteração visual; não declarar novo build verificado.
- Nenhum modelo, APR, PGR ou dado operacional ativo criado/alterado; nenhum critério técnico ou liberação implementado. Revisão registrada não comprova qualificação ou conformidade. Conteúdo técnico segue pendente conforme decisão vigente.

## Continuação — 2026-10-25: integridade do checklist ao salvar/enviar APR

- Salvamento e envio para revisão agora validam a estrutura persistida: 1–50 respostas, IDs únicos/não vazios, perguntas válidas e resultados conhecidos, textos dentro dos limites e com tipo correto.
- Quando checklistSnapshot existe, devem corresponder tenant, modelo, versão, título e perguntas (IDs/textos/ordem). Divergência bloqueia a operação sem gravar nem tentar corrigir o histórico automaticamente.
- APR legada sem snapshot continua suportada: teste confirma salvamento e envio válidos sem reconstrução de dados históricos ausentes. Troca de versão do modelo não altera o snapshot da APR enviada.
- Teste de corrupção sintética em oito cenários comprova que salvar/enviar não alteram o arquivo quando rejeitados. Isto é consistência estrutural, não proteção criptográfica contra edição simultânea da APR e seu snapshot no arquivo local.
- Arquivos de código: examples/app/src/lib/safety-operations-store.ts e examples/app/tests/safety-operations-store.test.ts. Sem mudança visual, critério técnico, emissão ou dado operacional ativo criado/alterado.
- QA: focados 22/22 aprovados; TypeScript e ESLint focado aprovados. Após ampliar a compatibilidade legada no teste, suíte completa: 409 testes, 408 aprovados, 1 ignorado, zero falhas (12,18 s). Comando Node com loader scripts/test-node-loader.mjs e --test-concurrency=1; fixtures temporárias somente. Build não repetido nesta mudança de biblioteca sem interface.

## Continuação — 2026-10-25: histórico de respostas por revisão

- Novas APRs começam com registro de criação. Cada salvamento e envio guarda revisão, estado, respostas completas, data e conta responsável no mesmo arquivo da APR, usando a gravação atômica existente.
- A action de salvamento obtém a conta da sessão autenticada; o armazenamento passa a exigir esse identificador. Não aceitar nome livre como autoria autenticada.
- Estado anterior não é substituído no histórico. Respostas dentro dos registros retornados também são cópias independentes.
- Na primeira alteração de APR legada sem histórico, registra somente snapshot do estado corrente conhecido, com revisão/data disponíveis e sem autor inferido. Não fabrica revisões anteriores nem atribui ao criador a autoria de alterações desconhecidas.
- Antes de acrescentar uma revisão, a última revisão registrada precisa corresponder ao estado/respostas atuais. Divergência bloqueia salvamento/envio sem gravação. Trata-se de consistência estrutural, não assinatura ou proteção criptográfica contra alteração do JSON local.
- O histórico está disponível na estrutura de dados; não foi adicionada visualização nova na interface nesta fatia. Não é trilha transacional de produção nem substitui auditoria global.
- Arquivos: examples/app/src/lib/safety-operations-store.ts, src/app/safety-operations-actions.ts e tests/safety-operations-store.test.ts. Documentação em APR_CHECKPOINT.md e RETOMAR_PROJETO.md.
- QA: focados 23/23 e TypeScript aprovados. Suíte completa: 410 testes, 409 aprovados, 1 ignorado, zero falhas (16,15 s), apenas fixtures temporárias. Resultados finais de ESLint/build abaixo.
- Sem modelo/APR/risco operacional criado, sem dados ativos alterados, sem conteúdo técnico, assinatura ou liberação operacional implementados. Armazenamento continua JSON local sem criptografia e limitado a processo único.

Validação final do histórico em 2026-10-25: ESLint e build isolado completos aprovados (SST_BUILD_VERIFY_ID=apr-history-20261025), incluindo a etapa TypeScript. Permanece somente o aviso conhecido de padrão amplo de arquivos em /api/health. As duas inclusões temporárias desse build no tsconfig foram removidas, preservando as entradas preexistentes. Próximo passo recomendado: consulta das revisões no painel, sem reconstruir históricos ausentes e mantendo dados fictícios.

## Continuação — 2026-10-25: consulta visual do histórico

- Cada cartão APR passa a incluir Histórico de revisões, com expansão por revisão, ordem da mais recente à antiga, ação, estado, data/hora de Brasília, conta que registrou e respostas daquele registro. Observações, próximo passo e responsável informado permanecem separados.
- Legado parcial informa a primeira revisão conhecida; conta ausente fica explícita, sem atribuição inferida. Histórico inexistente é identificado sem fabricar versões.
- Componente sem ações de escrita ou edição do passado; usa apenas os dados tenant-scoped já fornecidos ao cartão APR. Não muda permissões, critérios, status nem liberação operacional.
- Usuário respondeu “sim, aprovado” durante esta implementação: aceite da apresentação proposta registrado, sem necessidade de pedir novamente a aprovação da mesma mudança. Não é aceite de conteúdo técnico ou emissão.
- Conferência visual: prévia isolada gerada pelo componente real, com três cenários sintéticos (completo, parcial e ausente). Expandir revisões confirmou perguntas, resultados, justificativa, próximo passo, datas e conta fictícia; no legado parcial, ausência de conta explícita. Evidência APR_HISTORY_VALIDACAO_2026-10-25.png. Não foram criadas APRs operacionais para essa verificação; o fluxo com APR persistida no painel ativo ainda não foi exercitado nesta fatia.
- Prévia gerada por node scripts/preview-apr-history.mjs em docs/APR_HISTORY_PREVIEW.html, sem leitura dos armazenamentos operacionais. HTML de demonstração sem dados reais, servido temporariamente apenas em localhost para QA.
- Arquivos: examples/app/src/app/apr-revision-history.tsx, examples/app/src/app/safety-operations-section.tsx e examples/app/scripts/preview-apr-history.mjs; documentação em APR_CHECKPOINT.md e RETOMAR_PROJETO.md, HTML/captura em docs.
- TypeScript e ESLint focado aprovados. Resultados finais de regressão/build abaixo.

Validação final da consulta de histórico em 2026-10-25: suíte completa 410 testes, 409 aprovados, 1 ignorado e zero falhas (38,05 s), TypeScript/ESLint/build isolado aprovados (apr-history-ui-20261025). Aviso conhecido de padrão amplo em /api/health permanece, sem falha. Inclusões temporárias desse build removidas do tsconfig; entradas preexistentes preservadas. Aba e servidor temporário da prévia encerrados após QA. Nenhum dado operacional ativo criado/alterado. Aceite já recebido nesta etapa. Próximo passo sugerido: comparar visualmente duas revisões sem editar o histórico, preservando distinção entre observação e conformidade.

## Continuação — 2026-10-25: comparação de revisões

- Cada revisão pode ser comparada ao registro anterior disponível na mesma APR, em consulta somente leitura, sem selecionar ou misturar APRs/tenants diferentes.
- Mostra pergunta, resultado, observação/justificativa, próximo passo e responsável informado que mudaram, com valores identificados por revisão. Alteração de estado da APR aparece separada, inclusive se respostas não mudaram.
- Itens alinhados por ID, nunca só por posição/texto. IDs desconhecidos entre registros aparecem como acrescentados/ausentes; duplicidade ou sequência inválida não produz comparação ambígua. Revisões intermediárias ausentes não são reconstruídas. Mudanças de resposta não representam validação de conformidade.
- Testes específicos: 5/5, cobrindo campos alterados, mudança apenas de estado, alinhamento/itens distintos, sequência/duplicidade inválidas e histórico parcial. TypeScript e ESLint aprovados. Suíte completa: 415 testes, 414 aprovados, 1 ignorado, zero falhas (34,29 s). Build isolado apr-comparison-20261025 aprovado, com aviso conhecido de padrão amplo em /api/health; inclusões temporárias desse build removidas do tsconfig.
- QA visual feito na prévia isolada do componente real com dados sintéticos: expansão de Revisão 3 e Comparar revisões 2 → 3 mostrou resultado/justificativa/ação/responsável anteriores e atuais. Evidência APR_COMPARISON_VALIDACAO_2026-10-25.png. Não foi preparada APR persistida no painel ativo para essa conferência. Aba e servidor temporários encerrados após QA.
- Nenhuma leitura extra ou gravação operacional, critério técnico, concessão de autoridade ou liberação adicionada.
- Arquivos: src/lib/apr-revision-comparison.ts, src/app/apr-revision-history.tsx, scripts/preview-apr-history.mjs, tests/apr-revision-comparison.test.ts (todos em examples/app); docs/APR_HISTORY_PREVIEW.html e captura/estes checkpoints.
- Aceite da visualização de histórico recebido anteriormente não é aceite desta nova apresentação de comparação. Conferir a imagem/fluxo e obter aceite visual antes de avanço dependente, conforme START_HERE_CODEX.md.

Aceite humano em 2026-10-25: usuário respondeu explicitamente “aprovado” à apresentação da comparação entre revisões consecutivas disponíveis da APR. Aceite visual/estrutural registrado; não aprova conteúdo técnico, conformidade, autoridade, assinatura ou liberação operacional.

## Continuação — 2026-10-27: duas estruturas para APR de espaço confinado

- A tela de modelos oferece estruturas iniciais separadas para espaço confinado geral e para silos, moegas e grãos. A segunda mantém esse cenário específico como conteúdo próprio; a primeira descreve o espaço, atividade, acessos, processos e riscos conforme cada situação.
- Códigos provisórios APR-EC-01 (geral) e APR-EC-02 (silos/moegas/grãos) aprovados pelo usuário em 2026-10-27; podem ser ajustados depois.
- Cada estrutura é preenchida no formulário, revisável e salva como rascunho. Não copia limites técnicos ou critérios do Word e não libera atividade. A referência NR-33 continua sujeita à revisão humana registrada antes da ativação.
- Arquivos: `examples/app/src/lib/safety-checklist-suggestions.ts` e `examples/app/src/app/safety-operations-section.tsx`. Não foram executados testes nesta alteração.
- Continuação 2026-10-27: TypeScript (`tsc --noEmit --incremental false`) e ESLint focado nos dois arquivos passaram. Conferência visual do painel local permanece pendente porque a conexão localhost foi bloqueada pelo ambiente; o servidor de prévia foi encerrado e as entradas temporárias do `tsconfig.json` foram removidas.
- Conferência visual 2026-10-27 no painel local em `http://localhost:3107/`: expandido “Configurar modelo reutilizável de checklist” e selecionadas as opções “Espaço confinado geral” e “Silos, moegas e grãos”. Ambas preencheram código, nome, atividade e perguntas correspondentes; nenhum rascunho foi salvo. Apresentação visual das duas opções aguarda aceite humano antes de avançar para integração de conteúdo mais detalhado dos Word.
- Continuação autorizada pelo usuário: APR-EC-01 recebeu roteiro geral de 15 perguntas sobre identificação, escopo, alternativas, equipe, riscos, controles, energias, recursos, resgate, etapas e encerramento. APR-EC-02 recebeu 18 perguntas que mantêm aspectos próprios de silos/moegas/grãos como condicionais. Conteúdo dos formulários Word foi resumido para perguntas de equipe; limites numéricos, bloqueios automáticos e critérios de liberação não foram incorporados. Nenhum modelo foi salvo no painel. TypeScript e ESLint focado passaram após a alteração; testes automatizados não foram executados. A revisão técnica do conteúdo-fonte continua necessária antes de ativação.
- Conclusão da etapa 2026-10-27 no painel local: salvos os rascunhos APR-EC-01 (15 perguntas) e APR-EC-02 (18 perguntas), versão 1 de cada. A tela confirmou ambos como “Rascunho · revisão pendente”; nenhum foi ativado nem usado para criar APR operacional. Referência NR-33 e responsável pela revisão ficaram em branco para preenchimento/revisão humana antes da ativação.
- Conferência dos metadados dos Word: foram encontrados os códigos de formulário FO-3.7.2.2 (APR de espaço confinado) e FO-3.7.4.3 (APR genérica). Os documentos não apresentam campos explícitos de edição/revisão ou vigência utilizáveis como versão e datas de referência do checklist. Metadados do arquivo (criação/modificação) não foram tratados como vigência. A referência completa permanece pendente de validação humana.
- Correção de nomenclatura em 2026-10-27, conforme usuário: ignorar os códigos FO dos Word nos nomes dos modelos. Sequência final das sugestões: `01 · APR EC Silos`, `02 · APR EC Geral` e `03 · APR Genérica`. Os dois rascunhos já salvos foram renomeados preservando IDs, itens, versão 1 e status de revisão pendente. A estrutura APR genérica existente foi mantida como terceira opção.
- A sequência das permissões de trabalho será tratada depois, em etapa separada. O usuário citou PTE, PT de Alturas e outros tipos de PT como parte dessa sequência futura.
- Retomada 2026-10-27: conferidos no código e no arquivo local os rótulos `01 · APR EC Silos`, `02 · APR EC Geral` e `03 · APR Genérica`; os dois rascunhos persistidos mantêm seus IDs, versões e estado pendente. TypeScript e ESLint focado passaram após a mudança de nomenclatura. A conferência visual da versão atual não foi possível nesta sessão: o painel interno perdeu a conexão e o ambiente bloqueou a abertura de socket para `localhost:3107`. Não foi executado teste automatizado nem alterada a numeração/conteúdo de PT/PTE.
- Aceite humano em 2026-10-27: usuário aprovou a organização/nomenclatura acima, com APR Genérica mantida como sugestão e os dois modelos EC como rascunhos. Esse aceite não revisa conteúdo técnico, não ativa os modelos e não libera emissão/atividade.
