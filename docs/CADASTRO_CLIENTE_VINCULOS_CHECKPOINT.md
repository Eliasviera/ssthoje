# Cadastro de clientes e vínculos — candidato de 2026-11-03

Decisão posterior do usuário em 2026-11-03: o responsável autorizado da empresa confirma a prestação de consultoria após verificação de sua autoridade. A escolha pendente nas etapas abaixo foi resolvida. A continuação implementou e provou a fronteira SQL candidata em banco descartável, conforme `CONFIRMACAO_PRESTACAO_CONSULTORIA_CHECKPOINT.md`; interface e integração nos caminhos operacionais seguem pendentes. Contrato em `VINCULO_PRESTACAO_CONSULTORIA_CONTRATO.md`; decisão em `DECISION_LOG.md`. Nenhuma conta ou acesso ativo foi concedido por esse registro.

## Continuação — sessão assinada e leitores no navegador

Criados `examples/app/src/lib/client-company-request-candidate.ts` e `examples/app/scripts/client-company-browser-proof.mjs`; ampliado o verificador PostgreSQL com `--serve-ui-proof` e `--verify-http-proof`. O módulo de requisição aceita exclusivamente resolvedor de sessão confiável, restringe as permissões cliente à lista já preparada e resolve novamente o vínculo PostgreSQL em cada chamada. Não foi importado por rotas ou páginas ativas.

A tela HTTP de ensaio roda somente em localhost, com porta aleatória e dados fictícios em pasta temporária. Login usa `lookup_login_account`, a verificação de senha existente e `session-token.ts` para assinatura/expiração. Cookie HttpOnly/SameSite Strict, proteção de origem/token no formulário, limite de tentativas e respostas sem cache. O cookie não armazena empresa ou permissões. O tenant é fixado pela fixture confiável do ensaio; não vem do formulário. Não há diretório de memberships de produção integrado. HTTP sem cookie Secure é exclusivo deste localhost descartável; implantação exige HTTPS/configuração apropriada.

Prova visual executada com a habilidade de controle de interface:

1. Conta fictícia A entrou por senha e viu somente empresa A, DDS A e checklist A. DDS próprio abriu; URLs de DDS/checklist B mostraram “Registro não encontrado”.
2. Pelo controle de terminal do ensaio, o vínculo A foi revogado no PostgreSQL. Atualizar a página, mantendo a identidade da sessão, exibiu “Acesso indisponível”.
3. Conta fictícia B entrou por senha e viu somente empresa B, DDS B e checklist B. Checklist próprio abriu; DDS A mostrou “Registro não encontrado”.
4. As telas foram registradas em `assets/proofs/cliente-a-navegador-20261103.jpg`, `cliente-b-navegador-20261103.jpg` e `cliente-revogado-navegador-20261103.jpg`. O capturador devolveu JPEG; a extensão inicial PNG foi corrigida após conferir a assinatura dos arquivos. Resumo sem credenciais/IDs em `assets/proofs/clientes-navegador-resumo-20261103.json`.

Durante a prova, o detalhe de checklist mostrou título de DDS por reutilizar o campo da fixture. Corrigido para preferir `templateName`. A repetição automatizada por HTTP após o ajuste confirmou login de ambas as contas, cookie de sessão assinada, conteúdo/rotulagem próprios, 200 para os próprios DDS/checklists e 404 para ambos os tipos de registro da outra empresa. Sessão adulterada redirecionou ao login; origem externa de formulário foi negada com 403. O módulo de requisição também negou sessão ausente e permissões não preparadas (`dds.manage`, `documents.read`, dashboard, Master e desconhecida).

Comandos/resultados desta continuação:

- `node --import ./scripts/test-node-loader.mjs --experimental-strip-types scripts/verify-client-company-bindings-isolated.mjs --serve-ui-proof`: prova SQL aprovada; navegador com duas contas confirmado. Servidor encerrado por `stop`; o processo antigo permaneceu aguardando stdin e foi encerrado depois que a rotina já havia concluído a limpeza. O script foi corrigido para pausar stdin ao parar.
- Mesmo comando com `--verify-http-proof`: prova SQL e HTTP aprovadas, saída zero; servidor/contêiner descartáveis encerrados pelo script.
- `node node_modules/eslint/bin/eslint.js src/lib/client-company-request-candidate.ts scripts/client-company-browser-proof.mjs scripts/verify-client-company-bindings-isolated.mjs`: aprovado após a correção.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: aprovado. Não houve build Next nem teste das telas Next existentes.

