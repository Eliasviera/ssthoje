# Apontamento técnico: PGR, PCMSO, ASO e eSocial

Data da análise: 2026-10-12  
Escopo: leitura do código, formulários, stores e testes do `examples/app`. Nenhum cadastro ou arquivo de dados foi alterado.

## Resumo executivo

O app ainda não tem uma cadeia estruturada ligando riscos do PGR a ações do PCMSO, exames previstos e registros de ASO. Os documentos atuais são demonstrações locais: PGR e PCMSO aceitam texto livre; ASO registra nomes de exames e datas manualmente. Há um snapshot das Tabelas 24 e 27 e associações manuais, versionadas e revisadas por pessoa autorizada. No editor do inventário estruturado do PGR, uma pessoa também pode pesquisar a Tabela 24 e vincular uma escolha manual ao risco, com justificativa e referência ao snapshot; isso não se aplica ao campo antigo de texto livre e não sugere ou valida correspondência técnica.

## O que existe hoje

- **PGR:** rascunho por empresa/unidade, com `activityDescription`, `riskInventory` e `actionPlan` como textos. O documento apresenta campos orientativos para revisão humana, mas não guarda riscos como registros identificados nem relaciona atividades, grupos expostos, medidas ou exames por chave.
- **PCMSO:** vínculo de coordenador médico por empresa/unidade e estados de rascunho, revisão e revisão interna. O conteúdo é uma string de até 12.000 caracteres com revisões. Não existe plano de exames estruturado nem ligação a riscos do PGR.
- **Trabalhadores:** mantêm empresa/unidade, função e categorias demonstrativas em `riskCategories`. Essa lista não tem relação persistida com os riscos livres do PGR e não é enviada ao ASO.
- **ASO:** vinculado ao trabalhador e ao escopo médico/unidade. Guarda referência, data do atendimento, aptidão selecionada pelo médico e até dez exames com nome/data digitados livremente. O sistema não calcula aptidão, não registra resultados clínicos e não vincula cada exame ao plano do PCMSO ou a um risco do PGR.
- **eSocial:** há snapshot de consulta das Tabelas 24 (S-2240) e 27 (S-2220), identificado por versão e fonte oficial, e associações manuais versionadas entre código e referência interna. No inventário estruturado do PGR, a Tabela 24 pode ser consultada por risco, com seleção e justificativa manuais guardadas no snapshot do PGR; a interface antiga de riscos em texto livre não tem essa ligação. O catálogo não determina aplicabilidade e não tem vigência individual por código. Não há leiautes/XML de eventos, geração de eventos, ambiente de envio, assinatura digital, recibos, retificação ou controle de protocolo.

## Lacunas antes de alimentar o PGR

1. **Inventário estruturado:** criar identificadores e versões por estabelecimento para processo/atividade, perigo/fator, fonte/circunstância, danos possíveis, grupo/funções expostas, caracterização da exposição, medidas existentes e evidências. A avaliação/classificação deve registrar o método e a decisão profissional, sem inferência automática.
2. **Plano de ação rastreável:** relacionar cada ação ao risco identificado, com responsável, prazo, estado, evidência e verificação de eficácia; preservar versões e histórico.
3. **Vínculos de trabalhadores:** permitir relacionar trabalhadores/funções e grupos expostos aos riscos com vigência e evidência, em vez de depender apenas de categorias livres.
4. **Revisão profissional:** autoria, responsável habilitado, data, base/metodologia aplicada e estado explícito de pendências. A aprovação interna atual não equivale a assinatura ou conformidade.

## Lacunas PCMSO / exames

- Substituir ou complementar o texto livre com um plano de ações de saúde ocupacional estruturado e versionado.
- Relacionar cada ação/exame ao risco ou grupo exposto que fundamenta sua indicação, com justificativa e referência profissional. Não deduzir exames automaticamente de uma categoria genérica de risco.
- Registrar procedimento/código aplicável, momento ou periodicidade, responsável, situação e vínculo com a versão do PGR/PCMSO. A decisão médica continua humana.
- Manter resultados e informações clínicas fora das listas administrativas e com acesso mínimo. O ASO atual já evita resultados clínicos, mas seus exames são entradas livres e não representam um catálogo ou agenda ligada ao PCMSO.

