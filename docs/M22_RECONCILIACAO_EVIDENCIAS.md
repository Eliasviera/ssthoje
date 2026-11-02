# M22 — reconciliação de evidências e limites do manifesto

2026-10-18. Revisão estática do modelo candidato contra os repositórios locais; nenhum arquivo de dados de usuários foi lido ou alterado.

## Fontes observadas no app

- `document-store.ts` persiste metadados em `data/documents.json` e PDFs em arquivos locais. Cada documento tem `id`, tenant, empresa/unidade, versão e histórico de eventos; não há digest persistido no objeto mostrado. São referências úteis para operação atual e snapshot, mas não FKs PostgreSQL nem extração bloqueada/transacional.
- `compliance-store.ts` persiste regras e avaliações em `data/compliance.json`. Avaliação guarda IDs e snapshots da regra/documento e autor humano, porém escrita em arquivo substituído atomicamente não é transação comum com documentos, política e caso.
- `third-party-store.ts` lê convites, avaliações, requisitos e pendências de stores JSON e calcula fingerprint SHA-256 de snapshots. Esse fingerprint indica igualdade do objeto serializado lido, não prova origem PostgreSQL, bloqueio concorrente nem identidade da entidade por FK.
- `third-party-source-readiness.mjs` é somente um gate candidato: aceita marcadores que declaram `storage: postgres`, `authoritative: true`, `locked: true` e IDs de transação iguais. O helper não abre conexão, inicia transação, bloqueia linha, consulta tabelas nem autentica o emissor desses marcadores.
- `third-party-analysis-sources.mjs` valida formato/escopo e recalcula hash canônico do manifesto. Hash válido prova integridade do conteúdo recebido em memória, não que os IDs/revisões existam ou correspondam aos registros autoritativos.

## Conclusão de compatibilidade

O manifesto v2 e o gate de readiness descrevem o contrato desejado para uma futura leitura no servidor, mas não convertem as stores JSON atuais em fonte autoritativa. Nenhuma chamada encontrada liga `compileTransactionalAnalysisManifest` a um repositório PostgreSQL real. Não preencher as fontes com marcadores fabricados nem classificar uma avaliação como atual/completa para decisão transacional com base apenas no JSON e em seu fingerprint.

## Caminho de integração

1. Implementar repositório transacional server-side para documentos/metadados, critérios, avaliações, políticas e pendências, com tenant/empresa/unidade/caso e FKs compostas. Preservar o armazenamento físico do PDF separado do registro relacional e nunca expor caminho/bytes desnecessários.
2. Em uma transação real, derivar o usuário autenticado no servidor, resolver caso e escopo, bloquear as linhas de versões/estado relevantes e buscar referências diretamente nas tabelas; montar os cinco grupos a partir desses resultados.
3. Cada fonte precisa de ID estável, revisão imutável e digest calculado/verificado sobre bytes ou snapshot canônico definido pelo domínio. Resolver a relação fonte→requisito explicitamente; digest agregado do caso não prova cobertura de cada item.
4. O servidor cria `transactionId` interno e emite o manifesto dentro do fluxo transacional. Não confiar em `transactionId`, digest, `authoritative`, `locked` ou escopo enviados pelo navegador.
5. A função de avaliação confere cobertura exata dos requisitos aplicáveis e estado vigente no commit. A decisão relê e compara manifesto/política/avaliação na mesma transação; divergência exige recompilação e reavaliação.
6. Até essa integração existir, JSON e snapshots permanecem legado de leitura/associação. Importação exige mapeamento explícito e reconciliação por usuário quando IDs/casos coincidirem; não mesclar automaticamente por nome, CNPJ, ordem ou texto de pendência.

## Estado e impacto

Este achado mantém a decisão operacional anterior: política versionada candidata fica fora do cutover; o runtime continua dependendo dos JSON existentes. O manifesto não deve ser promovido a prova de prontidão até que os marcadores venham do repositório transacional real. Sem mudança de código, migration, teste, SQL, runtime ou banco ativo nesta revisão.

