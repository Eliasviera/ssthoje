# LMS integrado ao SST — caminho de implantação

**Status:** proposta futura; sem módulo, migrations, certificados ou conteúdo de curso implantados.  
**Revisão normativa inicial:** 2026-11-15.  
**Objetivo:** centralizar biblioteca didática, execução de capacitações, avaliações e registros de treinamento, conectando conclusões revisadas ao Passaporte Digital sem transformar automação em decisão profissional.

## Ajustes importantes à proposta inicial

O Anexo II da NR-01 exige, para EaD/semipresencial, estrutura pedagógica e operacional, material para o trabalhador, ambiente de aprendizagem apropriado, canal de dúvidas operacional durante a capacitação, avaliação adequada à estratégia e registros de realização, resultados e logs. O Projeto Pedagógico inclui objetivos, estratégia teórica/prática, responsáveis e instrutores, infraestrutura, conteúdo, objetivos por módulo, carga horária, dedicação diária mínima estimada, prazo máximo, público, materiais, instrumentos de aprendizagem e avaliação. Deve ser validado a cada dois anos ou quando houver mudança na NR. A avaliação digital requer identificação e senha individual, com rastreabilidade; a avaliação também deve contemplar situações práticas relacionadas à rotina. O histórico de logs tem retenção mínima de dois anos após o término da validade do curso. Ver itens 2.3–2.5, 3.1, 3.3, 4.2–4.7.1 e 5.1 do Anexo II e item 1.7.1.1 da NR-01.

Dois pontos da sugestão devem ser tratados como escolhas de produto, não como texto literal da norma:

- **Cronômetro/tempo por tela:** a NR-01 pede estimativa mínima de dedicação diária no projeto pedagógico e manutenção de logs de acesso; ela não determina um cronômetro de tela como prova suficiente de presença, dedicação ou aprendizagem. O sistema pode registrar eventos e tempos observados para rastreabilidade, informando suas limitações e sem aprovar por tempo isolado.
- **Verso do certificado:** o conteúdo programático deve constar do certificado, junto aos demais campos do item 1.7.1.1. Imprimir o conteúdo no verso é uma opção de layout, não uma exigência textual encontrada no item.

Também não se deve presumir que qualquer parte prática possa ocorrer a distância: a NR-01 permite modalidade EaD/semipresencial sob o Anexo II, mas a parte prática só pode ser EaD/semipresencial quando isso estiver previsto em NR específica. O produto deve parametrizar a modalidade e prática por curso e manter essa decisão sujeita à revisão profissional, em vez de liberar toda NR por uma regra global.

## Decisão de produto aprovada — avaliação em todos os treinamentos

Em 2026-11-15, o usuário aprovou que **todo treinamento tenha questões para responder**, tanto na modalidade presencial com profissional ministrando o conteúdo quanto na modalidade cursada pelo aplicativo.

- Cada versão de curso deve incluir avaliação vinculada aos objetivos de aprendizagem e ao conteúdo ministrado. O perfil/ rigor da avaliação é configurado por curso e modalidade, considerando a NR específica, o Projeto Pedagógico e validação profissional competente.
- A aplicação pode ser prova, questionário, caso prático ou combinação, conforme o treinamento. Em presencial, registrar avaliação e resultado junto à turma, aplicador e participante, com o registro de assinatura aplicável. No app, associar tentativa à conta individual autenticada, à versão exata do curso/prova e preservar rastreabilidade.
- Registrar resultado como satisfatório ou insatisfatório, política de tentativas/recuperação e revisão humana quando definida para o curso. Sorteio de questões é ferramenta de desenho da avaliação, não requisito universal nem substituto de cobertura dos objetivos.
- A avaliação não substitui explicação do profissional, prática/demonstração obrigatória nem requisitos específicos da NR. A conclusão/certificado aguarda todos os componentes aplicáveis e as revisões necessárias.

Esta decisão é regra de produto para o LMS; não define quantidade universal de questões, percentual de corte, número de tentativas, validade ou equivalência de modalidade. Esses parâmetros ficam por curso, com fonte, responsável e revisão.

## Arquitetura funcional proposta

### 1. Catálogo mestre e governança do curso