## eSocial: consulta existente e escopo que ainda não existe

Os leiautes oficiais atuais listam, entre outros, S-2210 (CAT), S-2220 (monitoramento da saúde) e S-2240 (condições ambientais/agentes nocivos). O portal mantém documentação técnica e leiautes versionados; o snapshot local consultado é S-1.3 consolidada até NT 07/2026, com revisão publicada em 20/10/2026. O evento e os pré-requisitos aplicáveis dependem do caso e devem ser conferidos no leiaute/MOS vigente.

Antes de qualquer integração, faltam no produto:

- ligação versionada entre dados estruturados do produto e os campos de cada evento oficial, com validação por evento; as associações manuais atuais só relacionam código e referência interna informada pela pessoa;
- identificadores cadastrais reais exigidos no evento, que não fazem parte deste conjunto demonstrativo;
- trilha de preparação, revisão humana, assinatura/autorização do empregador, envio, recibo, rejeição, retificação e cancelamento quando aplicável;
- integração oficial e ambiente de testes, credenciais/certificado e controles de acesso/separação de responsabilidades;
- política de proteção, retenção e minimização para dados pessoais e dados de saúde.

O catálogo está disponível em **Referências** para qualquer membro autenticado com acesso ao painel da consultoria (`tenant.dashboard.read`), com busca manual por código/descrição. A gestão e revisão de associações permanecem em uma tela separada e condicionadas às permissões específicas de cada tabela. Há atalhos para o catálogo nas áreas PGR e PCMSO. O eSocial continua **não integrado**: não se deve apresentar o PGR/PCMSO/ASO do app como evento transmitido ou obrigação cumprida, nem tratar resultado da pesquisa ou associação como confirmação de aplicabilidade.

### Snapshot de consulta — 2026-11-01

- Fonte consultada: [tabelas oficiais eSocial S-1.3, consolidadas até NT 07/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-07-2026/tabelas.html/view), publicação que exibe revisão de 20/10/2026.
- Snapshot local: `examples/app/src/lib/esocial-tables-s13-nt07-2026.json`, com 92 códigos da Tabela 24 (agentes nocivos/atividades do S-2240) e 1.450 da Tabela 27 (procedimentos diagnósticos do S-2220). Hash SHA-256 da página capturada fica no arquivo junto à versão e data de consulta.
- A página consultada não informa vigência individual para cada código no recorte. A aplicação mostra aviso de conferência da fonte; não valida a vigência nem a adequação clínica/ocupacional.
- A consulta do catálogo é read-only e não salva dados. Atualizar o snapshot exige nova conferência e revisão humana da fonte.

### Associações manuais — 2026-11-02

- Tabela 24/S-2240 e Tabela 27/S-2220 têm permissões distintas: o perfil `sst_tst` pode registrar/revisar associações da Tabela 24; `medico_coordenador`, da Tabela 27. O papel configurado no app não comprova formação, habilitação ou registro profissional.
- Cada associação é um rascunho com referência interna informada manualmente. A revisão humana exige justificativa; uma associação revisada não pode ser sobrescrita. Uma alteração deve criar outra versão ligada à anterior.
- As ações são limitadas ao tenant ativo e ficam no armazenamento local `examples/app/data/esocial-mappings.json`, com eventos de auditoria. Nenhuma associação real foi registrada.
- No editor PostgreSQL do inventário estruturado do PGR, o perfil com permissão da Tabela 24 pode pesquisar seu snapshot dentro de cada risco, selecionar um código sem sugestão automática e registrar justificativa. Código, descrição, versão e fonte ficam no snapshot versionado do inventário e são revalidados no servidor ao salvar. A indicação não comprova aplicabilidade nem vigência; requer conferência humana e não gera S-2240. O formulário legado de PGR com risco em texto livre não foi alterado.
- A Tabela 27 pode ser pesquisada em modo somente leitura na seção do PCMSO, visível ao coordenador médico fictício. Na tela de associações manuais, o vínculo da Tabela 27 seleciona uma versão salva do PCMSO atribuída ao médico e valida novamente no servidor versão e escopo empresa/unidade. Revisões anteriores salvas continuam selecionáveis; o cartão mostra empresa/unidade e versão correspondente sem expor o conteúdo do documento nessa tela. Isso identifica a origem da associação, mas não cria um item estruturado de exame/procedimento nem comprova indicação ou realização. As associações continuam versionadas em store separado, sem sincronização automática com o documento.