## Continuação candidata — evidência da contratada por escopo (2026-10-19)

O desenho `schemas/third-party-evidence-candidate.sql` propõe séries/versionamentos para documentos empresariais não médicos e uma revisão de aplicabilidade associada ao caso e à unidade do cliente. `schemas/third-party-workforce-candidate.sql` pode referenciar a versão de registro empresarial usada na confirmação do contexto MEI. Essa relação é estrutural candidata; não valida conteúdo nem atualiza cadastro por OCR.

Os recibos atuais continuam embutidos no convite JSON, enquanto o PostgreSQL possui somente snapshots de leitura. Não existe chave estrangeira entre esses recibos/snapshots e a nova entidade operacional. Importação futura exige associação explícita com recusa em caso de ambiguidade; CNPJ, nome, categoria, escopo textual, digest isolado ou ordem não são prova suficiente. Documentos empresariais podem ser associados a vários casos após revisão de aplicabilidade por caso. ASO e documentos individualizados de trabalhadores permanecem fora desse modelo e dependem de domínio separado com controle médico.

Os arquivos SQL continuam candidatos: sem parse/prova PostgreSQL, migration, runtime, importação ou alteração de dados nesta continuação.

## Contrato de reconciliação assistida dos recibos legados

O `third-party-store.ts` fornece identificadores úteis para uma reconciliação futura: `invitation.id`, `receipt.id`, categoria, digest dos bytes, horário, `replacesReceiptId`, nome/CNPJ declarados e IDs de empresa/unidade. Esses valores continuam pertencendo ao store JSON; nenhum deles é FK para `third_party_cases` ou `document_versions`. O `receipt.id` pode ser preservado como referência de origem opaca, sem promovê-lo a identidade do documento relacional.

Uma futura importação deverá produzir um registro de reconciliação com estado explícito — `pending`, `matched`, `ambiguous`, `rejected` ou `unavailable` — e trilha do ator, data, origem e justificativa. Só `matched`, após confirmação humana, pode apontar para uma série/caso/versionamento. `ambiguous` e `unavailable` não entram em avaliações atuais; o relatório deve mostrar que falta conciliar. `rejected` preserva a decisão e a razão, sem remover o recibo legado.

Regras da associação:

- A origem é identificada por `(legacy_store, tenant_id, invitation_id, receipt_id)` e protegida contra importar o mesmo recibo duas vezes.
- `replacesReceiptId` é evidência para reconstruir a cadeia de versões, mas cada elo é validado: categoria/contratada/escopo coerentes, digest e bytes existentes, e sem bifurcação ou ciclo. Cadeia quebrada fica para reconciliação humana.
- Empresa, unidade e CNPJ podem reduzir a lista de candidatos; não autorizam associação automática. CNPJ normalizado não substitui a confirmação do terceiro e do caso.
- A pessoa revisora seleciona terceiro e caso persistentes; o sistema registra o vínculo decidido e mantém IDs/digest/horário legados como proveniência. Caso não exista, ele deve ser criado pelo fluxo de cadastro antes de associar o arquivo.
- Um convite legado pode ser associado a um caso somente após confirmação; convites distintos podem convergir ao mesmo caso, mas isso não deve ser inferido apenas porque seus campos textuais coincidem.
- Versões já recebidas, análises e relatórios históricos permanecem consultáveis na origem. Uma versão legada não se torna vigente até verificar existência e hash dos bytes e resolver a ordem/substituição.
- Arquivo ausente, hash divergente, inquilino inconsistente ou metadado inválido interrompe associação e importação desse recibo; não se cria `document_version` sem bytes verificáveis.

### Identidade e numeração de versão