- Catálogo de cursos e trilhas com identificador estável, jurisdição, NRs/itens/referências e suas versões, público-alvo e pré-requisitos.
- Versões imutáveis do conteúdo: ementa, objetivos, conteúdo teórico/prático, módulos, material, carga horária por módulo, dedicação diária mínima estimada, prazo máximo de conclusão, avaliações e critérios satisfatório/insatisfatório.
- Projeto Pedagógico versionado, com campos do Anexo II e responsáveis: responsável técnico pela capacitação, instrutores quando aplicável, qualificação verificada, infraestrutura/canal de dúvidas, estratégia pedagógica e revisão periódica.
- Ativos didáticos em Object Storage por adapter S3-compatível; metadados, hash/checksum, tipo MIME, licença/origem, acessibilidade, versão e vínculo ao módulo no PostgreSQL. Não guardar vídeo/PDF grande como blob em tabelas.
- Ciclo de publicação: rascunho → revisão pedagógica/técnica humana → publicado → substituído/arquivado. Uma revisão normativa cria nova versão; não reescreve histórico ou material já atribuído.
- Curso inicial de teste deve ser conteúdo demonstrativo original e claramente fictício. NRs oficiais, cursos reais e material de terceiros só entram após revisão de conteúdo, direitos de uso e atribuição de responsável competente.

### 2. Oferta, matrícula e AVA

- Instância da capacitação fixa a versão exata do curso, empresa/unidade, turma, modalidade, datas, instrutores, responsáveis e eventuais atividades práticas presenciais.
- Matrícula vincula conta individual autenticada a um trabalhador do tenant por relação verificada; convites expiram/revogam e o escopo é conferido no servidor.
- Área do participante apresenta módulos e progresso, recursos acessíveis em celular, dúvidas/apoio e canais de interação síncrona ou assíncrona coerentes com o AVA.
- O fluxo organiza a sequência didática, mas não usa “ficar com a aba aberta” como único sinal. Registra login/logout, início/conclusão, eventos e versão do material para auditoria, respeitando minimização e retenção.
- Não contar o período de curso como simultâneo ao trabalho operacional; a organização deve proporcionar período dedicado e condições adequadas.

### 3. Avaliação e resultado

- Banco de questões por objetivo de aprendizagem, tema, dificuldade, versão e justificativa/referência, com revisão humana e trilha de alterações.
- Sorteio/embaralhamento é recurso pedagógico configurável, não regra universal. A matriz de avaliação deve cobrir objetivos e dificuldade; incluir cenários práticos e critérios validados, não apenas perguntas aleatórias de memorização.
- Tentativa guarda versão da prova, ordem/itens apresentados, respostas, data, identificação do participante, resultado satisfatório/insatisfatório, política de tentativas e revisão quando exigida.
- Avaliação digital exige identificação e senha individual; avaliação presencial precisa do registro de assinatura previsto. Registrar a modalidade realmente realizada.
- Curso misto mantém evidência de prática presencial conforme sua NR/projeto pedagógico: turma, instrutor/avaliador, data/local, atividade, resultado e evidência mínima autorizada. Não dar certificado apenas pela conclusão dos slides/prova teórica quando prática obrigatória está pendente.

### 4. Conclusão e certificado

- Máquina de estados auditável: matriculado → em andamento → avaliação pendente → prática pendente (se aplicável) → aguardando revisão → concluído ou não satisfatório → certificado emitido/cancelado/substituído.
- Emissão somente depois de validar a conclusão e os requisitos configurados; aprovação humana do responsável técnico é requisito da primeira versão.
- O certificado registra os campos mínimos do item 1.7.1.1 da NR-01: nome e assinatura do trabalhador, conteúdo programático, carga horária, data, local, nome/qualificação dos instrutores e assinatura do responsável técnico pelo treinamento. Campos condicionais e tipos de assinatura precisam de revisão normativa por modalidade e curso.
- Guardar versão exata do curso e do certificado, ator, data, método de assinatura, hash do documento e estado de revogação/substituição. Evitar selo ou afirmação automática de “conformidade garantida”.
- A retenção de logs deve respeitar no mínimo dois anos após o término da validade do curso; definir como calcular/registrar validade para cada curso e tratar cursos sem validade explícita por política aprovada, sem inventar prazo legal.

### 5. Integração ao Passaporte Digital

