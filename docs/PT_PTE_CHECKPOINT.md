# PT/PTE — preparação e fluxo solicitado (2026-10-24)

- Estado: primeira etapa de preparação somente leitura; campos técnicos e emissão operacional pendentes.
- Aceite visual: o usuário aprovou a apresentação informativa do catálogo PT no painel em 2026-10-24. O aceite não se estende a critérios, aplicabilidade normativa, autoridade, gate ou operação.
- Próximo insumo para critérios de altura: conteúdo técnico revisado será fornecido pelo usuário; ainda não recebido. Não exigir indicação de responsável neste momento. Até receber e revisar o conteúdo, altura permanece somente demonstração, sem checklist, critério ou emissão.
- URL: http://127.0.0.1:3107/permissoes-trabalho
- Iniciar: ABRIR-PAINEL.cmd na raiz; mesma conta demo existente (ver M02_CHECKPOINT.md), perfil com pgr.manage. Link de preparação na seção APR.
- Nenhuma APR, risco, permissão, assinatura ou liberação criada. Nenhuma migration/importação/escrita em banco persistente.

## Decisões explícitas do usuário

1. Líder ou supervisor preenche o documento em campo.
2. Líder ou supervisor libera a atividade.
3. TST apenas audita os riscos e as medidas de controle adotadas na atividade.
4. Demais integrantes apenas assinam sua participação.

Essas decisões estão descritas na tela e em schemas/work-permit-workflow-candidate.json, que é contrato candidato, sem concessão de permissões no runtime. Admin da consultoria não vira líder/supervisor automaticamente. Não foi criada exigência adicional de aprovação final da APR por TST. Campos/checklists, identidade dos participantes e ciclo de liberação ainda precisam ser definidos/implementados. O fluxo solicitado não constitui parecer de conformidade normativa.

### Modalidades de PT informadas pelo usuário

Além de trabalho em altura, o escopo terá PT para içamento, trabalho a quente, escavações, eletricidade e mergulho. A frente atual continua sendo somente o cenário demonstrativo de trabalho em altura. Registrar as modalidades não define critérios, treinamentos, formulários nem gates: cada modalidade depende de fonte técnica/normativa aplicável e revisão humana antes de implementação. Manter o tipo da atividade explícito para não aplicar critérios de altura às demais modalidades. A PTE de espaço confinado permanece uma categoria separada de PT.

O contrato candidato v20 registra as seis modalidades de PT confirmadas pelo usuário, a PTE em categoria separada e seus estados de implementação. O usuário confirmou mergulho profissional e indicou dois contextos: águas jurisdicionais brasileiras (mar territorial, ZEE e águas interiores) e ambientes hiperbáricos terrestres/obras civis. Foi examinado o PDF oficial da Marinha hospedado como `normam-222.pdf`, cuja capa o identifica como NORMAM-222/DPC, “Normas da Autoridade Marítima para Mergulho Comercial”, edição 2025. A aplicabilidade dessa norma por cenário ficou reservada para ajuste posterior pela equipe, sem conclusão normativa pré-registrada e sem bloquear a preparação não operacional do protótipo. A página do catálogo DPC permaneceu inacessível (HTTP 403), portanto não foi possível confirmar se houve publicação/modificação posterior até 2026. A modalidade segue planejada, sem critérios; nas listas do produto é identificada como “Mergulho profissional”.

Na versão candidata v20, a modalidade de altura registra que o conteúdo técnico revisado será fornecido futuramente pelo usuário. O conteúdo ainda não foi recebido; não é necessário indicar responsável técnico agora. O contrato é documental e não-runtime: critérios continuam pendentes e não podem ser implementados antes do recebimento e revisão do material.

Mapeamento inicial de fontes oficiais consultadas em 2026-10-24 (referências para pesquisa, não checklists):