No store legado, `getThirdPartyDocumentForReview` calcula `documentVersion` como `sameKind.length`: a quantidade de recibos da mesma categoria dentro do agrupamento legado (CNPJ/escopo normalizados, ou convite quando não há escopo). É um ordinal derivado para exibição/revisão, não um identificador persistente nem uma revisão confiável. Inclusão, correção do agrupamento ou recibos duplicados podem alterar essa contagem. Não copiar esse número para `document_versions.revision`.

No modelo candidato, `revision` é sequencial dentro de `document_series`, com unicidade `(tenant_id, series_id, revision)` e cadeia explícita `replaces_version_id`. A série e a revisão só podem ser determinadas depois da confirmação humana do terceiro, categoria e bytes; revisão 1 não tem substituta e revisões posteriores apontam para a anterior da mesma série. O identificador de origem a preservar é `(legacy_store, tenant_id, invitation_id, receipt_id)`, junto ao digest/tamanho/horário observados. `replacesReceiptId` é uma pista de proveniência que exige validar a cadeia; não deve ser copiado diretamente para `replaces_version_id`. Digest igual ajuda a confirmar bytes, mas não identifica por si só documento, série ou caso.

Isso é um contrato de migração futura, não funcionalidade da tela atual. Ainda falta representar a identidade opaca da origem e sua resolução no desenho relacional integral; não adicionar coluna isolada ao schema de evidências antes de decidir como esse ledger se relaciona com os stores JSON e com o armazenamento privado.

## Efeito dos estados no fluxo

| Estado | Pode compor análise atual? | Ação registrada |
|---|---:|---|
| `pending` | Não | Aguardar associação explícita por pessoa revisora. |
| `matched` | Só se o vínculo estiver confirmado, os bytes/hash conferirem e a versão for atual e aplicável ao caso | Preservar quem associou, quando, origem e justificativa; avaliação técnica segue etapa independente. |
| `ambiguous` | Não | Resolver candidatos manualmente ou manter sem associação; não escolher por similaridade. |
| `rejected` | Não | Preservar recibo e razão; associação recusada não apaga o histórico. |
| `unavailable` | Não | Arquivo inacessível/ausente ou hash inconsistente; recuperar/verificar origem antes de nova tentativa. |

Quando uma nova versão for recebida em série já reconciliada, a operação futura precisa bloquear a série, verificar a versão anterior, gravar a nova versão e marcar revisão de aplicabilidade para reavaliação atomicamente. Avaliações e relatórios existentes continuam ligados às versões antigas, mas não representam análise atual até revisão. O envio do arquivo, por si só, nunca significa aplicabilidade ou conformidade.

## Ledger relacional candidato

Criado `schemas/third-party-legacy-reconciliation-candidate.sql`; o schema foi aplicado e exercitado no PostgreSQL 17 descartável da Etapa A, sem aplicação a banco ativo. `legacy_receipts` preserva a chave idempotente `(tenant_id, source_store, invitation_id, receipt_id)`, categoria original, digest, tamanho e horário, sem copiar bytes nem armazenar caminho local. `reconciliation_events` é append-only e registra revisões com ator, razão e, somente em `matched`, terceiro/caso/série/versão alvo por FKs compostas.

O ledger não converte todas as categorias do portal em documentos empresariais: só PGR/PCMSO/LTCAT podem ser mapeados para categorias equivalentes; `Outro` só pode apontar a `OTHER`. Ficha de EPI, Treinamento e O.S. permanecem sem alvo neste schema e requerem domínio/requisito apropriado. ASO não é uma categoria permitida. Uma associação `matched` prova apenas qual recebimento legado foi relacionado ao objeto; não declara aplicabilidade ao escopo nem conformidade. Estas continuam revisões separadas.

O schema evita grants diretos. Funções confiáveis ainda precisam validar bytes no armazenamento privado, origem do tenant/convite, transições e sequência de revisões, cadeia de substituição sem ciclo/bifurcação, resolução de conflitos e reabertura da aplicabilidade ao substituir versão. As FKs garantem consistência dos IDs, mas não provam que o arquivo atual é o recebido na origem. A Etapa A da prova PostgreSQL descartável passou; a Etapa B permanece pendente de funções confiáveis, adapter de storage e identidade/membership autoritativos.

