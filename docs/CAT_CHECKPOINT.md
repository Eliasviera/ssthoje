# CAT — checkpoint de fluxo e escopo

Documento de apoio. **Não é regra implementada**: descreve o fluxo proposto para a emissão de CAT pelo SST Hoje, as fontes normativas usadas e o que ainda depende de decisão do usuário. Nenhuma linha de código de CAT existe no app nesta data.

## 1. Base normativa consultada

| Fonte | O que foi usado |
| --- | --- |
| Lei nº 8.213/1991, art. 22 (redação da LC 150/2015) | Obrigação de a empresa comunicar acidente até o **primeiro dia útil seguinte**; em caso de morte, **de imediato**. Legitimados subsidiários em caso de omissão: o próprio acidentado, seus dependentes, o sindicato da categoria, o médico que o assistiu ou qualquer autoridade pública. |
| Portaria SEPRT nº 4.334/2021 | CAT cadastrada **exclusivamente em meio eletrônico**: pelo eSocial (empregador/OGMO/órgão público, quando obrigados ao S-2210) ou pela aplicação da Previdência (CATWeb) para os demais legitimados. |
| Leiaute eSocial **S-2210** (Manual de Orientação do eSocial) | `tpCat`: **1 = Inicial**, **2 = Reabertura**, **3 = Comunicação de óbito**. No eSocial o **número da CAT é o número do recibo do evento**; reabertura e óbito referenciam a CAT de origem. Óbito imediato é CAT inicial com indicador de óbito. |
| Formulário CATWeb (`cadastrocat.inss.gov.br`) | Mesmos três tipos; usado por quem não transmite pelo eSocial. |

Consequência do descumprimento citada nas fontes: multa administrativa (art. 22 da Lei 8.213/91 e art. 286 do Decreto 3.048/99). O sistema **não** calcula nem aplica multa; apenas sinaliza prazo e pendência.

> Regra do projeto: nenhuma constante normativa (prazo, código, tabela) entra no código sem fonte, versão, vigência e responsável registrados aqui e em `DECISION_LOG.md`.

## 2. O que o SST Hoje é e não é neste fluxo

- **É** quem registra o acidente, organiza as informações, monta a CAT completa, controla prazo, versões e pendências, e guarda o histórico.
- **Não é** o empregador: a obrigação legal é da empresa cliente. O sistema não substitui o eSocial nem o CATWeb.
- **Não** valida nexo causal, incapacidade, CID correto ou concessão de benefício — isso é INSS.
- **Não** transmite ao eSocial: a decisão de 2026-11-12 é apenas **montar** a CAT; a transmissão é feita pelo cliente no canal oficial.

## 3. Fluxo proposto

1. **Registro do acidente** — evento próprio (não confundir com desvio/quase incidente; pode haver vínculo opcional "originado do desvio X").
   - Dados mínimos: trabalhador (do cadastro), data e hora, tipo (típico / trajeto / doença relacionada ao trabalho), local, descrição do ocorrido, houve afastamento, último dia trabalhado, houve óbito.
2. **Qualificação** — define o tipo de CAT: inicial, reabertura (vinculada a CAT anterior) ou comunicação de óbito (vinculada ou não).
3. **Dados do atestado médico** — médico, CRM/UF, data do atendimento, CID, dias de afastamento informados. Preenchidos por quem tem o atestado em mãos (médico do trabalho ou TST), com registro de quem informou.
4. **Revisão** — tela de conferência com os campos obrigatórios, aviso de prazo (primeiro dia útil seguinte; óbito imediato) e bloqueio de envio enquanto faltar campo obrigatório.
5. **Emissão** — gera o documento "CAT — dados para transmissão" (imprimível) + checklist do que fazer no canal oficial, e registra no histórico: rascunho → revisada → transmitida.
6. **Fechamento do registro** — guarda o número informado (recibo do eSocial ou número do CATWeb), o canal usado, data/hora da transmissão e quem transmitiu. Sem esse dado, o evento fica com estado **"transmitida fora do sistema — número pendente"** e aparece na lista de pendências.
7. **Reabertura / óbito** — novo evento vinculado à CAT original, referenciando o número anterior.

### Campos coletados (conferir no MOS vigente antes de implementar)

| Grupo | Campos |
| --- | --- |
| Empregador | CNPJ/CPF/CAEPF, razão social, CNAE (herdados do cadastro da empresa/unidade) |
| Trabalhador | nome, CPF, NIS/PIS/PASEP, matrícula, data de nascimento, categoria (empregado, estagiário, avulso) |
| Acidente | data, hora, tipo (típico/trajeto/doença), local, descrição, agente causador, natureza da lesão, parte do corpo atingida, houve afastamento, último dia trabalhado, iniciativa da CAT (empregador/judicial/fiscalização) |
| Óbito | indicador de óbito, data do óbito |
| Atestado | médico, CRM/UF, data do atendimento, **CID**, dias de afastamento |
| CAT anterior | número do recibo/número da CAT de origem (reabertura e óbito) |

**CID é dado pessoal sensível de saúde (LGPD, art. 5º, II)** — acesso restrito e auditado, nunca em listagens abertas nem em relatório de leitura ampla.