## Sequência recomendada

1. Aprovar o modelo de dados e as responsabilidades profissionais para riscos e grupos expostos, antes de cadastrar o inventário da Caldeiraria.
2. Estruturar PGR por unidade e risco, preservando os textos e revisões atuais; construir e testar a migração de dados separadamente.
3. Estruturar o plano do PCMSO com ligações explícitas ao inventário, deixando indicação de exames sob revisão médica.
4. Ligar ASO ao plano/itens pertinentes sem expor resultados clínicos a perfis administrativos.
5. Estruturar procedimentos do plano PCMSO e, então, avaliar uma consulta equivalente à Tabela 27 com decisão médica explícita.
6. Só então especificar um módulo de exportação e, em fase separada, uma integração eSocial conforme leiautes oficiais vigentes e aprovação jurídica/técnica.

## Progresso do modelo estruturado — 2026-10-12

- Criado `schemas/pgr-risk-inventory.json` como contrato versionado por empresa/unidade, com IDs de risco, processo/atividade, perigo, fonte/circunstância, danos possíveis, grupos por função, exposição, medidas existentes, referências de evidência e estado da avaliação.
- Criado `examples/app/src/lib/pgr-risk-inventory.ts` com tipos e validação estrutural. Itens relatados ou em revisão podem permanecer incompletos; marcar avaliação como concluída exige método, decisão, responsável e data. Nenhuma classificação ou exame é inferido pelo sistema. No editor PostgreSQL, consulta manual opcional da Tabela 24 fica anexada ao risco com justificativa e snapshot; isso não determina aplicabilidade, não valida vigência e não gera evento.
- Testes focados cobrem item pendente, IDs duplicados, avaliação concluída sem autoria e grupos duplicados.
- Este contrato ainda não está conectado ao formulário/store PGR e não migra o texto livre nem altera rascunhos. A etapa seguinte exige decidir como preservar histórico/revisões na migração e aprovar explicitamente qualquer escrita em registros ativos.
- A prévia pura em `examples/app/src/lib/pgr-legacy-migration.ts` agora retém cada revisão e compara o estado atual com a última revisão; divergência gera snapshot adicional, sem editar a origem. Não segmenta nem reinterpreta texto livre: `items` permanece vazio. Os snapshots são validados pelo contrato. Testes focados combinados: 5/5; TypeScript e ESLint focado passaram.
- A função é apenas conversão em memória. Não foi criado comando de importação, não houve gravação em arquivo/banco e nenhum rascunho foi alterado. Antes de execução real ainda é necessário decidir identificadores estáveis, tratamento de registros legados incompletos/limites, relatório de reconciliação e rollback; depois obter aprovação explícita para a migração.
- Dry-run somente leitura sobre os rascunhos locais atuais: 3 de 3 prévias passaram a validação do contrato; 0 itens estruturados foram criados. Nenhum conteúdo individual foi impresso ou alterado.
- O contrato agora exige `tenantId`, além de empresa/unidade, para não perder o limite de isolamento do domínio. `analyzePgrMigration` fornece relatório sem conteúdo: totais, registro por índice e códigos de bloqueio/aviso. Duplicidade de origem usa a chave tenant + draft; a primeira ocorrência segue válida e as posteriores bloqueiam. Histórico ausente é aviso; conteúdo acima do limite, snapshot/revisão inválidos e estados não suportados bloqueiam.
- Pré-check atual read-only: 3 prontos, 0 bloqueados, 0 avisos. Suíte focada do inventário/conversor/pré-check: 7/7; TypeScript, ESLint e parse do schema passaram.
- Disponibilizado `pnpm pgr:migration:dry-run`, que lê somente `pgr-drafts.json` e `clients.json`, verifica vínculos de tenant/empresa/unidade e imprime hashes SHA-256, contagens e códigos sem conteúdo. A opção `--apply` é recusada; o script não conecta ao PostgreSQL nem grava arquivos. Execução confirmada: 3 prontos, 0 bloqueados, 0 avisos. Testes focados atualizados: 9/9; TypeScript e ESLint passaram.
- A prévia legada também preserva autoria, revisor, status, datas e histórico interno do draft, além dos snapshots textuais. A auditoria global é analisada separadamente. O último dry-run leu 68 eventos `pgr.*`: 68 sem `targetId`, 0 bloqueados. Isso permite planejar preservação append-only, mas impede associá-los a rascunhos sem evidência; não se inventa vínculo. O comando resume avisos por código, sem imprimir conteúdo ou IDs.
- Testes focados atuais: 11/11; TypeScript, ESLint e dry-run passaram. Rascunhos: 3 prontos, 0 bloqueados/avisos. Auditoria: 68 eventos preserváveis, 68 sem alvo, 0 bloqueados. Nenhuma gravação ou conexão com banco.