- **Altura:** NR-35, página vigente do [MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-35-nr-35). O cenário demo existente é desta modalidade.
- **Içamento:** NR-11, [página do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-11-nr-11), e, se aplicável à construção, NR-18. No texto da NR-18 consultado, 18.10.1.18 trata de análise de risco para movimentação de cargas e 18.10.1.19 prevê análise específica e respectiva PT para movimentação não rotineira. A NR-11 vigente disponibilizada na página consultada é identificada como modificada pela Portaria MTPS nº 505/2016; seus itens 11.1.3 e 11.1.5 tratam, respectivamente, de equipamentos de movimentação e treinamento específico do operador de transporte motorizado. Não equiparar isso automaticamente à designação/requisito de sinaleiro ou a toda operação de içamento.
- **Trabalho a quente:** se aplicável à construção, NR-18, seção 18.7.6. O item 18.7.6.2 prevê análise de risco específica nas duas condições descritas na norma (combustíveis/inflamáveis no entorno ou área sem isolamento prévio e não destinada a esse fim); 18.7.6.3–18.7.6.4 tratam do observador e capacitação quando definidos na análise. A própria NR-18 é setorial; confirmar setor, tipo de trabalho e referências complementares antes de desenhar formulário.
- **Escavações:** se aplicável à construção, NR-18, seção 18.7.2. O item 18.7.2.3 trata de escavações acima de 1,25 m, condicionando início à liberação/autorização de profissional legalmente habilitado e atendimento às normas técnicas nacionais; os itens subsequentes tratam de projeto e medidas de proteção. Não generalizar para atividade fora do âmbito da NR-18 nem codificar o limiar sem revisão técnica do caso e da versão aplicável.
- **Eletricidade:** [página vigente da NR-10 no MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10). Na data da consulta, a página aponta texto então vigente até 31/05/2027 e nova redação da Portaria MTE nº 737/2026 com entrada em vigor em 01/06/2027; a modalidade elétrica precisará selecionar a versão aplicável à data da atividade, sem misturar textos.
- **Mergulho profissional:** a referência marítima candidata identificada no PDF oficial da Marinha é a [NORMAM-222/DPC — Normas da Autoridade Marítima para Mergulho Comercial](https://assets.marinha.mil.br/sites/default/files/atos-normativos/dpc/normam/normam-222.pdf), edição 2025 indicada na capa. A publicação define em 1.5 que “atividades subaquáticas”, para efeito da norma, referem-se ao mergulho comercial descrito no artigo 14.8; portanto, não estender automaticamente o seu escopo a toda atividade profissional ou a todo ambiente hiperbárico terrestre. A seção 1.71 (PDF, p. 28; página impressa 1-11) define o Supervisor de Mergulho como membro habilitado para supervisionar operações e discrimina categorias de mergulho raso e profundo com qualificação correspondente. O item 4.4(f) (PDF, p. 48; página impressa 4-5) atribui ao supervisor, entre outros deveres, controle direto da operação indicada, cumprimento da norma, assinatura/preenchimento de registros aplicáveis, composição qualificada da equipe, não iniciar quando houver descumprimento ou insegurança, briefing/debriefing e preparação/complemento/assinatura da APR. Os itens 1.4 e 1.61 distinguem a elaboração pelo responsável técnico da complementação da APR e preenchimento do ROM pelo supervisor. Isso descreve atribuições da norma citada, não concede autoridade no app nem autoriza criar checklist/gate sem revisão humana.

O PDF do endereço oficial da Marinha foi recuperado diretamente com HTTP 200 e examinado localmente. As páginas do catálogo DPC (`/dpc/normas-autoridade-maritima-brasileira` e `/dpc/content/normam`) continuam retornando HTTP 403 nesta sessão; assim, embora a NORMAM-222/DPC 2025 esteja publicada no domínio oficial de arquivos da Marinha, não foi possível confirmar pelo catálogo se houve revisão posterior ou se esta é a última edição vigente em 2026. As MOD 1 e MOD 2 da NORMAM-15/DPC informadas pelo usuário (Portarias nº 55/2022 e nº 63/2022) ficam registradas como referências de predecessor fornecidas, não como modificações automaticamente aplicáveis à NORMAM-222.

O usuário também apontou NR-15 Anexo 6, NR-07/PCMSO e normas ABNT como referências complementares. A página oficial do MTE sobre NR-15 foi consultada e vincula o Anexo 6, que contém “Trabalhos Submersos”; os dispositivos da NR-07 aplicáveis e números das normas ABNT ainda precisam ser identificados e validados. Para frentes terrestres/obras civis, a aplicabilidade da NORMAM-222 deve ser avaliada separadamente das regras trabalhistas e de segurança ocupacional. Não há conteúdo técnico normativo implementado no protótipo, critérios, gate ou emissão para mergulho.

O conjunto acima é uma trilha de pesquisa de fontes primárias, não uma conclusão de aplicabilidade a todo cliente. A aplicabilidade da NORMAM-222 por cenário é um campo reservado para ajuste posterior da equipe; não precisa ser decidida para a preparação estrutural não operacional e não deve ser presumida pelo sistema. Para desenhar critérios de mergulho profissional, continuam necessários a revisão humana do cenário quando a equipe configurar esse campo, confirmação de eventual edição posterior da NORMAM-222/DPC, itens específicos aplicáveis da NR-07, normas ABNT pertinentes e validação humana das atribuições/assinaturas para cada contexto. Não há conteúdo técnico normativo implementado no protótipo, nem critérios, bloqueios ou emissão para içamento, trabalho a quente, escavações, eletricidade ou mergulho.

## Implementado nesta etapa

- Página autenticada somente leitura com seis PTs solicitadas pela equipe (altura, trabalho a quente, içamento, escavação, mergulho profissional e elétrica) e uma PTE separada para entrada/trabalho em espaço confinado. A tela distingue altura como demonstração e as demais modalidades como planejadas, sem checklist/critério técnico implementado. Para mergulho, explicita que a aplicabilidade da NORMAM-222 depende do cenário e está reservada para ajuste posterior da equipe. A separação e os estados são informativos, não representam classificação normativa, prontidão ou autorização.
- O resumo de PT no painel deriva os rótulos de `WORK_PERMIT_TYPES`, o mesmo catálogo da tela de preparação; a PTE continua separada. Alteração de apresentação, sem critérios ou fluxo operacional.
- O painel também exibe por modalidade o estado informativo e, para mergulho, a nota de aplicabilidade por cenário, evitando que a lista de nomes pareça indicar disponibilidade operacional.
- O cartão de PTE no painel deriva de `WORK_PERMIT_PTE_TYPES`, separado do catálogo de PT, e apresenta seu estado planejado sem sugerir disponibilidade operacional.
- Teste automatizado do contrato candidato protege a separação PTE/PT, o estado pendente do conteúdo de altura e o ajuste futuro da aplicabilidade da NORMAM-222 por cenário; não conecta o contrato ao runtime.
- Decisão do usuário: disponibilizar modelos configuráveis de APR para espaço confinado (rótulo “referência NR-33 a validar”) e para atividades diversas, sem itens normativos pré-carregados. Modelos começam como rascunho; somente ação explícita de revisão humana autenticada os ativa. A categoria NR-33 exige metadados da referência antes de ativação. Isso registra a conta revisora, sem verificar qualificação ou declarar conformidade. A criação da APR continua condicionada a PGR aprovado e riscos estruturados.
- A ativação registra usuário e horário, preserva o modelo anterior ao ativar nova versão e não atribui qualificação técnica ao revisor. A configuração não cria dados automaticamente; nenhuma APR, checklist ou referência normativa foi cadastrada nesta alteração. No ambiente visual atual, ainda não há PGR aprovado com riscos estruturados nem modelo ativo para habilitar criação de APR.
- Na simulação, o estado vazio informa quais APRs existentes podem ser selecionadas: rascunho ou em revisão, vinculada a empresa e unidade ativas. A mensagem não sugere aprovação técnica nem criação de cenário fictício.
- Quando não há APR elegível, a tela também indica os pré-requisitos cadastrados para criar uma: modelo de checklist revisado pela equipe e PGR aprovado com riscos estruturados, com links para as respectivas áreas. Não cria registros automaticamente.
- No cartão de PT do painel, a correspondência tipo↔riscos/controles é descrita como pendente de definição e validação humana, sem texto que apresente um gate futuro como regra já ativa.
- Conferência estrutural APR → PGR: tenant, empresa/unidade ativa, inventário único e aprovado, mesma revisão, riscos não vazios/únicos com IDs/revisões correspondentes e conteúdo do snapshot compatível com a fonte atual.
- Exibição das medidas existentes no PGR apenas quando o vínculo estrutural confere. Conteúdo não é inventado nem validado tecnicamente. Ausência de medidas e respostas incompletas/pontos a tratar são sinalizados como pendências para conferência humana.
- Correspondência estrutural não equivale a risco adequado ao tipo de atividade. Seleção e validação humanas da correspondência tipo↔riscos/controles permanecem pendentes.
- canIssue é sempre false. Sem action de emissão, assinatura ou liberação. Sem APR, a página mostra o pré-requisito e não consulta PGR desnecessariamente.
- Preparação acessível apenas a perfis pgr.manage atuais; isso NÃO concede a esses perfis autoridade para liberar trabalho.
- Correção pequena da rota /configuracoes/terceiros: wrapper Suspense + connection no conteúdo autenticado, para permitir build completo sem alterar a política de terceiros.

## Teste humano

1. Abrir a URL na sessão demonstrativa. Conferir aviso Emissão indisponível, tipos e divisão líder/supervisor, TST e integrantes.
2. Confirmar ausência de botão para emitir/liberar/assinar.
3. Na base atual, deve aparecer 0 APR(s), com orientação para elaborar APR a partir de PGR aprovado e solicitar revisão do PGR se faltar risco correspondente.
4. Quando houver APR demonstrativa inserida pelo fluxo autorizado, conferir que revisão/escopo divergentes aparecem como pendência, sem reaproveitar riscos da revisão errada.
5. Conferir se os papéis descritos refletem a intenção operacional antes de implementar vínculos e ações desses atores.

## QA e evidências

- 12 testes focados (7 conferência + 5 regressão APR), repetidos após incorporar a divisão de responsabilidades: aprovados. Fixtures temporárias sintéticas; execução fora do sandbox apenas por restrição de rename do armazenamento APR.
- TypeScript: aprovado na primeira verificação; build isolado também executou etapa de tipos.
- ESLint focado: resultados finais registrados abaixo.
- Primeiro build completo após corrigir Suspense: aprovado, incluindo /permissoes-trabalho, /epi/estoque, /epi/fichas e /nao-conformidades. Aviso remanescente em /api/health por padrão amplo de arquivos, sem falha.
- Build final após atualização de papéis: resultado abaixo.
- UI autenticada: página e estado vazio conferidos no painel estreito, incluindo o texto informado pelo usuário para os papéis. Não há APR ativa para conferir cartões com vínculos na UI; cobertura sintética não substitui esse teste visual futuro.

## Limitações e próximo passo

Ainda faltam campos e checklist específicos de cada tipo, vínculos autenticados líder/supervisor/TST/integrantes por atividade, mecanismo/momento das assinaturas, seleção explícita de riscos e controles, ciclo de mudanças/suspensão/encerramento e persistência transacional com provas de autorização antes de ativar liberação. Nenhuma conta ou papel foi criado. Esta página não emite PT/PTE.

### Próxima fatia segura de protótipo

A divergência documental foi resolvida nas fontes oficiais do MTE (detalhes acima). O simulador referencia uma APR já existente no tenant, selecionada explicitamente na revisão corrente, e mostra seu estado real (`draft`/rascunho ou `in_review`/em revisão) sem sugerir aprovação. A atividade demonstrativa tem tipo explícito `work_at_height_demo` e referência à APR por ID/revisão, tenant, empresa e unidade; etapa e área são copiadas da APR vinculada e revalidadas exatamente contra ela em cada ação, apenas como contexto, sem estabelecer ou avaliar critério normativo. A partir da APR, a pessoa escolhe explicitamente, sem valor pré-selecionado, um funcionário fictício ativo na mesma empresa/unidade. A Server Action revalida tenant, APR, revisão, empresa/unidade, etapa/área e vínculo ativo em cada ação; mudança de qualquer dado de origem exige reiniciar o cenário. O simulador não cria APR, não consome nem avalia os riscos/respostas da APR e não usa o funcionário como identidade autenticada ou autoridade; os atores do fluxo permanecem fictícios. Não presumir treinamento específico para nenhum funcionário. A preferência por treinamento focado continua apenas demonstrativa e pendente de validação. Critérios técnicos permanecem explicitamente pendentes de revisão humana; a data de vigência da NR-35 não é requisito de registro.

Atualização desta retomada: além de explicitar que a data de vigência da NR-35 não é requisito, o fluxo demo referencia uma APR existente por ID/revisão e escopo do tenant, exibindo rascunho/em revisão sem sugerir aprovação; exige funcionário ativo compatível selecionado sem default e revalida o vínculo no servidor. A leitura de funcionários exige também `workers.read`, tanto na página quanto na Server Action; sem essa permissão, o seletor não consulta nem expõe funcionários. A atividade tem referência tipada `work_at_height_demo`, com etapa e área copiadas da APR atual e comparadas na página e em cada ação; são contexto apenas. O checklist fictício compartilha tenant/empresa/unidade e ID de atividade desse vínculo e rejeita divergência. O cadastro de funcionário agora acompanha separadamente NR-35 e treinamento focado em supervisão; os dois campos começam “não informado”, e qualquer relato fica pendente de validação, sem evidência, validade ou qualificação presumida. O contrato marca critérios técnicos como não definidos e pendentes de revisão humana. Não há nova APR, avaliação/uso de riscos e respostas, autoridade real, critério técnico ou emissão. Validação desta retomada registrada ao concluir. Build não executado.

Validação da alteração de treinamento NR-35/supervisão: 23 testes combinados aprovados (22 PT/PTE + 1 worker store), ESLint focado e TypeScript aprovados; contrato JSON parseado e conferido quanto aos estados permitidos. Nenhum funcionário foi marcado como treinado; registros legados são lidos como “não informado”. Build não executado.

Atualização de escopo por orientação do usuário da área de segurança do trabalho: andaimes devem ser montados/desmontados por pessoas treinadas. O usuário escolheu acompanhar treinamento somente para trabalhadores designados a montar/desmontar e registrar separadamente se a atividade utilizará andaime. Isso substitui a seleção anterior provisória de aplicar exigência a qualquer trabalhador/atividade que apenas use o andaime. No cadastro, `scaffoldingAssemblyTrainingStatus` é demonstrativo (`não informado` ou `informado · pendente de validação`), preservando registros antigos como “não informado”. Na atividade demo, `scaffoldUseStatus` e `scaffoldAssemblyStatus` são escolhas sem default. Quando montagem/desmontagem está incluída, a atividade exige seleção explícita de um ou mais funcionários fictícios ativos do escopo e revalida os vínculos em cada ação; seus estados de treinamento são mostrados sem filtro, validação ou bloqueio. O permalink preserva uso, montagem/desmontagem e lista designada. Não há emissão operacional. Testes focados: 7/7; regressão combinada Worker + PT/PTE: 24/24; ESLint focado e TypeScript aprovados; contrato candidato v8 parseado e verificado.

Decisão adicional do usuário: a evidência de treinamento dos designados à montagem/desmontagem deverá ser validada pelo supervisor responsável pela atividade. Por enquanto, a UI e o contrato registram apenas essa responsabilidade futura; o simulador não autentica o supervisor, não coleta evidência nem marca treinamento como validado. Próximo insumo para implementar esse fluxo sem presumir critérios: definir qual tipo de evidência o supervisor deverá revisar.

O usuário definiu a evidência esperada como registro de conclusão do treinamento mais confirmação do empregador. O contrato e a UI agora informam ambos como componentes para revisão pelo supervisor. Nenhum documento é coletado/armazenado no arquivo local não criptografado; continuam pendentes autenticação do revisor, armazenamento seguro e ação de revisão. Estados individuais permanecem não informado/informado-pendente, sem permitir confirmação por autorrelato ou simples seleção no ensaio.

Inspeção do armazenamento existente: `document-store.ts` grava bytes e metadados em arquivos locais sem criptografia, portanto não reutilizar esse caminho para registros de treinamento pessoais. Também existe `third-party-private-filesystem-store.ts`, um candidato de armazenamento privado da frente M22 para PDFs de terceiros: ele usa HMAC para integridade do manifesto e permissões de arquivo, mas não criptografa o conteúdo e não é chamado pelo fluxo PT/PTE. Não tratar “privado” ou HMAC como criptografia nem reutilizar esse candidato para certificados. Evidências não devem ser enviadas ou armazenadas pelo protótipo atual; antes de implementar upload ou validação são necessários armazenamento com criptografia adequada, controle de acesso por tenant e autoridade do revisor.

Consulta da NR-18 atualizada em 2026-10-24: seguindo o link oficial da [página vigente da NR-18 no MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-18-nr-18), foi possível baixar e ler o PDF [NR18atualizada2026I.pdf](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/NR18atualizada2026I.pdf) (55 páginas). A página oficial identifica como última modificação a Portaria MTE nº 836, de 13 de maio de 2026. O item 18.12.6 determina: “A atividade de montagem e desmontagem de andaimes deve ser realizada: a) por trabalhadores capacitados que recebam treinamento específico para o tipo de andaime utilizado; b) com uso de SPIQ; c) com ferramentas com amarração que impeçam sua queda acidental; d) com isolamento e sinalização da área.” Esta fatia registra somente o requisito expresso de treinamento específico para o tipo de andaime; não implementa os demais controles do item, não interpreta exceções nem presume evidência suficiente. O cadastro continua em estado informado/pendente de validação, sem comprovar capacitação; emissão e bloqueio operacional continuam desabilitados. A fonte anterior de 2025/2020 e as consultas ao DOU que falharam eram caminhos incorretos/inacessíveis; foram substituídos por esta fonte oficial vigente.