- Passaporte consome apenas conclusão/certificado emitido e validado: curso, versão, estado, data e validade quando definida. Estados “desconhecido”, “aguardando validação” e “pendente de prática” não viram confirmação de capacitação.
- Líder recebe somente o sinal mínimo necessário; histórico completo e documentos ficam por permissão. QR não transporta certificado, CPF, conteúdo clínico ou lista de cursos: contém identificador opaco, expiração e assinatura verificável server-side.
- Status no Passaporte informa origem, última sincronização e validade conhecida. Um certificado emitido para uma versão substituída não muda retroativamente.

## Modelo de dados a considerar (não é DDL)

`training_courses`, `training_course_versions`, `training_pedagogical_projects`, `training_modules`, `training_assets`, `training_objectives`, `training_assessment_blueprints`, `training_question_versions`, `training_offerings`, `training_enrollments`, `training_learning_events`, `training_attempts`, `training_practical_records`, `training_reviews`, `training_completions`, `training_certificates` e `training_audit_events`.

Todo registro operacional deve ter escopo tenant e, quando aplicável, empresa/unidade, curso/versão e trabalhador. Conteúdo publicado e eventos históricos são imutáveis por revisão; correções geram nova versão/evento. Definir RLS/consultas tenant-scoped, controle por ação, autorização server-side, idempotência, concorrência e auditoria antes de migration.

## Sequência de implantação e aceites

| Fase | Entrega | Aceite antes de avançar |
|---|---|---|
| 0 — Matriz normativa e pedagógica | Inventário por curso: NR/versão, tópicos, carga horária, modalidade, parte prática, responsáveis, certificado, prazo e retenção. | Profissional competente revisa a matriz e as fontes. Nenhuma regra normativa global inferida. |
| 1 — Protótipo fictício do AVA | Catálogo com curso demonstrativo original, Projeto Pedagógico fictício, módulos e revisão/publicação simuladas. | Separação de versões, rascunho/publicado e escopo de papéis ficam claros; sem certificado real. |
| 2 — Persistência e ativos | PostgreSQL tenant-scoped para catálogo, matrícula/eventos; Object Storage via adapter para arquivos versionados; backup, antivírus/validação MIME, limites e URLs temporárias. | Isolamento entre tenants, histórico e restore demonstrados com dados fictícios. |
| 3 — Turma online e interação | Login individual, módulos, canal de dúvidas, progresso sequencial, acessibilidade e logs; suporte operacional durante a turma. | Ensaio de jornada completa, trilha confiável e exportação do relatório de logs com retenção configurada. |
| 4 — Banco de questões | Blueprint, sorteio/ordem individual, tentativas, resultado e cenários práticos. | Prova cobriu os objetivos da versão e a identidade/rastreabilidade foi revisada; não houve aprovação baseada apenas em tempo de tela. |
| 5 — Prática, revisão e certificado | Registro de componente presencial/prático, revisão humana, certificado versionado e revogação/substituição. | Todos os campos exigidos do certificado e condições de conclusão conferidos para o curso piloto. |
| 6 — Piloto interno fictício | Curso demonstrativo com colaboradores fictícios, cenários de falha, reabertura, troca de versão, expiração e auditoria. | Testes funcionais, segurança/isolamento e revisão profissional documentados; sem valor de habilitação real. |
| 7 — Piloto controlado com cliente | Homologação com conteúdo, responsáveis, prazos e autorizações do cliente, depois de infraestrutura/privacidade aprovadas. | Aceites documentados por cliente e profissionais competentes antes de emitir certificados válidos. |
| 8 — Offline, fase futura | Pacote didático versionado, download e sincronização idempotente; inicialmente estudo e progresso provisório. | Identidade offline, integridade de pacote/eventos, relógio, conflitos, replay, perda do dispositivo e auditoria testados. Só habilitar avaliação/certificação offline após validação técnica e profissional específica. |

## Segurança, privacidade e limites