### Migration PostgreSQL preparada, não aplicada — 2026-10-12

- Criado `examples/app/db/migrations/0005_pgr_risk_inventory.sql` com tabelas para cabeçalho do inventário, itens atuais com IDs referenciáveis, snapshots versionados estruturados e auditoria PGR append-only. A origem legada textual e histórico interno ficam no `legacy_source` JSONB; revisões completas também preservam snapshots JSONB.
- Chaves compostas impedem cruzar tenant/empresa/unidade; criada chave única composta em `client_units` para suportar a FK completa. RLS está habilitada e forçada nas quatro tabelas. O runtime recebe grants sem DELETE; atualizações são limitadas por coluna para não alterar chaves/IDs nem `legacy_source`. Snapshots/auditoria rejeitam UPDATE/DELETE por trigger.
- Testes focados de contrato/conversão/auditoria/migration: 13/13; TypeScript, ESLint, parse do schema e dry-run passaram. O dry-run mantém 3 drafts prontos e detecta 68 eventos `pgr.*` sem target, 0 bloqueados.
- A migration não foi aplicada e não houve conexão/escrita no PostgreSQL. Atenção: o runner `db:migrate` aplica automaticamente qualquer migration pendente; não executá-lo para este PGR sem autorização explícita. O runtime continua no JSON, sem integração/cutover.
- A verificação SQL desta etapa foi estrutural/estática (padrões do arquivo e testes automatizados), não uma aplicação em PostgreSQL descartável. A aplicação da migration e prova transacional/RLS em banco ainda são pendências antes de considerar o domínio pronto para validação manual.
- Criada camada isolada `examples/app/src/lib/pgr-postgres-operations.ts` e wrappers autorizados em `pgr-postgres-store.ts`: listagem valida cabeçalho versus snapshot; escrita usa `FOR UPDATE` + revisão esperada; verifica unidade ativa; sincroniza itens por IDs persistidos; grava snapshot e auditoria na mesma transação; preserva `legacy_source` contra alteração do cliente; transições registram revisão e evento; conflito retorna sem gravar, e falha reverte a transação.
- A camada não está conectada às Server Actions nem ao modo de armazenamento; o runtime segue JSON. Testes simulados da camada, contrato, conversão, migration e formulário: 24/24; TypeScript e ESLint aprovados. O teste usa mock de `PoolClient`, não comprova execução real do PostgreSQL/RLS.

### Regras para futura importação e reversão (ainda não executadas)

- Idempotência do inventário legado: chave única composta `(tenantId, legacySource.draftId)`; empresa e unidade devem pertencer ao mesmo tenant e ser validadas na transação. IDs de riscos estruturados devem ser gerados uma vez na criação e persistidos, não derivados de texto mutável.
- Importação futura deve ser não destrutiva: snapshot/manifesto com hash da origem, escrita transacional em destino separado, sem apagar nem atualizar `pgr-drafts.json`; validar contagens, associação tenant/empresa/unidade e hash do conteúdo legado antes de qualquer ativação.
- Rollback antes de novas escritas no destino: interromper mutações, reverter seletor de leitura para JSON e verificar snapshot/hash da fonte. Se já houver novas edições no destino, não voltar silenciosamente ao JSON; reconciliar as escritas posteriores primeiro. O retorno/cutover exigirá aprovação própria.
- Essas são regras de desenho, não um importador/cutover. Nada foi escrito no PostgreSQL ou nos rascunhos durante esta etapa.