Limite e próximo passo: esta é uma prova integrada de identidade candidata, sessão, resolvedor PostgreSQL e leitores reais DDS/checklist dentro de um harness isolado. Não valida login/páginas Next do produto, PDFs pelo navegador, gravação de desvio pelo navegador ou vínculo real de prestação de consultoria. A busca focalizada não encontrou fonte autoritativa para essa prestação; não foi inferida por grant, empresa, cobrança ou nome. Definir essa origem e sua revisão/revogação é requisito para integrar a autorização no produto e liberar contas cliente. O aceite humano de liberação segue pendente. Nenhuma publicação, migration ou alteração em dados ativos ocorreu.

## Continuação — persistência PostgreSQL descartável

Implementados `schemas/client-company-bindings-candidate.sql`, `src/lib/client-company-postgres-candidate.ts` e `scripts/verify-client-company-bindings-isolated.mjs` (caminhos de código relativos a `examples/app`). Não são migration ou cutover. O repositório recebe pool e autenticador explicitamente; não importa o pool ativo nem carrega `.env`. O comando de alteração e sua auditoria são executados por uma função SQL atômica, em vez de expor gravações independentes do contrato em memória.

Reconciliação com M22: contas e convites aceitos vêm de `tenant_identity_candidate`; memberships vêm de `sst.tenant_memberships`; a autoridade administrativa vem de `tenant_authority_candidate.admin_grants`. Não foi criado outro cadastro de identidade ou administrador. Para esta fatia de consultoria, o ator precisa de membership `consultoria_admin` ativa e grant administrativo ativo explicitamente para a empresa inteira. Grant global ou de uma única unidade não amplia essa autoridade. O destinatário deve ter conta ativa, membership cliente ativa e convite cliente aceito no mesmo tenant, sem concessão administrativa ativa nesse tenant. Não promove papéis nem cria membership por atalho. Conta ativada por convite não comprova identidade civil ou verificação externa de e-mail.

O SQL bloqueia/revalida os registros relevantes e serializa por tenant+usuário mesmo antes da primeira linha de vínculo. A revisão esperada rejeita atualização concorrente antiga. As tabelas têm segurança por linha forçada (RLS); o papel restrito recebe somente execução das duas funções, sem leitura/gravação direta. Eventos têm proteção contra atualização/exclusão. A função de resolução deriva tenant e usuário do contexto do servidor e revalida vigência, conta, membership, empresa, unidades e perfis ativos.

Prova executada em PostgreSQL 17 recém-criado, sem volume, com senha efêmera, porta aleatória somente em localhost e dados sintéticos. O script remove exclusivamente seu próprio contêiner ao concluir. Não acessa o banco ativo.

Resultados reais:

- Duas contas independentes ativadas por `invite_member`/`redeem_invitation`, com empresas distintas; resolução no tenant errado retorna nulo.
- Duas concessões concorrentes iniciais para a mesma conta: exatamente uma aprovada e uma rejeitada; uma revisão/evento inicial.
- Rejeitados cliente tentando conceder, Master sem membership, tenant adulterado, empresa divergente, unidade externa/duplicada, vencimento passado e sessão ausente.
- Papel restrito sem SELECT direto nos vínculos e sem DELETE/TRUNCATE nos eventos; UPDATE de evento também negado pelo trigger.
- Falha de auditoria injetada somente no banco descartável desfez a alteração do vínculo.
- Revogar vínculo bloqueou a consulta seguinte com a mesma identidade, preservando a segunda empresa e o histórico grant→revoke. Revogar autoridade administrativa impediu nova alteração; suspender conta bloqueou resolução.

Comando: `node --import ./scripts/test-node-loader.mjs --experimental-strip-types scripts/verify-client-company-bindings-isolated.mjs`: aprovado e repetido após a última alteração SQL. A preparação inicial falhou porque o perfil administrativo devia anteceder a membership; fixtures corrigidas sem desabilitar o trigger de proteção existente. Regressão dos três arquivos de teste anteriores: **23 aprovados, zero falhas**. ESLint dos dois arquivos novos de aplicação/script: aprovado. `tsc --noEmit --incremental false`: aprovado. Sem build ou prova de navegador nesta fatia.

Limitações: autenticação do repositório permanece injetada pelo ensaio; não foi conectado ao login, às páginas ou aos JSON ativos. O candidato usa funções SECURITY DEFINER conforme os schemas M22 existentes; proprietário/privilégios dessas funções exigem revisão específica para implantação. Não há prova de infraestrutura de produção ou de identidade real. A autorização explícita por empresa no ensaio não comprova documentalmente prestação de consultoria vigente: a fonte autoritativa desse vínculo de serviço continua pendente antes de habilitar clientes. Não há suporte novo para cliente direto. Próximo passo: conectar sessão e leitores a esse resolvedor em ambiente isolado, reconciliando a origem do vínculo de serviço e sem habilitar rotas no ambiente ativo; então executar o ensaio com duas contas no navegador e solicitar o aceite de liberação.

## Escopo desta fatia