## 4. Decisões aceitas em 2026-11-12

As quatro recomendações abaixo foram aceitas pelo usuário nesta data e estão registradas em `DECISION_LOG.md`.

1. **Canal — só montar.** O sistema monta a CAT completa, gera o documento para transmissão e o checklist do canal oficial (eSocial ou CATWeb). **Quem transmite é o cliente.** Sem certificado digital, sem procuração e sem responsabilidade de transmissão nesta etapa.
2. **Quem declara — representante legal da empresa cliente**, com identidade autenticada registrada (usuário, data e hora) e auditoria. A consultoria não declara em nome do cliente nesta etapa.
3. **Acesso ao CID e ao atestado — restrito** a médico do trabalho, TST responsável e admin, com auditoria de leitura. Nada de CID em listagem aberta, relatório amplo ou exportação irrestrita.
4. **Registro do acidente — módulo próprio de acidentes**, com vínculo opcional ao desvio de origem. Acidente com CAT não se mistura com quase incidente.

### Ainda pendente

- **Retenção**: prazo de guarda de CAT, CID e atestado, e quem aprova a regra (depende de `OPEN_QUESTIONS` 14 e 17).
- **Transmissão pelo sistema**: não é escopo agora; se um dia for, exige certificado/procuração do empregador e responsabilidade técnica explícita.
- **Formato do documento gerado** (impresso/PDF pelo navegador, no padrão dos demais relatórios do app) — a definir na implementação.

### Efeito no estado do registro

Sem transmissão pelo sistema, o evento de acidente guarda o canal usado e o número informado (recibo do eSocial ou número do CATWeb). Enquanto o número não for informado, fica com estado **"transmitida fora do sistema — número pendente"** e aparece na lista de pendências. O custo de acidente funciona normalmente nesse estado.

## 5. Caminho para transmissão futura (certificado do cliente)

O usuário informou em 2026-11-12 que terá assinatura digital própria no futuro e que **as empresas clientes já possuem certificado**, pedindo que o caminho fique definido desde já. Regra de ouro: **o SST Hoje nunca armazena arquivo `.pfx`, senha ou PIN de certificado de cliente.**

### O que o eSocial exige (MOS, item 8.2.1.1)

- Transmissão por webservice exige certificado **ICP-Brasil série A, tipo A1 ou A3**, do tipo **e-CPF** ou **e-CNPJ**.
- São dois usos distintos: o certificado do **transmissor** (tráfego) e o certificado que **assina o evento** (declarante ou procurador).
- **Procuração eletrônica no e-CAC** permite que um procurador (por exemplo, a contabilidade ou a consultoria) transmita e assine em nome do CNPJ do cliente usando o **próprio** certificado — é assim que escritórios contábeis operam hoje.
- Acesso aos módulos web usa conta gov.br; o CATWeb é o canal de quem não transmite pelo eSocial. Nada disso exige que o sistema guarde chave privada.

### Três modos previstos (o sistema suporta os três, um por empresa)

| Modo | Como funciona | Custódia da chave | Quando usar |
| --- | --- | --- | --- |
| **A — Agente local do cliente** | O SST Hoje gera o evento; um agente instalado na máquina do cliente assina (A1 ou token A3) e transmite. O sistema recebe de volta o recibo. | Nenhuma (chave fica no cliente) | Cliente quer controlar a chave; certificado A3/token |
| **B — Consultoria como procuradora** | A empresa outorga procuração eletrônica no e-CAC à consultoria; a consultoria transmite com o certificado dela. | Nenhuma (chave é da consultoria) | Consultoria que já faz folha/eSocial do cliente |
| **C — Certificado em nuvem da AC** | O sistema chama a API de assinatura do provedor de certificado; a chave nunca sai do provedor. | Nenhuma (chave é da AC) | Cliente usa certificado em nuvem; exige contrato e avaliação de fornecedor |

### Cadastro necessário por empresa (quando implementar)

- **Perfil de transmissão**: modo (A/B/C), titular (CNPJ do estabelecimento ou CPF do procurador), tipo de certificado, validade, status.
- **Procuração**: número/identificador, escopo (eSocial), vigência, quem outorgou e documento de comprovação — com alerta de vencimento.
- **Auditoria por envio**: quem transmitiu, quando, qual evento, número do recibo e hash do conteúdo enviado.
- **Estabelecimento correto**: a CAT é do estabelecimento (CNPJ) onde o trabalhador está vinculado — casa com o cadastro de unidades que já existe.

### Observação sobre fornecedor

Não há provedor de assinatura ICP-Brasil no catálogo de integrações consultado; quando o modo C for avaliado, a escolha deve ser feita diretamente com uma Autoridade Certificadora brasileira, comparando custódia, SLA e responsabilidade. Nada foi contratado.
## 6. Ligação com custo de acidente

A CAT não carrega valor monetário. O custo se pendura no **evento de acidente**: dias de afastamento × custo-dia (salário + encargos, ver decisão de 2026-11-12), despesas médicas, substituição, treinamento, danos. Enquanto a CAT for emitida fora do sistema, o evento existe do mesmo jeito, com o número marcado como pendente — **o custo não fica bloqueado**.