A decisão do usuário de que o líder/supervisor libera foi registrada; a preparação não deve substituir essa liberação por aprovação da consultoria ou auditoria do TST.

## Arquivos alterados

- examples/app/src/lib/work-permit-readiness.ts
- examples/app/src/app/permissoes-trabalho/page.tsx
- examples/app/src/app/safety-operations-section.tsx (link de preparação)
- examples/app/src/app/configuracoes/terceiros/page.tsx (correção de carregamento)
- examples/app/tests/work-permit-readiness.test.ts
- schemas/work-permit-workflow-candidate.json
- docs/PT_PTE_CHECKPOINT.md, docs/EPI_ESTOQUE_CHECKPOINT.md, docs/NC_CHECKPOINT.md e docs/RETOMAR_PROJETO.md

## Checkpoint

Aprova esta preparação ou quer corrigir o fluxo descrito? Conforme START_HERE_CODEX.md: “Se o checkpoint exigir teste/aceite do usuário, pare e aguarde.” Os parâmetros técnicos ainda serão definidos pelo responsável; não inventar checklist nem habilitar emissão apenas por aceite visual.

Validação final 2026-10-24: 12/12 testes focados, ESLint e build isolado completos aprovados (exit code 0). O build final inclui TypeScript. Remanescente apenas aviso de padrão amplo de arquivos em /api/health; sem falha. Corrigido o bloqueio histórico de Suspense em /configuracoes/terceiros. JSON do contrato candidato validado por parse, sem ativação. Inclusões temporárias deste build removidas do tsconfig. Captura da versão final em docs/PT_PTE_VALIDACAO_2026-10-24.png; página ficou aberta ao lado. Não foi exigida aprovação final da APR por TST como condição nova; auditoria e liberação continuam separadas conforme decisão do usuário.

## Numeração informativa do catálogo — 2026-10-27

- Após a etapa de APR, a sequência visual do catálogo foi definida: `01 · PTE — Entrada e trabalho em espaço confinado`; `02 · Altura`; `03 · Trabalho a quente`; `04 · Içamento`; `05 · Escavação`; `06 · Mergulho profissional`; `07 · Elétrica`.
- A PTE e a PT aparecem nessa ordem no painel e na página de preparação. Os números são rótulos de organização do catálogo, sem criar modelos, campos, checklists, critérios, gates ou emissão operacional.
- Para os tipos após PTE e Altura, foi preservada a ordem que já existia no catálogo. A lista é a do produto atualmente registrado; novos tipos podem ser acrescentados quando identificados.
- TypeScript e ESLint focado (`work-permit-readiness.ts`, `dashboard.tsx`, `permissoes-trabalho/page.tsx`) passaram. Não foram executados testes automatizados. A conferência visual do painel não foi concluída nesta sessão porque a ferramenta de navegador não conseguiu ler a aba, embora ela esteja aberta no lado do usuário.
- Aceite humano em 2026-10-27: o usuário aprovou a sequência informativa do catálogo acima. O aceite cobre nomes, ordem e apresentação da sequência; não define nem aprova conteúdo técnico, checklist, vínculo com riscos, autoridade, gate ou emissão.

## Inventário estrutural dos formulários Word — 2026-10-27

Leitura somente dos arquivos fornecidos em `docs`; nenhum Word foi modificado e nenhum checklist foi transcrito para o app.