Serviço candidato `examples/app/src/lib/client-company-provisioning-candidate.ts`, desconectado de rotas, login, sessões e cadastros ativos. Ele concede ou revoga o vínculo de uma identidade previamente verificada com uma empresa/unidades. Não cria uma consultoria, não armazena senhas e não implementa convite ou verificação de identidade. Modalidade cliente direto e concessão de acesso a consultor permanecem fora desta fatia.

Critério de aceite técnico: provar com identidades sintéticas independentes que a concessão deriva ator e consultoria do servidor, limita o papel a cliente, valida empresa/unidades e conserva vínculo e auditoria juntos. A prova usa adapter em memória com cópia transacional. O critério não equivale ao aceite completo de duas contas no navegador.

## Comportamento implementado

- O comando não aceita ator ou tenant como fonte de autoridade. Esses valores vêm de `authenticatedActor`, a implementar com sessão verificada do servidor.
- A transação revalida autorização administrativa para a empresa solicitada. Master não recebe acesso por seu papel de plataforma.
- Concessão exige identidade verificada, diferente do ator, sem papel Master, e empresa ativa da mesma consultoria. Não transforma administrador/médico em cliente nem reativa membership suspensa.
- Unidades devem pertencer à empresa. Rejeita lista vazia, duplicada, excessiva ou com identificadores inválidos; exige vencimento futuro e referência da revisão humana.
- Alterações exigem revisão esperada. O vínculo não muda silenciosamente para outra empresa. Vínculo, membership e auditoria fazem parte da mesma transação.
- Revogação exige autoridade atual, empresa correspondente e revisão vigente. Guarda evento com cópia do vínculo, preservando os escopos e revisões anteriores.

## Obrigações do futuro adapter persistente

1. Resolver a sessão por mecanismo autenticado. Identidade verificada significa ID estável confirmado pelo provedor/cadastro confiável; e-mail, nome ou ID informado no formulário não são prova.
2. Revalidar na transação tenant e membership do ator ativos, concessão administrativa explícita e escopo de empresa/unidade. Papel Master isolado deve ser negado. Caso consultoria, conferir vínculo de prestação de serviço vigente; não inferir acesso por cobrança ou titularidade da plataforma.
3. Consultar empresa, unidades, identidade e membership no escopo autorizado. Bloquear/revalidar esses registros contra suspensão, revogação ou mudança durante a operação.
4. Serializar por tenant+usuário, inclusive quando ainda não existe vínculo. Usar unicidade e revisão no banco; transação sem proteção para ausência de registro não evita duas concessões concorrentes.
5. Persistir membership, vínculo e evento em uma transação atômica. Auditoria deve ser append-only e conservar snapshots anteriores. Falha em qualquer etapa exige rollback completo. Não escrever separadamente nos JSON existentes.
6. Adaptar o resolvedor de autorização para conferir status/vigência a cada requisição, sem reutilizar o vínculo revogado da sessão ou do cache. Não passar vínculo revogado diretamente aos filtros de recurso.
7. Na futura fronteira HTTP: validação do formulário, proteção contra requisições forjadas (CSRF), limite de tentativas e respostas sem exposição de identidades. Esses controles não são fornecidos por este módulo desconectado.

## Validação e limites

Executado `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/client-company-provisioning-candidate.test.ts tests/client-company-isolation.test.mjs tests/tenant-access.test.ts`: **23 testes aprovados, zero falhas**. O novo arquivo cobre seis testes, incluindo duas identidades sintéticas, negações de autoridade, escopo/validade, preservação de papéis, rollback por falha na auditoria e revogação com histórico/revisão.

O adapter de teste não prova PostgreSQL, disputa entre processos, conta autenticada real, convites, entrega de credenciais ou navegador. As duas identidades são registros sintéticos em memória, sem login. Busca em `src` não encontrou importadores do serviço candidato. Dados ativos, permissões existentes, migrations e banco não foram alterados. Não houve build nem inspeção visual: não há nova rota ou interface nesta fatia.

`node node_modules/eslint/bin/eslint.js src/lib/client-company-provisioning-candidate.ts tests/client-company-provisioning-candidate.test.ts`: aprovado. `node node_modules/typescript/bin/tsc --noEmit --incremental false`: aprovado após corrigir a declaração da função de negação para permitir a análise de nulidade pelo TypeScript. Os 23 testes e o ESLint foram repetidos após o ajuste e passaram. A análise global de padrões da rodada anterior ainda tem dez erros e quatro avisos fora desta fatia; não foi declarada corrigida.

Próxima etapa: implementar/provar o adapter persistente em ambiente descartável, conciliado com a autoridade M22 existente, e só depois integrar autenticação e tela para ensaio com duas contas independentes. A liberação para clientes depende desse ensaio e de aceite humano específico.