### Limite do snapshot de origem

O ledger identifica o recibo por store/tenant/convite/recibo e fixa categoria, nome de arquivo, digest, tamanho, horário e recibo predecessor. Ele não captura um snapshot dos campos do convite usados na revisão: `companyId`, `unitId`, `contractorCnpj`, escopo textual (inclusive ausência), categorias solicitadas e nomes declarados. O evento `pending` também não carrega contexto do convite. Consultar o JSON pelo ID pode apoiar a revisão enquanto a origem estiver disponível, mas não torna esse contexto imutável nem auditável pelo ledger sozinho.

Antes de uma importação manual futura, a operação deverá verificar o convite e o recibo no tenant correto e preservar, de forma imutável e com minimização de dados, os campos necessários à decisão e à auditoria: IDs declarados de empresa/unidade, CNPJ da contratada, escopo original ou sua ausência, categoria solicitada/recebida e IDs da cadeia de correção relevantes. Deve registrar a procedência e o momento da captura; nomes podem ser omitidos se IDs e CNPJ bastarem. Se a origem não estiver disponível ou os campos não puderem ser conferidos, manter `unavailable`/`ambiguous`, sem completar dados por inferência. A estrutura e proteção desse snapshot ainda precisam ser decididas antes de ampliar o SQL candidato.

### Transições permitidas a validar no serviço

| Estado anterior | Próximo estado permitido | Condição mínima |
|---|---|---|
| inexistente | `pending` | recibo e bytes da origem identificados; chave de origem ainda não importada. |
| `pending` | `matched` | hash/tamanho conferidos, alvo exato confirmado e motivo registrado. |
| `pending` | `ambiguous` | dois ou mais alvos possíveis; registrar motivo sem escolher um. |
| `pending` | `rejected` | pessoa revisora registra razão para não importar/associar. |
| `pending` | `unavailable` | origem ou bytes não podem ser verificados. |
| `ambiguous` | `matched` / `rejected` / `unavailable` | revisão resolve com evidência, recusa ou registra indisponibilidade. |
| `unavailable` | `pending` | nova tentativa após recuperar acesso; mantém a indisponibilidade anterior no histórico. |
| `matched` | `reopened` | conflito material posterior ou necessidade de refazer o vínculo; invalidar uso atual antes de nova revisão. |
| `reopened` | `matched` / `ambiguous` / `rejected` / `unavailable` | nova revisão com motivo e ator. |
| `rejected` | — | terminal nesta série de revisão; corrigir erro exige fluxo explícito de reabertura futura, sem apagar a recusa. |

O schema grava eventos e impede update/delete, mas não impõe por si só transições válidas, revisão consecutiva nem unicidade do evento corrente. A função confiável deverá obter lock por recibo, ler o último evento, validar a transição e gravar o próximo evento na mesma transação. Se `source_replaces_receipt_id` não resolver unicamente para recibo do mesmo tenant/store, a cadeia fica ambígua e nenhuma sequência de versões pode ser criada automaticamente.

### Fronteira de armazenamento dos arquivos

O runtime atual salva recibos em `data/third-party-files/<tenant>/<storageName>` e guarda o nome interno no JSON. O store documental usa outro diretório (`data/document-files`) e outro catálogo JSON; nenhum deles tem FK com o PostgreSQL. O schema candidato agora contém um catálogo privado relacional, mas ele ainda não tem adapter nem relação com os arquivos atuais. O `storage_object_id` só será válido depois que um fluxo autorizado criar e verificar a cópia no backend privado candidato.