| Fonte | Blocos e campos localizados | Observação para a próxima etapa |
|---|---|---|
| `FO-3.7.2.3 - PET - PERMISSÃO DE ENTRADA E C.docx` (título impresso: PET para espaço confinado) | Identificação do espaço/atividade; equipe autorizada e horários; instrumentos e registros de medições atmosféricas; ventilação/purga; bloqueio de energias (LOTO); equipamentos e recursos de resgate; seção adicional para silos/moegas/grãos; monitoramento e encerramento. | O documento contém referências numéricas, requisitos de treinamento, itens de bloqueio e declarações de parada. Preservar como fonte; não incorporar esses valores ou travas até revisão técnica. A estrutura pode ser separada entre campos gerais de PTE e bloco condicional de silos/moegas.
| `FO-3.8.4.0 - PERMISSÃO DE TRABALHO A QUENTE - PTQ.docx` | Identificação do local/atividade/validade; equipe e treinamentos informados; preparação contra incêndio; equipamentos e EPIs de solda/corte; blocos próprios para serviços elétricos, escavação e içamento; liberação, encerramento e auditoria. | É um formulário composto: elétrica, escavação e içamento aparecem como seções internas, além do trabalho a quente. A ordem interna no Word é trabalho a quente, elétrica, escavação e içamento; o catálogo conserva a sequência já aprovada pelo usuário. Separar tipo de atividade sem copiar automaticamente critérios de cada seção.

No catálogo atual, Altura e Mergulho profissional não têm formulário Word correspondente em `docs`. A extração foi somente estrutural; números, valores de medição, critérios, travas e requisitos descritos nas fontes não foram validados nem convertidos em comportamento. O mapa inicial abaixo separa campos comuns e blocos condicionais para revisão antes de qualquer item técnico virar checklist ou gate.

### Mapa inicial de campos, sem regras

**Campos comuns candidatos, presentes nas duas fontes:** empresa/local; referência da APR; ordem de serviço; atividade; data, horário e validade informados; origem da mão de obra; equipe/participantes e função; responsável pela liberação; observações; registros de encerramento. São apenas campos de identificação e histórico, não prova de autorização.

**Blocos condicionais da PET/PTE:** identificação do espaço; controle de acesso/chaves; equipe com papéis de entrada, vigia e resgate; identificação do instrumento e registros de medição; equipamento e parâmetros previstos de ventilação/purga; fontes de energia e registros LOTO; equipamentos e recursos de resgate; registro de monitoramento; encerramento. A seção de silos/moegas/grãos deve ficar como bloco opcional próprio, separado dos campos gerais do espaço confinado.

**Blocos condicionais da PT a Quente composta:** preparação da área e proteção contra incêndio; equipamentos de solda/corte e EPIs; serviços elétricos; escavação; içamento; liberação; encerramento e auditoria. O documento mistura estes quatro tipos em uma única PT; o produto pode mantê-los como módulos por tipo, sem mostrar os módulos não selecionados.

Este mapa não transforma a indicação “Sim/Não/Não aplicável” do Word em gate do produto. Medições, limites, tempos, treinamentos, obrigatoriedades, travas, assinaturas e decisões operacionais continuam fora da implementação até revisão técnica específica. Para Altura e Mergulho profissional, o formulário e os campos específicos permanecem pendentes de fonte.

### Prévia estrutural no painel — 2026-10-27

- A página `/permissoes-trabalho` agora exibe uma área recolhida, somente leitura, com os grupos estruturais acima para PTE e PT a Quente. A seção informa que os dados vieram dos Word e aguardam revisão; não contém limites, respostas Sim/Não, travas, campos de assinatura funcional ou ações de liberação.
- O bloco de silos/moegas permanece separado como conteúdo condicional dentro da PTE; elétrica, escavação e içamento aparecem como módulos separados da PT a Quente composta.
- A prévia identifica esses módulos com a numeração aprovada: 03 Trabalho a Quente, 07 Elétrica, 05 Escavação e 04 Içamento. Também sinaliza que 02 Altura e 06 Mergulho profissional ainda não têm formulário Word correspondente em `docs`.
- Foi incluída uma lista de cobertura para os sete tipos, diferenciando Word próprio, módulo embutido no formulário composto e fonte não localizada.
- Arquivo alterado: `examples/app/src/app/permissoes-trabalho/page.tsx`.
- Após o ajuste da cobertura: TypeScript e ESLint focado aprovados. Não foram executados testes automatizados. A conferência visual do painel não foi possível pela ferramenta desta sessão; o usuário mantém o painel aberto, mas não foi feita afirmação de aceite visual desta nova seção.
- Continuação: mapa extraído da página para `examples/app/src/lib/work-permit-source-field-maps.ts` e recebeu IDs estáveis por tipo e seção. A página consome os mesmos dados, sem alterar a apresentação ou habilitar captura/armazenamento. TypeScript e ESLint focado repetidos e aprovados; testes automatizados não executados.
- Continuação: aviso da página agora distingue o mapa estrutural disponível dos critérios/checklists ainda pendentes de validação; corrigida a referência imprecisa a “assinatura jurídica” para “assinaturas reais”. A lista de pendências aponta a revisão do mapa e a ausência de fonte Word para Altura e Mergulho. TypeScript e ESLint focado passaram; testes automatizados e conferência visual não executados.
- Continuação: os grupos do módulo reutilizável agora guardam os rótulos como listas separadas, e a prévia os exibe individualmente. Nenhum tipo de campo, obrigatoriedade, validação, valor padrão ou lógica de decisão foi definido. TypeScript e ESLint focado passaram; testes automatizados e conferência visual não executados.
- Continuação: cada campo recebeu um ID estável dentro de sua seção, e a renderização usa esses IDs como chaves. Isso prepara a estrutura para uma futura captura sem depender da posição dos itens. Permanece apenas uma lista de rótulos: sem tipo/obrigatoriedade, validação, valores padrão, armazenamento ou decisões. TypeScript e ESLint focado passaram; testes automatizados e conferência visual não executados.
- Continuação: a prévia passou a mostrar o status “Revisão técnica pendente” em cada estrutura-fonte, usando o metadado já existente no mapa. TypeScript e ESLint focado passaram; testes automatizados e conferência visual não executados.
- Continuação: adicionada uma prévia preenchível de campos para `01 · PTE`, derivada do mapa existente. Todos os campos são opcionais e texto livre; os valores ficam somente na memória client-side desta aba e podem ser limpos. Não há envio, persistência, respostas de checklist, validação, assinatura, liberação ou emissão. A interface orienta usar somente dados fictícios.
- A prévia foi generalizada e agora também cobre `03 · PT Trabalho a quente`, incluindo os módulos presentes na fonte para Elétrica, Escavação e Içamento. `02 · Altura` permanece sem prévia de formulário porque não há Word correspondente localizado; não foram inventados campos específicos.
- Arquivo: `examples/app/src/app/permissoes-trabalho/work-permit-source-form-preview.tsx`.
- TypeScript e ESLint focado aprovados após a generalização. Não foram executados testes automatizados. A conferência visual continua pendente porque a ferramenta não leu a aba do painel.

## Aceite humano — 2026-10-24

Usuário respondeu explicitamente “aprovado” à preparação de PT/PTE. Aceita a tela de preparação e a divisão solicitada: líder/supervisor preenche e libera, TST audita riscos/medidas e demais integrantes assinam sua participação. Aceite não ativa emissão/liberação/assinatura nem aprova parâmetros técnicos ainda não fornecidos. Próximo passo: definir campos e checklist de cada tipo e, depois, implementar vínculos autenticados e fluxo operacional com validação própria.

## Checklist de decisão e NC — atualização 2026-10-24

Usuário autorizou escolher a ordem; escolhido trabalho em altura como primeiro protótipo. Definiu que checklist é documento de decisão de liberação/não liberação: NC aguarda reavaliação do TST quando disponível; se persistir, a responsabilidade decisória volta ao supervisor, que aguarda adequação ou registra a decisão de prosseguir com NC e justificativa. Empresas sem TST seguem ao supervisor sem inventar parecer técnico. Isso atualiza a descrição anterior de TST como auditor apenas: também reavalia itens NC, sem substituir a decisão posterior do supervisor.

### Implementação desta fatia

- Motor candidato puro em src/lib/work-permit-checklist-workflow.ts, sem persistência ou ligação às actions operacionais.
- Rascunho → preenchimento por líder/supervisor → aguardando TST (quando há NC e TST) → decisão de campo.
- NC mantida: supervisor aguarda adequação ou registra decisão de prosseguir com NC. Líder não substitui supervisor na decisão excepcional de NC. TST e integrantes não liberam.
- Relatar adequação não remove NC. Cenário com TST retorna à reavaliação; cenário sem TST permite conferência da adequação pelo supervisor com evidência.
- Liberação sem NC aberta é distinta de decisão de prosseguir com NC. A resposta original, pareceres, evidências, conta fictícia e timestamp ficam preservados no histórico da simulação. Assunção registrada não vira conformidade técnica.
- Simulador em /permissoes-trabalho, com cenário TST disponível/ausente, item genérico, decisões, histórico e documento demonstrativo. O estado sintético é transportado no permalink da URL e processado pela Server Action; não é salvo em banco/arquivo. Reabrir a mesma URL mantém o ensaio; reiniciar ou abrir sem o parâmetro descarta. Nenhuma assinatura real/coleta de participação implementada.
- O item genérico NÃO é checklist técnico de trabalho em altura. Nenhum critério normativo foi criado, nem risco/controle inventado ou associado automaticamente ao PGR.
- Contrato JSON candidato atualizado para versão 2; não é migration ou concessão de papéis no runtime.

