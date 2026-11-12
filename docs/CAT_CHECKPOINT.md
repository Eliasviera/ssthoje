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
- **Não** transmite ao eSocial nesta etapa (ver item 4, decisão pendente).

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

## 4. Decisões pendentes do usuário

1. **Canal**: o sistema apenas monta a CAT e o cliente transmite (eSocial/CATWeb), ou haverá transmissão pelo sistema? Transmitir exige certificado digital/procuração do empregador e assume responsabilidade técnica pela informação — custo e risco altos. **Recomendação: começar pelo caminho "monta + checklist + registro do número", sem transmissão.**
2. **Quem assina/declara**: representante legal da empresa cliente (recomendado, é quem tem a obrigação) ou a consultoria com procuração formal? O sistema deve registrar identidade autenticada de quem declarou.
3. **Quem vê CID e dados do atestado**: restrito a médico do trabalho/TST responsável + admin (recomendado), ou mais amplo?
4. **Registro do acidente**: módulo próprio (recomendado) ou extensão do módulo de desvios?
5. **Retenção**: por quanto tempo guardar CAT, CID e atestado, e quem aprova a regra? (depende de `OPEN_QUESTIONS` 14 e 17)

## 5. Ligação com custo de acidente

A CAT não carrega valor monetário. O custo se pendura no **evento de acidente**: dias de afastamento × custo-dia (salário + encargos, ver decisão de 2026-11-12), despesas médicas, substituição, treinamento, danos. Enquanto a CAT for emitida fora do sistema, o evento existe do mesmo jeito, com o número marcado como pendente — **o custo não fica bloqueado**.