Antes de criar uma versão operacional, o futuro fluxo deve ler o arquivo pela origem autorizada no servidor, recalcular SHA-256 e tamanho, transferi-lo para armazenamento privado definido e validar o objeto salvo por leitura de retorno. O registro relacional do objeto deve conter um identificador opaco, tenant, digest, tamanho e estado de disponibilidade; nunca um caminho de filesystem enviado ao cliente. A transação só pode confirmar `matched` se o digest/tamanho do recibo de origem, dos bytes relidos e da versão documental coincidirem e o objeto pertencer ao mesmo tenant. Falha parcial deve deixar o arquivo em quarentena/sem associação ou remover somente a cópia recém-criada, com trilha; não apagar o original JSON.

O usuário aprovou incorporar esse desenho ao candidato de schema. `third-party-evidence-candidate.sql` contém catálogo de metadados opacos e eventos de estado append-only, com hash/tamanho vinculados por FK à versão documental. Triggers bloqueiam update/delete/truncate no catálogo e no log; a cabeça do evento é uma projeção mutável que só poderá ser mantida por função confiável. FKs provam a identidade e integridade declarada do objeto, mas não provam que o último estado é `verified`; inserção, uso em análise e download terão de consultar o event-head dentro de transação e confirmar que ele pertence ao objeto e está permitido. A Etapa A descartável parseou e exercitou esse schema com fixtures sintéticas. Isso não escolhe provedor nem implementa adaptador, leitura de retorno, criptografia, retenção, varredura de malware ou backup. Não há transferência de arquivo nem equivalência com os diretórios JSON atuais. ASO e arquivos médicos continuam segregados.

### Contrato das operações confiáveis — ainda sem implementação

1. **Preparar arquivo:** servidor valida autorização humana e tenant; lê a origem por caminho interno obtido no registro legado; recalcula digest/tamanho; grava no backend privado por locator opaco; lê de volta e confere bytes. Nenhum caminho vem do browser. Como filesystem/storage e PostgreSQL não compartilham transação, a operação precisa de chave de idempotência e estados recuperáveis; falha depois da gravação pode deixar órfão privado para limpeza posterior controlada, sem remover o original.
2. **Registrar objeto:** em transação PostgreSQL, serviço autenticado registra metadados do objeto e evento `verified`, atualizando `event_heads` para o mesmo `(tenant_id, object_id, event_id)`. Repetição com mesma chave/digest retorna a operação existente; locator duplicado com hash diferente é conflito e bloqueia.
3. **Criar versão documental:** mesma transação confere evento-head `verified`, tenant, digest/tamanho, sequência de revisão e série bloqueada; marca versão atual anterior como substituída e insere a nova. Para cada caso associado, cria aplicabilidade `pending_review`; avaliações antigas continuam históricas e não podem ser tratadas como atuais.
4. **Conciliar recibo:** transação confere a última revisão do ledger, bytes e tenant; valida alvo, mapeamento exato de categoria e versão do documento; bloqueia o recibo; grava o evento `matched`. Essa operação não aprova a aplicabilidade nem a conformidade do documento.
5. **Ler/baixar ou analisar:** sempre conferir tenant/membership, evento-head atual do objeto, estado `verified`, hash/tamanho e situação atual da versão e aplicabilidade. Qualquer indisponibilidade, quarentena, divergência ou revisão pendente impede uso atual, sem apagar avaliação histórica.

**Limite de autoria:** as tabelas candidatas atualmente exigem membership humano em `registered_by`, `actor_user_id`, `received_by` e `created_by`. A submissão pública por convite não autentica esse membership. Até existir um principal de sistema verificado, com escopo, ciclo de vida e FK definidos, não atribuir o upload ao revisor nem usar ID sintético; o ingresso automatizado pelo portal permanece bloqueado. As operações manuais de reconciliação podem ser feitas por pessoa autenticada e autorizada. Ver `docs/M22_IDENTIDADE_PRINCIPAL_APLICACAO.md`.

#### Limite operacional atual