Não iniciar preenchimento técnico de riscos, definição de exames ou transmissão de eSocial por inferência automática. O projeto permanece local/fictício até aprovação específica para qualquer uso real ou integração externa.

## Reavaliação do fluxo integrado PGR → PCMSO e documentos correlatos — 2026-10-31

### Estado atual confirmado no código

- O PGR importado da EMA tem uma estrutura de trabalho editável para funções, riscos e ações, guardada em histórico separado do inventário PGR estruturado.
- Há um vínculo PCMSO → riscos de um inventário PGR **aprovado** (`PcmsoRiskLink`). Ele seleciona IDs e versão do inventário e exige revisão médica; a interface informa corretamente que a seleção não gera exames.
- Esse vínculo parcial não lê as revisões do PGR importado/editável da EMA. A tela de PCMSO ainda salva o plano como texto livre, e o ASO mantém exames com nome/data livres, sem vínculo aos riscos ou a uma versão de plano.
- Portanto, a próxima evolução exige aproximar os dois modelos de PGR de forma rastreável antes de gerar uma minuta. Uma versão editável ou extraída não pode ser apresentada como risco avaliado/aprovado.

### Separação necessária entre bases e entregáveis

- **NR-7 / PCMSO:** o programa parte dos riscos ocupacionais identificados e classificados no PGR. Deve descrever agravos possíveis e planejar exames clínicos e complementares conforme os riscos e os anexos da NR-7. A decisão e a revisão do planejamento pertencem ao médico responsável. O sistema pode preparar uma minuta rastreável, sinalizar lacunas e oferecer referências; não deve declarar exames necessários apenas pelo nome genérico de um risco.
- **eSocial:** o evento S-2240 registra condições ambientais e agentes nocivos da Tabela 24. O S-2220 registra monitoramento da saúde e procedimentos diagnósticos de acordo com a Tabela 27, além das informações do exame ocupacional. São usos diferentes: Tabela 24 não é um catálogo de exames nem determina, sozinha, qual exame pedir. As tabelas/leiautes precisam ser versionados; a consulta mais recente desta reavaliação localizou S-1.3 consolidada até NT 07/2026.
- **PPR:** documento/programa separado quando a avaliação indicar necessidade de proteção respiratória, vinculado ao agente, exposição e seleção/uso de respiradores; usar as recomendações oficiais da Fundacentro. Não gerar seleção de respirador somente pela descrição do perigo.
- **PCA:** programa associado à exposição ocupacional ao ruído e à vigilância auditiva. Deve se apoiar na caracterização e medição pertinentes, nas medidas de controle e no planejamento médico. Não inferir audiometria sem avaliar o agente, o contexto e a regra aplicável.
- **LTCAT/PPP:** finalidade previdenciária e prova de exposição efetiva, com responsabilidade técnica própria; não é sinônimo nem saída automática do PGR. O guia oficial de GRO/PGR do MTE esclarece que o PGR não substitui LTCAT/PPP.
- **Ergonomia:** organizar AEP e, quando uma das hipóteses da NR-17 ocorrer, AET. Resultados devem retroalimentar inventário e plano de ação; uma “seção ergonômica” não substitui observação e análise da atividade com participação dos trabalhadores.
- Outros relatórios (por exemplo, insalubridade/periculosidade e laudos técnicos específicos) devem ser classificados por finalidade e base normativa própria; não devem ser deduzidos como consequência automática de um PGR.

### Sequência de implementação proposta

