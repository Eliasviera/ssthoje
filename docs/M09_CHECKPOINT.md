# M09 — PCMSO e fluxo médico responsável

- **Data:** 2026-10-09.
- **Estado:** escopo aprovado explicitamente pelo usuário em 2026-10-09; demonstração implementada e verificada. Aguarda aceite humano da interface antes de M10.
- **Etapa anterior:** M08 aprovado pelo usuário em 2026-10-08. A conferência manual pendente do M07 continua registrada separadamente.

## Constatações anteriores à implementação

- A aplicação local está em `examples/app`, com Next.js, React e TypeScript; esta pasta não é um repositório Git.
- O servidor deriva a consultoria da sessão e aplica permissões por papel.
- O papel `profissional_habilitado` possui `medical.review`, mas não distingue médicos dos demais profissionais habilitados. Não deve autorizar PCMSO apenas por esse papel genérico.
- Não há conta fictícia médica, vínculo de coordenador médico por empresa/unidade nem armazenamento próprio de PCMSO.
- O fluxo de PGR possui histórico de versões e revisão interna; suas permissões não são suficientes para autorizar um fluxo médico.
- A persistência atual é local em arquivos, sem proteção adequada para dados reais de saúde.

## Escopo aprovado pelo usuário

Implementar primeiro uma demonstração exclusivamente documental de PCMSO (Programa de Controle Médico de Saúde Ocupacional), com vínculo a empresa/unidade e sem dados individuais de trabalhadores.

| Ator | Acesso proposto |
|---|---|
| Administradora da consultoria | Ver andamento administrativo e vincular um coordenador médico fictício autorizado na demonstração |
| SST/TST | Ver somente andamento administrativo, sem conteúdo médico |
| Coordenador médico explicitamente vinculado à empresa/unidade | Criar e editar rascunhos, enviar e registrar revisão interna simulada |
| Outros profissionais habilitados, clientes, terceiros e SaaS Master | Sem acesso ao conteúdo ou ações de PCMSO nesta etapa |

O vínculo médico deve ser verificado no servidor junto com a consultoria da sessão, em cada leitura e alteração. Uma credencial profissional informada no formulário não concede acesso automaticamente. A verificação real de habilitação e a política de concessão de acesso permanecem pendentes para produção.

### Conteúdo e estados propostos

- Identificadores de empresa/unidade, título, versão, coordenador fictício e datas de criação/alteração.
- Texto documental livre informado pelo coordenador, sem regras, exames, periodicidades ou conclusões clínicas pré-preenchidas.
- Estados: rascunho, em revisão e revisão interna registrada; identificação permanente de demonstração sem assinatura.
- Cada alteração preserva a versão anterior e identifica o autor. Uma revisão registrada não permite editar silenciosamente o conteúdo revisado.
- Auditoria das leituras e alterações autorizadas, contendo identificadores e ação, sem copiar o conteúdo documental.
- Não incluir prontuário, diagnóstico, resultados de exames, ASO ou decisão de aptidão; esses itens não integram o M09.
- Sem assinatura ou publicação com efeitos externos; o fluxo de assinatura deve ser decidido separadamente.

## Verificação prevista após a decisão

1. Demonstrar criação, edição e revisão interna com conta médica fictícia vinculada.
2. Verificar que administradora e SST recebem somente os metadados administrativos autorizados no servidor.
3. Testar negação para profissional genérico, médico não vinculado, sessão ausente e outra consultoria, inclusive ao enviar identificadores diretamente.
4. Conferir preservação de versões e registro de acesso sem texto médico nos logs.
5. Executar checagem de tipos, análise estática e testes de autorização; revisar interface em desktop e celular.
6. Submeter a demonstração ao aceite humano antes de avançar ao M10.

## Decisão registrada

Usuário respondeu “sim” à matriz de acesso proposta e ao fluxo de revisão interna sem assinatura em 2026-10-09. Isso responde parcialmente à pergunta 12 de `OPEN_QUESTIONS.md`; a definição de campos de saúde e retenção da pergunta 4 permanece fora deste escopo documental.

## Validação realizada nesta retomada

Inspecionados requisitos, roadmap, decisões, checkpoint M08 e código de permissões, contas de demonstração, auditoria e PGR. Nenhum teste de aplicação foi executado nesta preparação, pois não houve alteração de código. M09 permanece aberto.

## Implementação M09