### Validação e limites

15 testes focados (8 motor + 7 vínculos) aprovados; primeira verificação TypeScript e ESLint aprovada. Resultados finais de build/UI abaixo.

Os papéis e escopos do motor são entradas do cenário; compará-los não autentica pessoas nem prova vínculo autoritativo. Ativação futura precisa derivar identidade/papel da sessão e fonte de grants por atividade, além de provar isolamento e trilha transacional. A presença/ausência de TST precisa vir de configuração confiável e auditada por escopo; a escolha do simulador não poderá liberar bypass no fluxo real.

Não há emissão operacional, liberação real, assinatura, PDF novo ou gravação de permissão. A pré-checagem de vínculos mantém canIssue:false. Preservação de NC e decisão declarada não atestam adequação técnica ou conformidade. Continuam pendentes campos/checklists técnicos do primeiro modelo, fontes aplicáveis e revisão responsável antes de ativação.

### Arquivos adicionais desta atualização

- examples/app/src/lib/work-permit-checklist-workflow.ts
- examples/app/src/app/permissoes-trabalho/workflow-preview.tsx
- examples/app/src/app/permissoes-trabalho/page.tsx
- examples/app/tests/work-permit-checklist-workflow.test.ts
- schemas/work-permit-workflow-candidate.json
- docs/PT_PTE_CHECKPOINT.md e docs/RETOMAR_PROJETO.md

### Roteiro humano

1. No simulador, manter TST disponível, selecionar NC e descrever situação fictícia. Enviar: deve aguardar TST, sem botão de decisão do supervisor.
2. Registrar reavaliação fictícia com NC permanece: deve voltar à decisão de campo.
3. Registrar decisão de prosseguir com NC e justificativa: documento deve manter NC aberta e o parecer anterior no histórico.
4. Reiniciar e testar Aguardar adequação: deve ficar sem liberação. Relatar adequação devolve ao TST; somente após reavaliação como corrigido fica disponível a decisão sem NC aberta.
5. Reiniciar e escolher empresa sem TST. NC deve ir ao supervisor; nenhuma avaliação de TST pode aparecer como existente. Conferência de adequação ou decisão com NC continuam separadas.
6. Recarregar: simulação deve ser descartada, sem registro operacional salvo.

**Aceite humano — 2026-10-24:** o usuário aceitou o fluxo do simulador em que uma NC persistente após reavaliação retorna ao supervisor. O supervisor pode aguardar adequação ou registrar decisão de prosseguir com NC e justificativa; o histórico/evidências permanecem e a decisão não transforma a NC em conformidade. Esse aceite cobre somente o fluxo demonstrativo. Não habilita contas reais, emissão operacional, assinaturas ou persistência e não substitui a fonte/revisão técnica do checklist de altura. Decisão registrada em `docs/DECISION_LOG.md`.

### Referência preliminar para trabalho em altura

- Jurisdição e referência indicadas pelo usuário: Brasil, NR-35.
- O usuário definiu que o supervisor de NR-35 designado pela empresa participa/preenche o campo de supervisor e é responsável pela revisão técnica. No protótipo, o vínculo será por referência a um funcionário da lista existente; os registros são fictícios, pessoa real não é requisito e nenhum funcionário deve ser selecionado automaticamente. O nome real/designação de produção pode permanecer pendente.
- O usuário escolheu campos de acompanhamento separados para treinamento NR-35 e treinamento focado em supervisão de trabalho em altura. O cadastro distingue `not_informed` de `reported_pending_validation`; o estado informado não é evidência, verificação ou validade do treinamento. Ambos começam como não informados, sem alterar ficticiamente nenhum funcionário. A preferência por treinamento focado é demonstrativa, não é afirmada como obrigação geral da NR-35 e não filtra/pré-seleciona o supervisor.
- Referência indicada pelo usuário: NR-35, com consulta à página oficial do MTE e à Portaria MTE nº 1.259/2026, apontada como alteração do Anexo III. Não é necessário registrar a data de vigência da NR-35.
- Consulta à [página oficial de Normas Regulamentadoras vigentes do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-35-nr-35): página atualizada em 24/07/2026, lista PDF da NR-35 rotulado “atualizada 2025” e aponta a Portaria MTE nº 1.259/2026 como alteração do Anexo III ([PDF oficial da Portaria](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2026-1/portaria-mte-no-1-259-alteracao-do-anexo-iii-da-nr-35.pdf/view)).
- A divergência sobre a Portaria nº 1.680 foi conferida em fontes oficiais do MTE: a [página de Portarias de 2025](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2025) lista a Portaria MTE nº 1.680, e o [PDF original](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2025/portaria-mte-no-1-680-aprova-o-anexo-escadas-nr-35.pdf/view) identifica “02 de outubro de 2025” e DOU de 03/10/2025. O art. 6º da [Portaria MTE nº 1.259/2026](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2026-1/portaria-mte-no-1-259-alteracao-do-anexo-iii-da-nr-35.pdf/view) está consistente com o original; o ano 2026 na ementa é erro material do PDF. O DOU não respondeu à consulta direta (HTTP 403), mas os originais e a alteração estão publicados pelo MTE. A data de vigência da NR-35 não precisa ser registrada.
- No mesmo PDF, arts. 1º a 5º incluem a regra de treinamento presencial e alteram dispositivos do Anexo III sobre escadas de uso individual; não converter esses trechos em checklist genérico de altura nem presumir uso de escada. O art. 8º concede prazo transitório de um ano para refazer/complementar treinamento inicial em certas situações; isso é distinto da revisão anual usual do checklist/PT informada pelo usuário e não foi tratado como validade geral de treinamento.
- Referência de pesquisa: NR-35 e Portaria MTE nº 1.259/2026, apontada na página oficial do MTE como alteração do Anexo III. A dúvida sobre o ano da Portaria nº 1.680 está resolvida por seu PDF original oficial: é de 2025; o ano 2026 na ementa da nº 1.259 é erro material. A regra alterada no art. 6º trata da não aplicação transitória de requisitos do Anexo III a escadas fixas verticais já instaladas ou projetos em andamento; essa divergência não impede avançar na estrutura genérica do protótipo, mas não permite afirmar a exceção para uma atividade concreta com essas escadas sem conferir o contexto. A data de vigência da NR-35 não é metadado requerido. Ainda falta revisão técnica humana antes de transformar qualquer conteúdo normativo em critério. Nome real do supervisor não bloqueia o protótipo; autoridade real permanece requisito para operação.
- O usuário esclareceu que “geralmente a revisão é de um ano” refere-se à periodicidade usual de revisão anual do checklist/PT, não à validade do treinamento do supervisor nem a prazo legal da NR-35. A revisão anual não substitui revisão quando houver mudança normativa ou operacional.
- Para avançar com o protótipo, não é necessário nome real: quando houver seleção, referenciar explicitamente um funcionário fictício já cadastrado, sem atribuição automática; a preferência por treinamento focado fica como atributo demonstrativo pendente, não como certificação declarada. Não manter bloqueio por ausência de data de vigência da NR-35. A divergência sobre a Portaria nº 1.680 foi resolvida com os documentos oficiais do MTE; permanece necessária a revisão humana do supervisor designado antes de definir critérios. Se o escopo futuro incluir escadas fixas verticais preexistentes/projetos em andamento, verificar especificamente a aplicabilidade da regra transitória, sem generalizá-la.
- Nenhum item técnico foi criado. A emissão permanece desabilitada.

### Ajuste de interação do simulador

A conferência inicial encontrou botões client-side sem transição observável no painel. Substituídos por formulário com Server Action autenticada (`pgr.manage`) e permalink para melhoria progressiva. A simulação continua sem persistência operacional; os dados fictícios passam pelo servidor local e voltam codificados no estado da URL. Histórico limitado e escopo fixo fictício; a action nunca usa a conta demo como líder/supervisor real nem concede grants. Arquivo: `examples/app/src/app/permissoes-trabalho/simular/actions.ts`. A UI exibe esta condição explicitamente.

### Validação técnica de retomada — 2026-10-24