1. Criar uma origem unificada e versionada do risco ocupacional por empresa/unidade que diferencie: extraído da fonte, alterado em rascunho, avaliado e aprovado. Preservar vínculo ao documento/página e à revisão vigente.
2. Construir a “minuta do PCMSO a partir do PGR”: agravos possíveis e referências por perigo/grupo exposto; exames clínicos ocupacionais e campos de planejamento; para complementares, sugestão apenas quando sustentada por regra identificável da NR-7 ou por decisão fundamentada do médico. Cada linha deve apontar para risco, grupo, fonte normativa, versão e estado de revisão.
3. Manter decisão médica explícita (indicado, não indicado, pendente, justificativa, periodicidade/momento, responsável e data) e travar a emissão da versão final até completar revisão. Não armazenar resultados clínicos no inventário de risco ou em visões administrativas.
4. Evoluir as associações manuais independentes e versionadas para referenciar riscos estruturados do PGR e procedimentos estruturados do PCMSO, depois que esses domínios existirem. A validação de código não estabelece vigência individual nem aplicabilidade; qualquer futura transmissão requer etapa própria, autorização e infraestrutura oficial.
5. Gerar PPR, PCA, LTCAT/PPP e ergonomia como entregáveis distintos, por critérios de aplicabilidade e dados de evidência próprios, com autor/revisor habilitado e referências explícitas. O PGR fornece entradas, mas não substitui esses trabalhos.
6. Só depois conectar o fluxo à EMA. O uso da EMA como exemplo não permite presumir trabalhadores, exames, medições, exposição efetiva, diagnóstico ou aprovação; dados ausentes devem virar pendências para coleta/revisão.

### Referências oficiais consultadas nesta reavaliação