- Não capturar selfie/biometria como identidade no MVP. Para avaliações digitais, usar conta individual e autenticação adequada, com recuperação e suspensão/revogação.
- Separar conteúdo do curso de dados do trabalhador; não incluir dados clínicos em relatório, offline package ou QR.
- Registrar logs minimizados (ator/identificador, curso e versão, evento, instante, resultado e origem do dispositivo conforme necessário), protegidos contra edição e acesso indevido; suportar retenção e exportação controladas.
- Pacote offline não é fonte atual de validade nem prova inviolável: manter carimbo “última sincronização”; eventos locais são provisórios até validação do servidor e conflitos devem ser auditados.
- Armazenar somente material autorizado/licenciado; verificar upload, tipo, tamanho, malware, checksum, versão e direitos de uso.
- Instrutores, responsável técnico, requisitos práticos e conteúdo exigem revisão competente. O LMS organiza evidências; não substitui empregador, profissional habilitado, instrutor ou responsável técnico.

## Referências oficiais iniciais

- [Página oficial do MTE — NR-1 vigente e versões de vigência](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-1). Na consulta de 2026-11-15, a página indicava a redação com vigência em 26/05/2026.
- [Texto oficial da NR-01 — PDF do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-01-atualizada-2024-i.pdf). Referências conferidas: 1.7.1.1, 1.7.9 e Anexo II, itens 2.3–2.5, 3.1, 3.3, 4.1–4.7.1 e 5.1. Conferir novamente a publicação vigente antes de cada curso e implantação; o texto do site informa que não substitui o DOU.

**Próximo passo recomendado:** iniciar a Fase 0 com uma matriz de requisitos por curso e escolher um único curso demonstrativo, original e sem valor de certificação. Somente após validação dessa matriz criar telas de administração/AVA com conteúdo fictício.

## Protótipo funcional de avaliação — 2026-11-15

Implementada a rota autenticada `/treinamentos-demo`, disponível para as contas internas fictícias de trabalhador, campo, SST e administração, ligada pelo protótipo `/passaporte-demo`.

- Curso original e fictício com dois módulos apresentados em sequência e cinco questões no banco demonstrativo. Para cada tentativa, três questões e a ordem das alternativas são sorteadas.
- Modalidade pelo app exige marcar os módulos como percorridos antes da prova. Não mede tempo em tela.
- Modalidade presencial exige selecionar participante e facilitador fictícios e marcar que o conteúdo foi ministrado na simulação antes de iniciar a mesma avaliação.
- Resultado satisfatório/insatisfatório usa critério local demonstrativo de 2/3, claramente sem valor normativo. O detalhe da tentativa mostra modalidade, versão, participante/aplicador, local fictício, datas e acertos.
- Estado somente na memória do navegador. A tentativa desaparece ao sair; não grava no servidor, não registra assinatura real, qualificação de instrutor, presença real ou prática, e não emite certificado nem atualiza Passaporte.
- TypeScript (`tsc --noEmit --incremental false`) e ESLint focalizado passaram. Não houve teste visual em navegador nesta implementação.

Esta fatia valida a experiência de avaliação nas duas modalidades com dados sintéticos. Para avançar a Fase 2, permanecem necessários: matriz de curso aprovada por profissional competente, gestão de versão/Projeto Pedagógico, identidade e persistência server-side, trilha imutável e revisão da regra de retenção. Não é uma capacitação válida nem substitui avaliação profissional.

## Regra de assinaturas e gate de nota — 2026-11-15

O usuário definiu que a lista de presença será assinada digitalmente e que as assinaturas correspondentes devem compor o certificado, junto às assinaturas do(s) instrutor(es). O resultado fica pendente até a avaliação; nota abaixo do critério impede finalizar o processo e emitir certificado.

- Presencial: registrar assinatura individual de cada participante e assinatura do instrutor na lista/turma. Para cada certificado individual, vincular a assinatura daquele aluno e as assinaturas dos instrutores/responsáveis aplicáveis, mantendo referência à lista original. Não copiar assinatura de colega ou criar certificado para toda turma com uma única nota.
- App: o participante responde à avaliação autenticada individualmente; certificado só pode avançar depois de resultado satisfatório e das assinaturas necessárias do aluno e instrutor/responsável.
- Resultado insuficiente mantém estado não satisfatório/pendente de nova tentativa conforme política do curso. Não há certificado final, atualização de habilitação ou QR de aptidão neste estado.
- Nota satisfatória é condição necessária, não suficiente: prática obrigatória, revisão profissional, identificação/autenticação e demais requisitos do curso precisam estar completos antes da emissão real.
- Se instrutor e responsável técnico pelo treinamento forem pessoas diferentes, devem ser registrados os papéis/assinaturas exigidos para o curso, sem presumir que uma função substitui a outra.
- Preservar assinatura original, ator, papel, data, turma/curso-versão, prova-tentativa e certificado relacionado; correção/substituição gera novo registro auditável.