| Operação | Fonte/autoridade | Estado no M22 |
|---|---|---|
| Receber PDF pelo link público | Convite é uma credencial de capacidade; não identifica quem fez o envio | O runtime legado continua gravando no JSON e no armazenamento local atual. Nenhuma mudança nesse fluxo foi feita. |
| Conciliar/importar recibo no modelo candidato | Pessoa autenticada, com membership e autorização; registra `imported_by`/`actor_user_id` reais | Pode ser desenhado como operação administrativa manual. Só depois da revisão do arquivo, digest e destino exato. |
| Migrar o próprio portal para gravar no novo storage/DB | Serviço de aplicação com identidade técnica verificável, escopo e ciclo de vida | Bloqueado até definir o principal de sistema e seu mecanismo emissor. |

Assim, a ausência de principal de sistema não impede especificar a conciliação manual dos arquivos já recebidos. Ela impede tratar uma submissão anônima por convite como se tivesse sido efetuada por um membership ou cortar o portal para a nova fonte. Enquanto isso, o JSON segue fonte operacional para uploads e a especificação relacional segue candidata, sem mistura ou dual-write.

#### Permissão da conciliação manual

O código atual já define `reviewer(userId)` em `third-party-store.ts`: requer simultaneamente `documents.review` e `thirdparty.read`, membership ativo no tenant e módulo Terceiros habilitado. `assignee()` aplica a mesma combinação. Nas permissões atuais, os papéis que têm ambas são `consultoria_admin` e `sst_tst`; `thirdparty.manage` sozinho administra convites, mas não autoriza revisão documental. Essa é a matriz a preservar para a operação manual; não criar uma permissão ou papel novo nesta etapa.

| Ação administrativa | Permissão atual observada | Autor que fica no registro |
|---|---|---|
| Consultar candidatos/origem do recibo | `thirdparty.read` + escopo do tenant | Membership autenticado que consultou, via auditoria atual. |
| Abrir/inspecionar PDF para conciliação | `documents.review` + `thirdparty.read` | Membership que baixou/inspecionou; registrar leitura de forma auditável. |
| Confirmar `matched`, `ambiguous`, `rejected` ou `unavailable` | `documents.review` + `thirdparty.read` + módulo habilitado | Mesmo `user_id` da sessão no servidor, não um campo do formulário. |
| Criar/revogar convite | `thirdparty.manage` | Ação separada; não concede por si só poder de conciliar. |

A função PostgreSQL futura deve receber apenas os dados de decisão (recibo, estado, alvo exato, justificativa e revisão esperada), derivar `tenant_id`/`user_id` da transação autenticada e conferir membership ativo e papel permitido. O app deve fazer a checagem de permissão antes de chamar a função; a função refaz a verificação crítica no servidor/banco para não confiar em payload do browser. O catálogo SQL atual não contém uma tabela geral de permissões por ação; até essa política estar vinculada de forma autoritativa, a lista de papéis do TypeScript é uma dependência que deve ser testada contra a regra do banco, não duplicada silenciosamente em um `CHECK` divergente.

O código de transação atual chama `getCurrentTenantAccess(permission, requestedTenantId)` antes de abrir a transação e só então define `sst.user_id`/`sst.tenant_id` por `set_config(..., true)`. Esse caminho é server-only e usa sessão obtida pelo app. Os GUCs, isoladamente, não são prova criptográfica: o papel que tem credenciais PostgreSQL pode defini-los. Portanto, não expor credencial/função a clientes diretos; manter `EXECUTE` somente para o papel de runtime controlado, validar tenant+membership ativo dentro da função e tratar a sessão web como autenticada pelo servidor. O importador de domínio local inclui `DEMO_MEMBERSHIPS` na reconciliação do snapshot PostgreSQL, mas `getCurrentTenantAccess` ainda consulta `DEMO_MEMBERSHIPS` em memória. Isso é uma fonte duplicada, não uma sincronização transacional contínua. Antes de ativar a função, a autorização web e a checagem SQL devem consultar o mesmo membership ou comparar status/role dentro da mesma operação; divergência deve negar a operação, não escolher um lado silenciosamente. A regra de `documents.review` + `thirdparty.read` também é derivada do mapa TypeScript e não está persistida como catálogo de ações no SQL; até haver fonte canônica comum, proteger contra drift por uma matriz de equivalência revisada.