- [Listagem oficial das Normas Regulamentadoras — MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/ctpp-nrs/normas-regulamentadoras-nrs): inclui o item NR-7. O endpoint individual anteriormente indicado retornou 404 durante a consulta de 2026-11-01; confirmar o texto, alterações, versão e vigência diretamente na publicação oficial antes de codificar critérios.
- [Manual WEB Geral do eSocial](https://www.gov.br/esocial/pt-br/empresas/manual-web-geral): descreve S-2220 e uso da Tabela 27 para procedimentos diagnósticos.
- [Leiautes e tabelas oficiais eSocial S-1.3, consolidados até NT 07/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-07-2026/tabelas.html/view): versão atual consultada, incluindo Tabela 24 (agentes nocivos) e Tabela 27 (procedimentos diagnósticos).
- [FAQ oficial GRO/PGR — MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/pgr/faq-perguntas-e-respostas-gro-e-pgr-da-nr-01.pdf): distingue a finalidade prevencionista do PGR da finalidade previdenciária do LTCAT/PPP.
- [NR-17 vigente — MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-17-nr-17/): AEP, condições para AET e integração dos resultados com PGR/plano de ação.
- [Programa de Proteção Respiratória — Fundacentro](https://www.gov.br/fundacentro/pt-br/comunicacao/noticias/noticias/2016/6/quarta-edicao-do-livro-programa-de-protecao-respiratoria-esta-disponivel-no-portal-da): referência para seleção, uso e treinamento de respiradores.

Esta reavaliação é de arquitetura e enquadramento do fluxo, não constitui PCMSO, indicação médica, mapeamento fechado dos riscos da EMA, LTCAT, AET, PPR/PCA ou declaração de conformidade. Nenhum cadastro foi alterado.

### Governança de elaboração e validação dos documentos — 2026-10-31

- O fluxo deve distinguir **preparação documental pela consultoria**, **responsável técnico/legal designado para o documento** e **ciência/decisões do empregador ou representante legal**. Esses papéis não devem ser resumidos em um único campo “revisor” ou em uma aprovação genérica.
- Para o **PCMSO**, o responsável médico designado valida tecnicamente o planejamento, os exames e as condutas. A assinatura do representante legal da empresa registra a ciência dos dados/compromissos organizacionais e não substitui a responsabilidade médica.
- Para o **PPR**, o PPR da Fundacentro prevê que a gerência designe um administrador do programa com conhecimentos de proteção respiratória e autoridade compatível. Não presumir que essa função é sempre do médico nem atribuir seleção de respiradores automaticamente.
- Para o **PCA**, tratar como programa multidisciplinar associado à exposição auditiva, controles e vigilância médica/audiológica; a NR-7 prevê participação do médico responsável pelo PCMSO na implantação/aprimoramento/controle quando aplicável. Não criar uma regra genérica de que só um profissional de saúde assina todo o PCA.
- Para **AEP/AET**, registrar quem conduziu a avaliação, método, participação dos trabalhadores, diagnóstico, recomendações e validação/revisão das intervenções, conforme NR-17. A norma descreve etapas e condições de realização, sem autorizar o sistema a inferir um signatário único para todos os casos.
- Para **LTCAT**, manter campo de responsabilidade técnica e qualificação próprios conforme legislação previdenciária; não usar o PGR como substituto.
- Requisitos futuros no sistema: tipo de documento, nome/qualificação/registro profissional e papel do responsável, base aplicável, versão validada, data/assinatura, estado de aprovação e registro separado da ciência/adoção pelo empregador. Gerar somente minuta enquanto a validação exigida estiver pendente.

Esta regra foi aplicada à minuta preliminar de PCMSO: identifica a consultoria como preparadora, deixa a validação médica obrigatoriamente pendente e diferencia a assinatura do representante legal como ciência/compromisso da organização. A minuta ainda é prévia de impressão e não é salva como versão oficial.

### Modelo comum de responsabilidade técnica e campos do PCMSO — 2026-10-31

- Criado `examples/app/src/lib/document-responsibility.ts` como catálogo de papéis para PGR, PCMSO, PPR, PCA, Ergonomia/AEP/AET e LTCAT. O catálogo fornece rótulos de responsabilidade e credenciais esperadas por tipo; não atribui uma pessoa real nem marca validação.
- `DocumentPrintTemplate` agora exige o tipo de documento e imprime preparação da consultoria, profissional/função responsável, credenciais, estado pendente, data da minuta e campo de assinatura conforme o perfil correspondente.
- Na prévia do PCMSO, nome médico, CRM/UF e representante da EMA podem ser preenchidos para identificação da minuta. A minuta permanece não validada e esses campos são temporários na tela; não registram assinatura digital, não gravam uma versão PCMSO e não mudam o estado de aprovação.
- A ciência do representante da empresa está separada da validação técnica. O responsável legal foi retirado dos campos da capa para evitar repetição; sua identificação aparece no bloco final de ciência.
- TypeScript e ESLint focado passaram. A prévia/PDF não foi inspecionada visualmente após esta alteração.

### Primeira minuta conectada à aba PCMSO da EMA — 2026-10-31

- Adicionado `examples/app/src/app/pgr-pcmso-draft.tsx` à aba PCMSO da ficha da empresa. A minuta usa o PGR importado da unidade e `workingDocumentItems`, portanto incorpora as revisões de risco salvas, além da extração de origem. O componente de acesso é renderizado apenas para perfis que já podem consultar o status de PCMSO e o PGR da empresa.
- O conteúdo mantém rastreio para ID/página/fonte, funções associadas quando disponíveis e quantitativos relatados. A EMA consultada possui 240 páginas, 13 funções, 153 registros extraídos de risco e 30 avaliações quantitativas. Essa contagem descreve a extração, não valida a exposição.
- Incluídos os cinco tipos de exames ocupacionais previstos na NR-7 e um quadro por risco para o médico responsável definir complementares, procedimento, periodicidade e fundamento. Nenhum exame complementar é indicado automaticamente. A menção à Tabela 24/S-2240 é separada da referência à Tabela 27/S-2220; o componente não cria código nem transmite evento.
- A minuta é somente prévia imprimível e não é salva como versão oficial do PCMSO. Permanecem pendentes integração ao histórico PCMSO, decisão médica estruturada e revisão clínica/documental. Não contém cadastro de trabalhadores nem dados clínicos. Não foram alterados registros existentes.
- TypeScript e ESLint focado passaram. Impressão não foi renderizada/validada visualmente no navegador nesta etapa; verificar diálogo, quebras e quantidade de páginas ao revisar no painel.

## Fontes oficiais consultadas

- [Documentação técnica do eSocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica/documentacao-tecnica/)
- [Leiautes e tabelas do eSocial S-1.3](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-cons-ate-nt-04-2025-rev-26-08-2025/tabelas.html/view)
- [Manual WEB Geral do eSocial](https://www.gov.br/esocial/pt-br/empresas/manual-web-geral/manual-web-geral/)