**Protótipo atualizado:** assinatura desenhada simples do participante e instrutor fictícios na lista presencial; aprovação permite finalizar uma prévia sem validade que exibe ambas. No app, assinaturas demonstrativas são coletadas após resultado satisfatório. Nota insuficiente bloqueia a prévia. O protótipo presencial tem só um aluno sintético; não representa lista real com vários trabalhadores. Nenhuma assinatura é persistida nem usada para comprovar identidade.

## Gate de emissão coberto por testes fictícios — 2026-11-15

A regra de transição foi extraída para `examples/app/src/lib/training-demo-workflow.ts` e verificada em cinco testes: nota pendente, nota insuficiente mesmo com assinaturas completas, nota suficiente ainda aguardando assinatura, liberação da prévia só com nota e assinaturas, e seleção do conjunto correto de assinaturas em cada modalidade. Resultado: 5/5 passaram; TypeScript (`tsc --noEmit --incremental false`) e ESLint focalizado passaram.

### Por que ainda não persistir tentativas/assinaturas no banco

Inspeção do runtime confirma que a sessão usa contas demo assinadas, mas o vínculo de membership é mantido em fixtures estáticas (`tenant-access.ts`) e não tem identidade de trabalhador associada. A tabela PostgreSQL `sst.tenant_memberships` (migration `0001`) não inclui os papéis `trabalhador` ou `campo`; o cadastro de trabalhadores continua em `worker-store.ts`/JSON e não existe raiz relacional `sst.workers`. Portanto uma tentativa/certificado persistido hoje não teria chave estrangeira autoritativa para o participante real. Gravar imagem de assinatura em JSON local também não é um caminho adequado para assinatura de produção.

Próxima sequência antes da persistência LMS: (1) identidade/membership server-side para trabalhadores; (2) trabalhador relacional com vínculo único e auditado à identidade; (3) turma/matrícula e participante de turma com FK tenant-scoped; (4) tentativa, assinaturas individuais e conclusão append-only no PostgreSQL; (5) emissão/revogação do certificado apenas após gate transacional revalidar nota, assinaturas e prática/revisão exigidas. Até lá, protótipo segue só em memória com identidades/assinaturas sintéticas; não foi criada migration.

## Base candidata de vínculo de identidade do trabalhador — 2026-11-15

Preparado `schemas/tenant-worker-identity-link-candidate.sql` como DDL candidato, dependente dos schemas candidatos de identidade, autoridade e trabalhadores. Define convites com hash de token, histórico de vínculos com índices parciais para permitir nova tentativa após rejeição/revogação sem duplicar vínculo ativo, RLS por tenant, funções restritas para convidar, aceitar, revisar, revogar e consultar somente o próprio resumo, e eventos append-only.

- Aceitar convite exige sessão com tenant e usuário, conta ativa e e-mail correspondente; isso **não comprova identidade legal**. O vínculo nasce `pending_review`, sem habilitar leitura do passaporte. Somente revisão humana independente com referência de verificação pode ativá-lo; aprovação pelo próprio titular é recusada.
- Convite, vínculo e leitura passam por funções com execução concedida a um papel candidato; tabelas não recebem grants diretos para o papel de aplicação. Revogação fica auditada e impede consulta pessoal.
- O candidato não foi aplicado em PostgreSQL, ligado ao login, integrado ao JSON/runtime, nem usado para assinatura, certificado, aptidão ou envio governamental. Dependências também são candidatas e precisam de ensaio descartável e revisão de segurança antes de qualquer migration.
- Trabalhador candidato ainda não contém evidência validada de ASO/NR; a consulta retorna somente identificação funcional mínima. O Passaporte completo, QR assinado, autenticação real e sincronização offline continuam fora desta fatia.

**Próximo aceite técnico:** revisar e provar em PostgreSQL descartável a ordem das dependências, políticas RLS, privilégios do dono das funções `SECURITY DEFINER`, cenários de convite de outro tenant, tentativa de autoaprovação, revogação e consulta por conta alheia. Só depois desenhar integração ao runtime e fluxo de verificação de identidade aprovado pelo cliente.
## Roteiro executável de prova isolada — 2026-11-15