- Testes focados de workflow, prontidão APR→PGR e estado do simulador: 19/19 aprovados.
- TypeScript (`node node_modules/typescript/bin/tsc --noEmit`): aprovado.
- ESLint focado nos módulos, rota, action e testes PT/PTE: aprovado.
- Build isolado (`SST_ISOLATED_BUILD=1`, `SST_BUILD_VERIFY_ID=pt-pte-20261024`): aprovado; `/permissoes-trabalho` e `/permissoes-trabalho/simular` incluídas. Permaneceu o aviso conhecido de padrão amplo de arquivos em `/api/health`.
- O build adicionou duas entradas temporárias ao `tsconfig.json`; elas foram removidas após a execução, preservando a lista anterior.
- O fluxo de NC persistente foi aceito em 2026-10-24, conforme registrado acima e em `docs/DECISION_LOG.md`. O supervisor no protótipo pode ser uma referência explícita a funcionário fictício existente, sem nome real e sem seleção automática; a preferência de treinamento focado é só atributo demonstrativo pendente. Para fechar critérios, ainda é necessário conferir no DOU a divergência interna do PDF/MTE e validar a consolidação aplicável; nenhum critério de altura foi criado e emissão continua desabilitada.

### Rascunhos PT/PTE no app — atualização 2026-10-27

- Os formulários demonstrativos de PTE e PT a quente permitem salvar, reabrir e atualizar rascunhos. O registro aceita vínculo opcional a uma APR existente; o servidor valida que a APR pertence ao tenant autenticado. O vínculo é uma referência, não importa riscos/respostas da APR nem avalia sua adequação.
- Com PostgreSQL configurado, a leitura e a gravação usam transações de tenant e a tabela `sst.work_permit_drafts`, com RLS forçada. A migração aditiva `0011_work_permit_drafts.sql` foi aplicada no banco local. Sem `PGPASSWORD`, permanece o JSON local como fallback demonstrativo. Não havia arquivo JSON anterior de rascunhos a importar.
- Os registros continuam marcados `draft_demo`. O formulário não emite PT/PTE, não libera atividade, não assina, não faz checklist técnico e não estabelece autoridade real. A revisão humana da fonte e dos critérios permanece pendente; não usar dados operacionais nesta etapa.
- TypeScript e ESLint focado passaram nesta atualização. O fluxo de salvamento não foi submetido a teste end-to-end nesta etapa.
- Em 2026-10-27, a migração `0012_work_permit_draft_revisions.sql` acrescentou numeração e snapshots imutáveis por salvamento, com RLS e vínculo tenant-scoped; o histórico aparece na tela. A migração foi aplicada no PostgreSQL local. TypeScript e ESLint focado passaram. Nenhum rascunho local anterior foi encontrado para importar.
- O formulário oferece ação explícita para copiar da APR vinculada apenas o contexto disponível (referência e, quando existentes, empresa, unidade/área e descrição da atividade) aos campos correspondentes. A pessoa revisa e pode editar os valores; riscos e controles da APR não são copiados automaticamente.
- A edição envia a revisão que foi aberta; se o registro já tiver uma versão mais nova, o salvamento concorrente é recusado e orienta a reabrir a versão atual. A verificação é feita no armazenamento e não depende do estado do navegador.
- Campos narrativos selecionados (descrição, registros, medições e observações) agora usam caixas de texto multilinha, preservando o limite de 3.000 caracteres; os demais continuam compactos. TypeScript e ESLint focado passaram.
- A exportação preenchida usando o layout dos Word-fonte não foi implementada nesta retomada: o renderizador do skill `documents` não encontrou LibreOffice, então não foi possível revisar visualmente os modelos antes de produzir uma saída Word fiel.

### Validação de armazenamento local — 2026-10-28

- Adicionado `examples/app/tests/work-permit-draft-store.test.mjs`: criação demonstrativa, isolamento de leitura/escrita entre tenants, evolução de revisão com autoria e recusa de edição obsoleta/modelo divergente. Usa apenas dados sintéticos em diretório temporário dentro do projeto, removido ao finalizar. Transações PostgreSQL são bloqueadas no teste.
- Ajustadas as expectativas do catálogo em `tests/work-permit-readiness.test.ts` à numeração já existente na interface (01 a 07), sem alterar o catálogo.
- Comando Node com loader do projeto e os cinco arquivos de teste PT/PTE: 33/33 testes aprovados. ESLint dos dois arquivos alterados e `node node_modules/typescript/bin/tsc --noEmit`: aprovados.
- A primeira execução no Temp do Windows falhou com EPERM em rename; o ensaio passou ao usar pasta temporária no workspace. A verificação cobre somente o armazenamento JSON demonstrativo, não comprova PostgreSQL, autorização das actions ou fluxo pela interface. Nenhum banco persistente ou rascunho existente foi alterado.
- LibreOffice continua ausente no PATH. Exportação Word, revisão visual e teste end-to-end seguem pendentes; próxima etapa recomendada: validar o fluxo pela interface e o caminho PostgreSQL em ambiente isolado.

### Prova PostgreSQL descartável — 2026-10-28

- Novo verificador: `examples/app/scripts/verify-work-permit-drafts-isolated.mjs`. Comando: `node scripts/verify-work-permit-drafts-isolated.mjs`.
- Resultado: 10/10 verificações aprovadas em PostgreSQL 17 temporário; container removido ao finalizar. Aplicadas somente as migrações reais 0011/0012, com dependências mínimas sintéticas (schema, papel sem bypass de RLS e tenants).
- Verificados: snapshot na migração de registro preexistente, isolamento de leitura e atualização, recusa de inserção de histórico em outro tenant, duas edições simultâneas com exatamente uma vencedora, preservação das revisões, bloqueio de exclusão pelo papel da aplicação, gatilhos contra alteração/exclusão privilegiada, reversão da atualização quando o histórico falha e RLS forçada nas duas tabelas.
- Esta prova executa SQL diretamente; não valida sessão web, actions, funções do store, integração com APR nem a cadeia completa de migrações. Nenhum banco persistente foi usado pela prova. Próxima etapa: validação autenticada pela interface e cobertura do store PostgreSQL.

### Store PostgreSQL e coerência de autoria — 2026-10-28

- O verificador isolado agora importa as funções reais de `work-permit-draft-store.ts`, substituindo somente a fronteira de sessão/transação e a descoberta do pool por contexto fictício explícito. As consultas do store e as políticas PostgreSQL são reais; não há autenticação web nessa prova.
- A prova de criação falhou inicialmente: `created_by` aceitava o parâmetro da chamada enquanto `actor_user_id` do histórico usava o contexto servidor. Corrigidos `created_by` e `updated_by` no caminho PostgreSQL para usar `context.userId`, como o histórico. As actions já enviavam o usuário da sessão; o reforço garante coerência dentro do store. O fallback JSON demonstrativo mantém seu contrato anterior.
- Após a correção: `node scripts/verify-work-permit-drafts-isolated.mjs` passou em 16/16 verificações; container removido. Inclui autoria divergente no parâmetro, criação, leitura/reabertura/listagem, isolamento entre tenants, duas edições simultâneas com uma vencedora, histórico e recusa de versão obsoleta/modelo divergente. As dez provas SQL anteriores foram mantidas.
- Regressão: os cinco arquivos de teste PT/PTE passaram (33/33). `node --check scripts/verify-work-permit-drafts-isolated.mjs` aprovado. A validação autenticada pela interface, integração APR e cadeia completa de migrações continuam pendentes. Nenhum banco persistente ou dado existente foi alterado nesta etapa.

### Aceite do reforço de autoria — 2026-10-28

- Usuário respondeu “aprovado” após a correção da autoria no store PostgreSQL e os resultados de 16/16 verificações isoladas e 33/33 testes PT/PTE. Aceite registrado para o comportamento estrutural dos rascunhos e a coerência de autoria; não ativa modelo, não valida conteúdo técnico e não libera emissão operacional.
- A execução conjunta de TypeScript e ESLint ainda não havia retornado ao receber o aceite; não registrar essas verificações como aprovadas nesta etapa até obter resultado.

### Validação autenticada pela interface — 2026-10-28