- Novo papel específico de coordenador médico, sem acesso genérico aos demais documentos, empresas ou trabalhadores. O papel profissional habilitado não concede acesso a PCMSO.
- Administradora vincula o coordenador fictício a empresa/unidade ativa. O servidor determina a consultoria pela sessão e valida empresa, unidade e médico dentro dela.
- Coordenador vinculado salva conteúdo fictício, preserva versões, envia para revisão e registra a revisão interna simulada. Esta demonstração permite ao próprio coordenador registrar a revisão; dupla revisão e assinatura não foram implementadas.
- PCMSO em revisão ou revisado não pode ser editado. Versão desatualizada é recusada e a interface bloqueia envio com alterações não salvas.
- Administradora/SST recebem somente uma projeção explícita de metadados administrativos, sem conteúdo, versões ou histórico de conteúdo.
- Auditoria de leituras e alterações inclui o identificador do PCMSO e não copia seu texto. Ações exigem sessão, autorização e vínculo; limite local de 30 tentativas de alteração por usuário por minuto. Formulários usam Server Actions com proteções de origem do Next.js.
- Armazenamento em examples/app/data/pcmso.json, exclusivamente local e fictício. Serviço de aplicação protegido por server-only.

## Verificação executada

- node --experimental-strip-types --test tests/*.test.ts: **13 testes passaram**, incluindo isolamento, negação por identificador direto para outro coordenador/consultoria, campos não enviados ao perfil administrativo, revisão bloqueada, versões antigas preservadas e ausência de conteúdo nos logs.
- node node_modules/typescript/bin/tsc --noEmit: **passou**.
- ESLint dos arquivos TypeScript alterados e do novo teste: **passou**.
- Navegador: administradora vinculou coordenador à Empresa Fictícia Teste M08 / Unidade fictícia M08; médico salvou duas versões, enviou e registrou revisão. Conferido bloqueio de envio quando há alterações não salvas.
- Navegador: SST viu somente andamento e a segunda consultoria Aurora não exibiu o PCMSO da Horizonte. Conta administradora Horizonte restaurada ao final.
- Conferência visual em tamanho normal e largura móvel de 390 pixels; formulário em coluna e navegação inferior com rolagem. Após reiniciar o servidor, confirmados tamanhos de fonte de 14px para aviso e 16px para título do cartão.
- Evidências: assets/m09-administradora.png, assets/m09-medico.png (antes do ajuste final de tipografia) e assets/m09-celular.png.
- O primeiro teste em diretório temporário do sandbox falhou por restrição de rename no Windows; testes passaram usando diretórios isolados sob data, sem alterar os cadastros da demonstração. O servidor também exigiu execução autorizada fora do sandbox para o compilador acessar o projeto.
- Não executado build de produção, teste de carga ou auditoria de segurança externa; testes de autorização exercitam o serviço e foram complementados pela conferência dos perfis no navegador.

## Como conferir

1. Acesse http://127.0.0.1:3000/ com a conta administradora M02 e abra PCMSO. O cartão de teste mostra versão 2 e revisão interna registrada, sem texto médico.
2. Para ver as versões, use a conta fictícia medico@ssthoje.local, senha MedicoFicticio2026!, e abra PCMSO. Estas credenciais são somente da demonstração local; não são credenciais reais.
3. Expanda Versões preservadas e Histórico. O documento revisado não oferece edição.
4. Para testar um novo rascunho, cadastre uma nova empresa/unidade fictícia como administradora, vincule o médico em PCMSO e entre com a conta médica.
5. Após sua conferência, registrar aceite explícito do M09; somente então avançar ao M10.

## Arquivos alterados/criados

- examples/app/src/lib/pcmso-store.ts e pcmso-service.ts: persistência, projeção administrativa, vínculos e autorização.
- examples/app/src/app/pcmso-actions.ts e pcmso-section.tsx: ações e formulários.
- examples/app/src/lib/tenant-access.ts, demo-accounts.ts e audit-log.ts: papel médico, conta local e eventos.
- examples/app/src/app/page.tsx, dashboard.tsx e globals.css: integração e apresentação.
- examples/app/tests/pcmso.test.ts: testes de acesso, transições e histórico.
- examples/app/.env.example: nomes das configurações médicas, senha vazia; .env.local atualizado somente com conta fictícia, sem reprodução de segredos existentes.
- docs/M09_CHECKPOINT.md, DECISION_LOG.md e CHANGELOG.md: escopo, validação e checkpoint.
- assets/m09-*.png e examples/app/data/pcmso.json: evidências e documento fictício local.

## Limites e riscos remanescentes

Persistência em arquivo sem criptografia, sem transação entre auditoria e documento, sem controle de concorrência entre múltiplos processos, limite de requisições em memória e identidades fictícias. Não inserir dados reais. A habilitação real do médico, retenção, governança de saúde, assinatura e revisão profissional continuam pendentes. O aceite desta demonstração não libera produção.

## Continuidade autorizada pelo usuário
- Em 2026-10-09, após proposta conjunta de aceite M09 e escopo M10, o usuário respondeu “continua”. Registrado aceite para avançar na demonstração; não equivale a validação médica/legal ou liberação de produção.