Adicionado `examples/app/scripts/verify-tenant-worker-identity-link-candidate.mjs` e o comando `npm run tenant:worker-identity:verify-isolated`. A prova cria somente um container PostgreSQL temporário sem volume, usa fixtures sintéticas e remove o container ao final; cobre convite/aceite, e-mail divergente, tenant cruzado, estado pendente, autoaprovação, aprovação independente, resumo próprio, revogação, reconvite após revogar/rejeitar, histórico, RLS e negação de DML direto.

- `node --check scripts/verify-tenant-worker-identity-link-candidate.mjs`: passou.
- `npm run tenant:worker-identity:verify-isolated`: não chegou a criar banco; o Docker API respondeu `permission denied` ao conectar ao Docker Desktop. Nenhuma instância persistente foi usada ou alterada. DDL continua sem prova de execução.
- O verificador está preparado, mas não comprovado. Reexecutar quando o Docker Engine estiver acessível; revisar também privilégios do dono das funções `SECURITY DEFINER` e RLS usando uma role não superusuária.
- A integração de login segue bloqueada por arquitetura: a sessão atual exige membership e a tabela legada não contempla o papel de trabalhador. O fluxo real precisa permitir autenticação global de conta convidada e contexto seguro para aceitar o convite sem conceder membership operacional nem acesso antes da revisão humana.
### Fechamento de estados de convite e suspensão — 2026-11-15

O DDL candidato foi ampliado para cancelar convites pendentes com justificativa/auditoria, marcar e registrar convites vencidos ao solicitar uma nova tentativa, e permitir novo convite após revogação/rejeição sem apagar o histórico. Aceite e revisão exigem tenant ativo; revisão ainda exige perfil de autoridade ativo. Consulta própria é negada quando o tenant está suspenso. Revogação do vínculo segue disponível ao administrador ativo para permitir encerramento de acesso.

O roteiro isolado agora inclui estes cenários, além da imutabilidade real do trigger de eventos. Ele permanece sem prova PostgreSQL: Docker Desktop e o contexto `default` responderam `permission denied`; `psql`, `postgres`, `pg_ctl`, Podman e Nerdctl não estão disponíveis localmente. O comando abortou antes de criar container ou abrir conexão. `node --check` e validação do JSON do package passaram. A execução em PostgreSQL descartável continua sendo critério obrigatório antes de considerar o DDL validado.
### Revisão final de estados e gates — 2026-11-15

A revisão adicionou ao candidato: cancelamento explícito de convite pendente; expiração auditada que libera novo convite; verificação de tenant ativo para aceite, aprovação e leitura do resumo; verificação de perfil de autoridade ativo antes de aprovar; validação explícita de decisão booleana nula; e remoção do e-mail do snapshot do evento (continua somente no registro do convite). A revogação de vínculo continua autorizada mesmo com tenant suspenso para permitir corte de acesso.

O verificador foi ampliado para cobrir cancelamento, expiração/novo convite, tentativas com tenant/autoridade suspensos, decisão nula e trigger append-only. `node --check` e leitura do `package.json` passaram. O Docker Desktop foi aberto e saiu de Resource Saver para “Engine running”, mas o comando npm continuou bloqueado antes do container com `permission denied` em `npipe://./pipe/dockerDesktopLinuxEngine`; os contextos `desktop-linux` e `default` também negam acesso. Nenhum PostgreSQL foi iniciado ou consultado. O impedimento é a permissão do ambiente Codex para acessar o named pipe, não o estado parado do Engine. A validação de DDL em PostgreSQL descartável permanece pendente e impede integração ao login.
### Ajuste do banco descartável do verificador — 2026-11-15

Na execução feita pelo usuário em PowerShell, o Docker iniciou o PostgreSQL temporário e a aplicação das migrations começou, mas a migration 0001 falhou porque o roteiro criava `sst_hoje_verify` enquanto ela concede conexão a `sst_hoje_dev`. Corrigidos o `POSTGRES_DB` e o nome usado pelo pool para `sst_hoje_dev`, dentro do container efêmero. `node --check` passou após o ajuste. A prova deve ser reexecutada; o primeiro container foi removido pelo `finally` do roteiro e nenhum banco persistente foi usado.
### Diagnóstico de sintaxe SQL no ensaio do usuário — 2026-11-15