- A execução pendente de TypeScript e ESLint da etapa de autoria terminou com código 0, sem erros.
- Pela sessão demo existente de Horizonte SST, criado o rascunho `TESTE UI 2026-10-28 · PTE fictícia` (ID `8f89976e-8853-451d-bfda-b145990d3fca`), sem APR vinculada. Foram usados somente empresa e atividade sintéticas. O registro foi mantido para conferência, com duas revisões; nenhum registro anterior foi editado.
- Confirmados no navegador: salvar com mensagem de sucesso; reabrir com valores e quebra de linha preservados; atualizar para revisão 2; recusar salvamento da revisão 1 aberta em segunda aba com mensagem para reabrir a versão atual; recarregar e preservar os dados vencedores e o histórico de versões 1 e 2. A aba secundária foi fechada.
- Corrigido o aviso do formulário em `src/app/permissoes-trabalho/work-permit-source-form-preview.tsx`: removida a afirmação desatualizada de armazenamento sempre em JSON. O texto agora descreve o rascunho demonstrativo no servidor e seu histórico, mantendo o aviso de dados fictícios e ausência de liberação. Texto atualizado conferido no navegador.
- Evidência: `docs/PT_PTE_UI_VALIDACAO_2026-10-28.png`. Esta validação cobre a PTE sem vínculo com APR na sessão demo existente; não testa identidade de líder/supervisor, assinatura real, conteúdo técnico, isolamento entre contas pelo navegador nem o formulário a quente.
- Próximo passo recomendado: repetir o percurso no formulário de trabalho a quente e validar erros de preenchimento. A exportação Word continua pendente do renderizador e da revisão visual dos modelos-fonte.

### Aceite da validação de PTE pela interface — 2026-10-28

- Usuário respondeu “aprovado” após a apresentação da evidência visual do histórico e da validação de salvar, reabrir, atualizar e recusar edição desatualizada da PTE fictícia.
- Aceite restrito ao comportamento estrutural demonstrado e à correção do aviso de armazenamento. Não constitui revisão técnica do formulário, ativação de modelo, assinatura ou liberação operacional.
- Próxima etapa: validar o formulário de trabalho a quente e os erros de preenchimento.
- ESLint focado em `work-permit-source-form-preview.tsx` concluído com código 0, sem erros.

### Validação de trabalho a quente pela interface — 2026-10-28

- Na sessão demo existente, testado o formulário `hot-work-composite` sem vínculo com APR. O título vazio foi bloqueado pelo navegador com “Preencha este campo.” (`validity.valueMissing=true`). Com apenas título, o servidor retornou “Preencha ao menos um campo antes de salvar o rascunho.”; nenhum registro foi criado nessas tentativas.
- Criado `TESTE UI 2026-10-28 · PT a quente fictícia`, ID `3ba6437e-189c-424d-935f-f9f385e349a4`, com empresa e atividade sintéticas. Mensagem de sucesso confirmada; reabertura preservou os campos e a quebra de linha. Atualização acrescentando observação fictícia produziu revisão 2 e histórico visível com versões 1 e 2.
- O rascunho de teste foi mantido para conferência; o rascunho de PTE anterior permaneceu na revisão 2. Nenhuma APR, assinatura, liberação ou parâmetro técnico foi criado. Não houve mudança de código nesta etapa; validação manual pelo navegador.
- Evidência visual: `docs/PT_QUENTE_UI_VALIDACAO_2026-10-28.png`. Limites: não foram testados vínculo com APR, outra conta/perfil pelo navegador, limites de 3.000 caracteres nem revisão técnica dos campos. O conflito entre versões já foi exercitado na PTE e no store PostgreSQL isolado.
- Próxima etapa recomendada: cobertura automatizada da action de salvamento para entradas inválidas, ausência de autorização e APR de outro tenant, sem inserir modelos ou dados operacionais. Exportação Word continua pendente do renderizador e da revisão visual dos modelos-fonte.

### Validação automatizada da action de rascunhos — 2026-10-28

- Adicionado `examples/app/tests/work-permit-draft-action.test.mjs`, que executa a action real com fronteiras simuladas de sessão, persistência, auditoria e cache. Não acessa banco nem altera rascunhos existentes; não é prova de autenticação HTTP ou das regras internas do provedor de sessão.
- Cobertura: sessão ausente/contexto sem autorização; modelo desconhecido; título vazio; campos desconhecidos, em branco ou acima de 3.000 caracteres; arquivo em campo textual; identificador APR inválido; APR de outro tenant; edição sem revisão válida/ID longo; autoria e tenant obtidos da sessão; limite aceito de 3.000 caracteres; vínculo APR do mesmo tenant; edição concorrente recusada sem auditoria/cache de sucesso. Entradas recusadas são conferidas sem chamada de escrita.
- Dois testes falharam antes da correção: arquivo enviado num campo de texto era ignorado; APR com ID acima do limite era convertida silenciosamente para ausência de vínculo. Corrigida `src/app/safety-operations-actions.ts` para rejeitar ambas as entradas, incluindo APR enviada como arquivo, antes de chamar o store.
- Comando: `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test` com os seis arquivos `work-permit-{draft-action,draft-store,readiness,simulation-state,checklist-workflow,candidate-contract}.test.*`: 44/44 aprovados. `node node_modules/typescript/bin/tsc --noEmit` e ESLint focado na action/teste: código 0, sem erros.
- Não foram criadas APRs, assinaturas, permissões ou dados operacionais. Próxima etapa recomendada: conferir a trilha de auditoria dos salvamentos fictícios existentes e a legibilidade da identificação de eventos no painel. Exportação Word permanece pendente do renderizador e da revisão visual dos modelos-fonte.

### Identificação de PT/PTE na auditoria — 2026-10-28

- `src/lib/safety-audit-labels.ts` passou a traduzir `safety.work_permit_draft_saved` para “Rascunho demonstrativo de PT/PTE salvo”. Antes, o evento já era registrado, mas não tinha rótulo específico nessa função. Histórico persistido não foi reescrito.
- `tests/audit-log-labels.test.ts` cobre o rótulo. Comando Node com loader do projeto e os testes de rótulos + action: 12/12 aprovados. TypeScript `--noEmit` e ESLint dos dois arquivos alterados concluídos com código 0.
- Conferido pelo navegador em `/?section=auditoria`: quatro salvamentos fictícios anteriores (duas revisões de PTE e duas de PT a quente) aparecem com rótulo legível, papel da conta fictícia e data/hora. Nenhum novo salvamento foi necessário. Evidência: `docs/PT_PTE_AUDITORIA_VALIDACAO_2026-10-28.png`.
- Limite: o painel ainda não discrimina qual rascunho/revisão gerou cada salvamento. O evento guarda `targetId`, mas a apresentação atual não o mostra. A auditoria local continua em JSONL, separada da transação PostgreSQL do rascunho; esta etapa não altera persistência nem garante atomicidade entre os dois registros.
- Próxima etapa recomendada: permitir identificar/abrir o rascunho relacionado a partir da auditoria, resolvendo o alvo somente entre rascunhos da consultoria autenticada, sem expor alvo de outro tenant. Não há liberação operacional nem revisão técnica associada ao rótulo.

### Abrir rascunho pela auditoria — 2026-10-28

- Criado `src/lib/work-permit-audit-targets.ts`: resolve evento e alvo pelo mesmo tenant, aceita somente os dois mapas demonstrativos existentes, codifica o ID no link e entrega ao navegador apenas campos de apresentação. Alvo ausente, evento estrangeiro, modalidade desconhecida ou alvo de outro tenant ficam sem título/link.
- `src/app/page.tsx` consulta rascunhos apenas com permissões de auditoria e `pgr.manage`, quando há evento PT/PTE. Falha de consulta preserva os eventos sem links e informa indisponibilidade. `src/app/dashboard.tsx` apresenta “Abrir versão atual · [título]”. A rota de destino mantém sua própria checagem de acesso/tenant; o link não concede autorização.
- `tests/work-permit-audit-targets.test.ts` protege vínculo válido, ausência, isolamento, modalidade, codificação e não mutação dos dados. Testes focados (alvos + rótulos): 4/4 aprovados. TypeScript `--noEmit` e ESLint dos quatro arquivos de código/teste: concluídos com código 0.
- Pelo navegador, os quatro eventos existentes identificaram corretamente os dois rascunhos fictícios. Clicar no vínculo de trabalho a quente abriu seu formulário com os dados atuais da revisão 2. Nenhum rascunho foi salvo nesta etapa. Consultar o painel continua podendo registrar os eventos de leitura habituais dos demais módulos.
- Evidência: `docs/PT_PTE_AUDITORIA_LINKS_2026-10-28.png`. O título exibido é o atual e o link abre a versão atual; não é reconstrução do snapshot histórico do evento. A atomicidade entre auditoria JSONL e salvamento PostgreSQL continua pendente, assim como revisão técnica, assinaturas e emissão.
- Próxima etapa recomendada: consulta somente leitura de uma revisão específica do rascunho, preservando o isolamento de tenant e distinguindo versão histórica de edição atual.

### Consulta histórica somente leitura — 2026-10-28

