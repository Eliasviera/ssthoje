# Convites para testadores — continuação local de 2026-11-02

## Aceite e resultado

O usuário confirmou a continuação do cadastro dinâmico e isolamento local após a etapa 1. Implementados:

- Master: `/master/convites`, com geração, listagem, revogação e uma prorrogação de 30 dias por conta. Link no painel Master. Cada ação revalida sessão e autorização no servidor.
- Ativação: `/convite/[token]`, nome de demonstração, e-mail, senha e confirmação de uso de dados fictícios. O convite vale sete dias e só pode ser usado uma vez; a conta começa com 30 dias na ativação.
- Conta e consumo do convite são persistidos juntos em `data/invites.json`, por substituição atômica do arquivo e trava exclusiva entre processos. Não existe escrita em dois arquivos para concluir a ativação. E-mail duplicado não consome o convite.
- O rascunho anterior `trial-accounts.ts`, que ainda não tinha arquivo de dados criado, foi integrado ao registro de convites; não há migração de contas existentes.
- Senha derivada com scrypt e sal aleatório; token persistido somente como hash. Listagens do Master não retornam hash de senha, token ou hash do token. O link original só aparece na resposta da geração.
- IDs de usuário e consultoria são gerados no servidor. O papel inicial é `consultoria_admin` da própria consultoria. Não recebe Master nem papel médico. A conta não recebe empresas/documentos das demonstrações fixas.
- Login, sessão, permissões e checagem de consultoria habilitada consideram vencimento e suspensão. Os leitores operacionais de cadastros de consultoria/membership passam a incluir as contas dinâmicas; as fixtures originais permanecem preservadas.
- Histórico de criação, ativação, revogação e prorrogação no próprio registro, com ator e horário. Prorrogação guarda também `extensionsUsed` e vencimento atualizado.
- Limite local de tentativas de ativação por hash de convite e limite administrativo existente. Server Actions usam a proteção de origem/CSRF do Next.js, conforme documentação local consultada. Não há envio automático de mensagens.

## Validação executada

Na pasta `examples/app`:

1. `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
2. `node node_modules/eslint/bin/eslint.js` nos arquivos alterados de aplicação e testes: aprovado; conferência adicional dos últimos arquivos alterados também aprovada.
3. `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/invite-store.test.ts tests/trial-invitation.test.ts tests/tenant-access.test.ts tests/platform.test.ts tests/session-token.test.ts tests/asaas.test.ts`: **34 aprovados, zero falhas**. Inclui isolamento de leitura após criação de empresa sintética, uso único, duplicidade, trava já ocupada, vencimento, suspensão, extensão única, negação ao Master e limite de tentativas. Não é uma prova de corrida real entre duas ativações simultâneas.
4. Suíte completa (`tests/*.test.ts tests/*.test.mjs`): **548 testes, 545 aprovados, duas falhas e um ignorado**. Falhas em arquivos não alterados nesta etapa: `pgr-digitalization-store.test.ts`, fixture sem `exposures` exigido pelo leitor; `safety-checklist-suggestions.test.ts`, expectativa de título `atividade diversa` diante de `03 · APR Genérica`. Ignorado: restrição de symlink do Windows. A regressão inicial do subprocesso Asaas foi corrigida separando o leitor de identidade do runtime `server-only`.
5. Compilação isolada: `SST_ISOLATED_BUILD=1`, `SST_BUILD_VERIFY_ID=convites-20261102`, `node node_modules/next/dist/bin/next build`: **aprovada**, com novas rotas presentes. Dois avisos de rastreamento amplo da pasta `data`, em `api/health/route.ts` e `local-invite-lock.ts`; exigem atenção à performance/empacotamento antes de publicação. As entradas temporárias que o Next adicionou ao `tsconfig.json` foram removidas após a prova.
6. Servidor da compilação isolada em `127.0.0.1:3127`: GET do convite inválido respondeu 200 com mensagem explicativa e `private, no-cache, no-store`. GET da administração sem sessão retornou redirecionamento de streaming ao login, sem o formulário administrativo. Navegador confirmou a mensagem de convite indisponível e a chegada ao login. Servidor e aba temporários encerrados ao concluir.

Os primeiros testes no sandbox falharam com `EPERM` no rename de arquivos temporários; a repetição autorizada fora do sandbox produziu os resultados acima. Nenhuma credencial real foi lida para a prova, nenhuma conta foi criada no cadastro ativo e nenhum convite real foi gerado. Os testes usam pastas isoladas e dados sintéticos.

## Continuação — prova autenticada no navegador (2026-11-02)

Executado `node scripts/trial-invite-ui-sandbox.mjs --isolated-ui-proof` para servir a compilação anterior em `127.0.0.1:3128`. O script cria uma pasta temporária vazia, limpa variáveis herdadas que não sejam necessárias ao sistema operacional, gera segredo de sessão exclusivo da execução e configura somente o Master fictício. Não carrega o `.env` do projeto. A junction aponta apenas à compilação isolada; os dados permanecem no temporário. A configuração do roteador precisa habilitar Cache Components como na compilação; as duas primeiras inicializações não tinham essa configuração e retornaram `DYNAMIC_SERVER_USAGE`, corrigido apenas no servidor de prova.

Resultados observados no navegador:

1. Login do Master fictício → geração de convite pela tela de administração.
2. Saída do Master → abertura do convite → preenchimento com nome/e-mail/senha fictícios → ativação → retorno ao login.
3. Login do testador → consultoria própria com **zero empresas** → cadastro de uma empresa/unidade inteiramente sintética → confirmação de gravação e listagem com **uma empresa**.
4. A conta do testador tentou abrir `/master/convites` e foi enviada a `/sem-acesso`.
5. O vencimento foi simulado **somente no JSON temporário marcado `UI_PROOF_ONLY`**. Ao abrir novamente Empresas com a sessão já existente, o navegador foi enviado ao login. Esse ensaio não esperou 30 dias reais.
6. Master fictício entrou novamente → autorizou uma prorrogação → a tela passou a mostrar **1/1**, com novo vencimento e sem botão de segunda prorrogação.
7. Segundo convite gerado e ativado pela interface. A segunda conta entrou em outra consultoria com **zero empresas**. Ao tentar a URL exata da empresa da primeira conta, recebeu **404**, sem o conteúdo do outro cliente.
8. Reabrir o primeiro convite consumido mostrou “Convite indisponível, usado ou expirado”, sem formulário de ativação.

Conferência adicional dos arquivos temporários por assertivas executadas: duas contas e dois tenants distintos, uma empresa vinculada somente ao primeiro tenant, histórico `created→activated→extended` da primeira conta, uma extensão na primeira e zero na segunda. Resumo sem identificadores ou credenciais salvo em `assets/proofs/convite-prova-resumo-20261102.json`.

A prova revelou orientação genérica no retorno da ativação. Corrigidos `src/app/login/page.tsx` e `src/app/login/login-form.tsx`: o retorno `/login?convite=ativado` agora explica “Cadastro concluído” e orienta a usar o e-mail e a senha escolhidos. O parâmetro só controla a mensagem; não cria sessão, conta, permissão nem atesta autenticação. Compilação nova com `SST_BUILD_VERIFY_ID=convites-ui-20261102` passou; os mesmos dois avisos de rastreamento amplo permanecem. A mensagem corrigida foi conferida no navegador na nova compilação com uma nova pasta temporária, por acesso ao retorno de ativação. O fluxo completo de cadastro acima foi executado na compilação anterior; a lógica de cadastro/autorização não mudou nesta continuação.

Validação desta continuação: `tsc --noEmit`, ESLint nos dois componentes e no script, compilação isolada e repetição dos **34 testes focados, todos aprovados**. A suíte completa não foi repetida nesta continuação; permanecem registrados os dois problemas PGR/APR da rodada anterior. As entradas temporárias adicionadas pelo Next ao `tsconfig.json` foram removidas após a prova.

Evidências exclusivamente fictícias:

- `assets/proofs/convite-consultoria-ficticia-20261102.png`: confirmação do cadastro sintético.
- `assets/proofs/convite-prorrogacao-ficticia-20261102.png`: resultado da prorrogação única.
- `assets/proofs/convite-confirmacao-ativacao-20261102.png`: orientação corrigida no login.
- `assets/proofs/convite-prova-resumo-20261102.json`: contagens e assertivas sem dados identificadores.

O servidor e a aba de prova foram encerrados. As pastas temporárias sintéticas foram preservadas para inspeção; não há expurgo automático por este script. Nenhum convite, conta ou empresa foi criado nos cadastros ativos. Não houve deploy, integração externa nem alteração normativa. **A prova automatizada não substitui o aceite humano da interface.**

## Limites e próximo aceite

- Fluxo **local**, ainda não publicado no servidor de testes. Não é integração com o provedor de identidade nem provisionamento PostgreSQL/M22. Os módulos que exigem autoridade relacional não ganham membership por este cadastro JSON e continuam sujeitos aos seus bloqueios; não há cópia automática nem fallback para dados de outra consultoria.
- Vencimento bloqueia acesso, mas **não apaga dados**. Expurgo verificável, exportação e solicitação de prorrogação pelo testador continuam pendentes. A interface declara a ausência de exclusão automática. Não divulgar a promessa de expurgo até implementá-la e prová-la.
- Persistência local sem criptografia de todo o cadastro; somente a senha e o token recebem proteção criptográfica específica. Uso restrito a demonstração com cadastros/documentos fictícios.
- Trava abandonada por encerramento abrupto não é removida automaticamente; operador deve comprovar que nenhum processo grava antes de recuperá-la. Limites de tentativas em memória são reiniciados com o processo e não substituem controle distribuído em produção.
- Prova automatizada autenticada no navegador concluída conforme a continuação acima. Aceite humano da interface, uso em celular real e validação dos demais módulos continuam pendentes.
- Próximo passo recomendado: revisão humana das evidências e fechamento do ciclo de expurgo antes de publicar convites para testadores externos. Corrigir as duas falhas da suíte em uma etapa própria.

## Arquivos alterados/criados

Todos os caminhos de aplicação abaixo são relativos a `examples/app`:

- `src/app/actions.ts`, `src/lib/session.ts`, `src/lib/tenant-access.ts`, `src/lib/tenant-state.ts`.
- `src/lib/invite-store.ts`, `src/lib/trial-accounts.ts`, `src/lib/trial-registry.ts`, `src/lib/trial-password.ts`, `src/lib/trial-invite-service.ts`, `src/lib/local-invite-lock.ts`.
- `src/app/master/convites/page.tsx`, `src/app/master/convites/panel.tsx`, `src/app/master/convites/actions.ts`, `src/app/master/master-dashboard.tsx`.
- `src/app/convite/[token]/page.tsx`, `src/app/convite/[token]/form.tsx`, `src/app/convite/[token]/actions.ts`.
- `src/lib/platform-store.ts`, `src/lib/billing-store.ts`, `src/lib/asaas-inbox.ts`, `src/lib/integration-store.ts`, `src/lib/job-sandbox.ts`, `src/lib/otp-sandbox.ts`, `src/app/master/integracoes/page.tsx`.
- `src/lib/pcmso-store.ts`, `src/lib/pcmso-postgres-operations.ts`, `src/lib/third-party-store.ts` (consulta de memberships dinâmicas, sem nova atribuição médica).
- `tests/trial-invitation.test.ts`; `tests/platform.test.ts` (corrigida contagem da fixture existente: cinco membros com o perfil Campo).
- Documentação: este checkpoint, `docs/CHANGELOG.md` e `docs/DECISION_LOG.md`.
- Continuação visual: `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `scripts/trial-invite-ui-sandbox.mjs` e as quatro evidências em `assets/proofs` listadas acima.

Nenhum commit, migration, deploy, envio de mensagem ou alteração de documento regulatório foi realizado.