Após corrigir o nome do database, a execução do usuário avançou até `apply prerequisite and candidate schemas` e recebeu PostgreSQL `42601` (syntax error near `;`). O verificador foi ajustado para mostrar o schema/migration exato, a posição retornada pelo servidor e um trecho curto de SQL; `node --check` passou. A execução ainda não foi aprovada. Reexecutar `npm run tenant:worker-identity:verify-isolated` e corrigir o arquivo apontado; o container continua sendo efêmero e o tratamento `finally` remove-o após falha.
### Correção do erro 42601 no DDL de vínculo — 2026-11-15

A saída do usuário apontou `schemas/tenant-worker-identity-link-candidate.sql`, posição 3640, no fechamento do `CHECK` da tabela `links`. Faltava um parêntese para fechar o `CREATE TABLE` externo após o constraint. Corrigido para fechar constraint e tabela separadamente. O verificador agora também calcula linha aproximada a partir da posição do PostgreSQL. `node --check` passou após a alteração. Reexecutar a prova isolada para avançar ao próximo erro ou confirmar aplicação dos schemas.
### Prova PostgreSQL descartável aprovada — 2026-11-15

O usuário executou `npm run tenant:worker-identity:verify-isolated` em PowerShell e informou aprovação. Foram confirmados convite/aceite, tenant e e-mail corretos, revisão independente, bloqueio de autoaprovação, leitura do próprio resumo, revogação, reconvite/histórico, RLS e negação de DML direto. A prova usa container temporário sem volume; nenhum banco persistente foi utilizado. Esta aprovação valida somente os schemas candidatos e os cenários sintéticos, não o login/runtime nem o Passaporte em produção.

**Próxima lacuna para portal do trabalhador:** o convite atual exige uma conta já existente; o cadastro/login do runtime só reconhece contas de demonstração/avaliação e memberships, e o papel trabalhador não existe na membership legada. Projetar e provar registro da conta pelo convite de trabalhador e autenticação de portal sem conceder membership operacional ou acesso ao Passaporte antes de revisão humana. Depois, integrar a leitura pessoal e só então persistir as etapas LMS.
### Cadastro de conta nova por convite de trabalhador — candidata, em prova

Adicionada `register_worker_from_invitation` ao schema candidato. Com token de convite, tenant ativo, e-mail correspondente e hash scrypt válido, cria a conta global, consome o convite e cria vínculo `pending_review` na mesma transação. Não cria `sst.tenant_memberships`; o resumo pessoal continua vazio até revisão independente. Hash e token em claro não são persistidos. O cadastro exige perfis ativos de identidade/autoridade e trabalhador ativo.

O verificador testa e-mail errado, criação da conta sem membership, lookup de login pelo papel candidato e bloqueio do Passaporte até aprovação. O usuário executou o comando e reportou aprovação, incluindo explicitamente o cenário de cadastro de conta sem membership operacional. Isso valida essa versão candidata com dados sintéticos; `node --check` também passou. O runtime não foi conectado: `loginAction` autentica apenas contas demo/teste e `getSession` rejeita contas PostgreSQL sem identidade integrada. Portanto a conta criada no candidato ainda não permite login no app; autenticação DB com rate limit, sessão revalidada, contexto tenant seguro e rota pessoal continuam pendentes.
### Consulta dos vínculos próprios para futura tela de entrada — candidata, em prova

Adicionada `list_my_worker_links`, que devolve apenas tenant, trabalhador, estado e data dos vínculos pendentes/ativos da própria conta; não lê dados do cadastro nem habilitações e não requer membership operacional. A política RLS da tabela de vínculos permite que a função veja os próprios vínculos entre tenants; a aplicação não ganhou SELECT direto. `read_own_worker` continua limitado ao tenant assinado e ao vínculo aprovado.

O verificador inclui leitura da lista em estado pendente e ativo, inclusive quando a sessão está no contexto de outro tenant. `node --check` e JSON do package passaram. Esta alteração é posterior à prova reportada pelo usuário e requer nova execução PostgreSQL descartável.