- Nova página `src/app/permissoes-trabalho/historico/page.tsx`, acessível pelos links “Consultar versão N” no histórico da página PT/PTE. Exige sessão com `pgr.manage`, deriva tenant da sessão e apresenta somente os campos salvos naquela revisão, com quebra de linha preservada. Edição está em link separado para a versão atual. Não há formulário de salvamento na consulta histórica.
- `src/lib/work-permit-draft-store.ts` oferece `getWorkPermitDraftRevision`, com consulta parametrizada por tenant, rascunho e revisão na tabela já existente. Recusa revisão não inteira, não positiva ou acima do limite PostgreSQL. Não aplica migração nem reescreve snapshots PostgreSQL existentes.
- Novos salvamentos no fallback JSON passam a guardar snapshot do conteúdo junto aos metadados da revisão. Entradas legadas sem snapshot permanecem indisponíveis para consulta histórica; não são reconstruídas a partir dos dados atuais.
- Testes focados de store/action: 18/18 aprovados, incluindo retenção do conteúdo original, isolamento de tenant, revisão ausente/inválida, cópia defensiva e ausência de conteúdo legado. Verificador PostgreSQL descartável ampliado: 18/18 aprovados, incluindo leitura das revisões 1/2 e recusa de outro tenant/revisão ausente; container removido. TypeScript `--noEmit` e ESLint dos cinco arquivos alterados/criados: código 0.
- Navegador: aberto “Consultar versão 1” da PT fictícia existente; mostrou os dois campos originais, sem a observação da versão 2 e com zero campos de texto editáveis. Evidência `docs/PT_PTE_HISTORICO_V1_2026-10-28.png`. Nenhum rascunho do painel foi salvo nesta etapa.
- Limites: rótulos/seções vêm do mapa atual; não há snapshot histórico do layout do formulário nem do conteúdo de APR referenciada. Auditoria JSONL continua separada da transação PostgreSQL. Não houve revisão técnica, assinatura ou emissão operacional.
- Próxima etapa recomendada: comparação somente leitura entre duas revisões salvas do mesmo rascunho, destacando campos alterados sem inferir avaliação técnica.

### Aceite da consulta histórica — 2026-10-28

- Usuário respondeu “aprovado” após a demonstração de “Consultar versão”, preservação do conteúdo original e separação da edição atual, com evidência visual e verificações registradas acima.
- Aceite restrito ao comportamento estrutural de consulta histórica somente leitura. Não valida conteúdo técnico, referências normativas, assinaturas ou emissão operacional.
- Próxima etapa recomendada: comparação somente leitura de duas revisões do mesmo rascunho, destacando campos alterados sem avaliação técnica automática.

### Ponto de retomada — próxima sessão

- Código do app: `examples/app/src/app/permissoes-trabalho/work-permit-source-form-preview.tsx`, `examples/app/src/app/permissoes-trabalho/page.tsx`, `examples/app/src/app/safety-operations-actions.ts` e `examples/app/src/lib/work-permit-draft-store.ts`.
- Migrações locais `0011_work_permit_drafts.sql` e `0012_work_permit_draft_revisions.sql` aplicadas. TypeScript e ESLint focado aprovados após as alterações mais recentes. Não houve teste end-to-end nem revisão visual da página.
- Primeiro passo: conferir se o runtime oferece `soffice.exe`/LibreOffice. O caminho do renderizador espera LibreOffice no Windows; a busca no runtime empacotado e no PATH não encontrou executável, e não havia sessão Word conectada. Não instalar software nem alterar os Word-fonte nesta retomada sem autorização específica.
- Se o renderizador estiver disponível, renderizar e inspecionar todas as páginas dos Word-fonte de PTE e PT a quente, distilar seus slots de preenchimento e então planejar a exportação preservando os modelos. Caso contrário, manter a exportação Word pendente e continuar melhorias do app sem declarar os rascunhos como permissões operacionais.

### Comparação de revisões — 2026-10-29

- Adicionado acesso à comparação a partir do histórico do rascunho. A comparação somente leitura inclui título, identificador da APR vinculada e campos alterados ou removidos; mantém quebras de linha e identifica campos legados pelo nome da chave, pois o rótulo usa o mapa atual.
- A consulta de ambas as versões segue escopada pelo tenant autenticado; versão idêntica, ausente, inválida, sem snapshot histórico ou de outro tenant resulta em comparação indisponível. A comparação não consulta o conteúdo da APR, não grava e não representa avaliação técnica ou liberação.
- Ajustada a permissão digitada incorretamente em `api/workers/import-pdf/route.ts` de `worker.manage` para `workers.manage`, nome definido no catálogo RBAC existente.
- Verificações: 24 testes PT/PTE passaram; ESLint focado passou. TypeScript `--noEmit` e ESLint focado repetidos após a correção RBAC concluíram com código 0. O navegador integrado recusou `localhost` e o controle visual do Edge foi interrompido pelo limite de política de URL; não há revisão visual desta alteração.
- Exportação Word continua pendente: LibreOffice não está disponível no PATH. Próximo: confirmar o resultado das verificações ainda em execução e realizar revisão visual local pela interface quando disponível. Nenhum rascunho, modelo normativo, assinatura ou liberação foi criado nesta etapa.

### Importação inicial de PGR de cliente — 2026-10-29

- O envio de PDF no cadastro de empresa preenche automaticamente os campos reconhecidos com segurança: razão social, nome fantasia somente quando identificado por rótulo explícito, CNPJ, nome da unidade e cidade/UF. Os campos permanecem editáveis para conferência antes de salvar a empresa.
- Riscos extraídos aparecem como sugestões para revisão humana. Removida a rotina sem uso que convertia cargo/função em risco, para não tratar dados cadastrais como avaliação de risco. Quando nenhum risco é reconhecido, a tela avisa e não inventa exemplos.
- A rota limita o envio a PDFs de até 25 MB e confere assinatura `%PDF-`. `pdf-parse@1.1.1` foi incluído em `examples/app/package.json` e no lockfile; a extração roda localmente, sem serviço de IA ou créditos de API.
- Limites: PDFs digitalizados sem texto selecionável não passam por OCR e podem não preencher os campos; os dados extraídos devem ser conferidos. Nesta etapa inicial ainda não havia validação com documento real nem revisão visual do fluxo.
- Próximo passo: validar com um PGR de referência autorizado e ajustar padrões de preenchimento com dados fictícios/sanitizados.

- Verificação desta etapa: TypeScript --noEmit e ESLint focado nos arquivos do importador concluíram com código 0. Não foi feita validação com PGR de cliente nem teste visual.

### Continuação do preenchimento de inventário via PGR — 2026-10-29

- O fluxo da seção PGR passa os dados reconhecidos para o editor do inventário estruturado: título, atividade e perigo dos riscos encontrados, possíveis agravos e medidas existentes. Itens recebem estado “Relatado”; processo, circunstância, exposição e avaliação ficam para preenchimento/revisão humana. Plano de ação e contexto geral permanecem obrigatórios e sem inferência.
- Empresa/unidade são pré-selecionadas apenas quando o CNPJ do PDF corresponde ao CNPJ de unidade ativa. Sem correspondência, a equipe seleciona manualmente. O editor abre em rascunho, sem gravar até ação explícita “Criar inventário”.
- TypeScript `--noEmit` e ESLint focado nos componentes do importador/inventário concluíram com código 0. Não foi usado nem inspecionado PDF de cliente nesta etapa; nenhuma validação visual foi realizada.

### Ajuste ao PGR indicado pelo usuário — 2026-10-29

- Usuário indicou `C:\Users\elias\OneDrive\Desktop\EMPRESA\PGR - 2026.pdf` como referência. O arquivo foi lido localmente para conferir a extração; não foi enviado pela rota do app, não foi vinculado a inventário e não houve gravação em banco.
- O parser agora ordena os itens PDF por posição para remontar linhas/tabelas, usa CNPJ somente quando aparece após rótulo CNPJ e interpreta os blocos “Perigos / fatores de riscos e riscos” deste formato. No documento de 240 páginas, identificou a razão social, um CNPJ e 153 registros de perigo. A prévia leva até 80 registros e apresenta aviso de limite. Unidade não foi identificada com confiança e fica para seleção/preenchimento manual.
- Perigos, circunstâncias, agravos e medidas encontrados são relatados como sugestões. A probabilidade/severidade/classificação do documento não viram avaliação automática no SST Hoje; os demais 73 registros devem ser conferidos/completados a partir do PGR original.
- Inspeção visual somente das páginas 14–16 confirmou o arranjo das tabelas usado para ajustar a extração; não representa revisão técnica do conteúdo nem inspeção visual integral das 240 páginas.
- TypeScript `--noEmit` e ESLint focado nos arquivos do importador/inventário concluíram com código 0. Nenhum PDF foi carregado pelo painel nesta etapa.