Campos mínimos da futura tela manual: origem/convite/recibo e categoria legada; empresa/unidade/terceiro/caso selecionados; série/versão e hash/tamanho verificados; resumo da cadeia `replacesReceiptId`; estado da reconciliação atual e próxima revisão; justificativa obrigatória. Categoria sem mapeamento compatível não pode oferecer `matched`. A decisão de associação deve permanecer separada da aplicabilidade do documento e da análise técnica de conformidade.

## Ponte explícita convite→caso (2026-10-20)

O candidato `third-party-legacy-reconciliation-candidate.sql` agora representa o contexto mínimo do convite em `legacy_invitation_snapshots`, imutável e versionado, e decisões humanas em `invitation_case_link_events`. O snapshot guarda IDs opacos da empresa/unidade de origem, CNPJ declarado, escopo textual inclusive nulo, categorias solicitadas, digest canônico do contexto e membership que capturou. Não guarda nomes, token hash/credencial, caminho local ou PDF. Revisões diferentes do mesmo convite não se sobrepõem.

Cada vínculo `linked` aponta por FK composta a um `third_party_cases` exato; `ambiguous`, `rejected`, `unavailable`, `pending` e `reopened` não têm alvo. O evento `matched` do recibo exige a referência ao evento de vínculo e seus mesmos IDs de empresa/unidade/terceira/caso, além da série e versão documental. Isso não garante sozinho que o evento de vínculo seja o mais recente, que corresponda ao convite do recibo ou que a origem JSON não tenha mudado: a função confiável deverá comparar store/tenant/convite, snapshot/digest, cabeça de revisão e alvo dentro da transação, negar divergências e exigir confirmação humana. Não inferir associação por CNPJ, nomes, texto, categoria ou ordenação. Convites distintos continuam podendo convergir a um caso após revisão individual.

Esta é somente uma ampliação do schema candidato. As quatro tabelas do ledger têm RLS forçada, histórico append-only e sem grants diretos. A Etapa A atualizada passou em PostgreSQL 17 descartável em 2026-10-20, confirmando 36/36 tabelas RLS forçada, 114 FKs, vínculo convite→caso e recibo `matched` para o mesmo caso; o registro da prova está em `docs/M22_ROTEIRO_PROVA_EVIDENCIAS.md`. O JSON segue fonte operacional e a decisão M22 mantém a política fora do cutover.

## Funções candidatas provadas (2026-10-20)

O arquivo `schemas/third-party-legacy-reconciliation-functions-candidate.sql` agora inclui `capture_invitation_context`, `record_invitation_case_link` e `record_receipt_reconciliation`. A última serializa convite→recibo, exige snapshot/digest atual, usa a cabeça corrente `linked`, deriva o alvo do caso, limita o mapeamento a PGR/PCMSO/LTCAT equivalentes e Outro→OTHER, e só grava `matched` para versão atual do mesmo terceiro com hash/tamanho iguais e event-head `verified`. As transições do ledger e a concorrência otimista foram provadas em PostgreSQL 17 descartável pelo verificador M22; 36/36 tabelas RLS forçada, 114 FKs. A prova não conecta runtime nem altera bancos/arquivos existentes.

A função não acessa os bytes: antes de futura ativação, um adapter server-side deve reler JSON/arquivo, recalcular o digest/tamanho e validar a cópia privada por leitura de retorno. A fonte de membership web/PostgreSQL também precisa de alinhamento contínuo. Até esses gates serem resolvidos, as funções permanecem candidatas e desconectadas do app; a conclusão `matched` atesta a associação revisada no ledger, sem declarar aplicabilidade ou conformidade.

