# NR-5 (CIPA) — análise completa da norma e o que ela exige do sistema

**Data:** 2026-11-04
**Fonte oficial:** `docs/fontes-normativas/NR-05-atualizada-2022.pdf`
- NR-05 atualizada 2022, título alterado pela **Portaria MTP nº 4.219, de 20/12/2022**
- SHA-256 do arquivo: `c05059a8423db7dc334fe97813b5833009b1310d05d32331494180b7372a6c55`
- Link: gov.br → MTE → CTPP → Normas Regulamentadoras → arquivos → `nr-05-atualizada-2022.pdf`

O PDF foi baixado e lido integralmente (14 páginas). O texto abaixo é **resumo técnico de
levantamento**, não substitui a norma.

---

## 1. Estrutura da norma (sumário oficial)

| Item | Tema |
|---|---|
| 5.1 | Objetivo |
| 5.2 | Campo de aplicação |
| 5.3 | Atribuições |
| 5.4 | Constituição e estruturação |
| 5.5 | Processo eleitoral |
| 5.6 | Funcionamento |
| 5.7 | Treinamento |
| 5.8 | CIPA das organizações contratadas para prestação de serviços |
| 5.9 | Disposições finais |
| Anexo I | CIPA da Indústria da Construção |

---

## 2. O que a norma exige — e o que isso vira no sistema

### 2.1 Constituição (5.4)

| Exigência | Item | Vira no sistema |
|---|---|---|
| CIPA por **estabelecimento**, com representantes da organização e dos empregados | 5.4.1 | CIPA por unidade, nunca por empresa |
| Dimensionamento pelo **Quadro I** | 5.4.1 | Catálogo `nr5_dimension_bands` ✅ implementado |
| Regime sazonal: média aritmética do ano civil anterior | 5.4.2 | Campo de regime + cálculo da média |
| Representantes da organização **designados** | 5.4.3 | Tipo de composição `designado` |
| Representantes dos empregados **eleitos em escrutínio secreto** | 5.4.4 | Módulo eleitoral |
| Presidente designado pela organização; vice escolhido entre os eleitos titulares | 5.4.5 | Papéis: presidente / vice-presidente |
| Mandato de **1 ano**, permitida **1 reeleição** | 5.4.6 | `term` com início/fim + controle de reeleição |
| Posse no **primeiro dia útil** após o término anterior | 5.4.7 | Data de posse e validação |
| Cópias das atas de eleição e posse aos membros | 5.4.8 | Geração de documento a partir da ata |
| Documentação eleitoral ao sindicato em até **10 dias** quando solicitada | 5.4.9 | Prazo + registro de envio |
| **Proibido reduzir** representantes ou desativar CIPA antes do fim do mandato | 5.4.10 | Bloqueio de redução em runtime |
| Vedado alterar atividades ou transferir o eleito sem anuência | 5.4.11 | Registro de ocorrência |
| **Estabilidade**: vedada dispensa arbitrária do eleito para cargo de direção, da candidatura até **1 ano após o fim do mandato** | 5.4.12 | `stability_until` + alerta |
| Estabelecimento fora do Quadro I e sem SESMT: nomear **representante da NR-05** | 5.4.13 | Entidade `named_representative` |
| MEI dispensado de nomear representante | 5.4.13.2 | Regra de dispensa |
| Nomeação formalizada **anualmente** | 5.4.14 | Vencimento anual do termo de nomeação |
| Representante nomeado pode também ser membro da CIPA | 5.4.15 | Sem bloqueio de acumulação |

### 2.2 Processo eleitoral (5.5) — o que você pediu: editais e votos

| Exigência | Item | Vira no sistema |
|---|---|---|
| Convocação de eleições com **mínimo 60 dias** antes do fim do mandato | 5.5.1 | Prazo do catálogo ✅ |
| Comunicar o **sindicato da categoria preponderante**, com confirmação de entrega | 5.5.1.1 | Registro de comunicação + comprovante |
| **Comissão eleitoral** formada pelo Presidente e Vice entre os membros; sem CIPA, pela organização | 5.5.2 / 5.5.2.1 | Entidade `electoral_commission` |
| **Edital de convocação** publicado em local de fácil acesso, físico ou eletrônico | 5.5.3 a | Entidade `election_notice` com publicação |
| Inscrição **individual**, período mínimo de **15 dias corridos** | 5.5.3 b | Janela de inscrição ✅ prazo no catálogo |
| Liberdade de inscrição a todos os empregados, com **comprovante** | 5.5.3 c | Comprovante de inscrição |
| **Garantia de emprego** até a eleição para todos os inscritos | 5.5.3 d | Alerta de estabilidade pré-eleitoral |
| Publicação da **relação de inscritos** | 5.5.3 e | Lista publicada |
| Eleição no mínimo **30 dias** antes do fim do mandato | 5.5.3 f | Prazo do catálogo ✅ |
| Eleição em dia normal de trabalho, respeitando turnos | 5.5.3 g | Janela por turno |
| **Voto secreto** | 5.5.3 h | urna com sigilo |
| Apuração em horário normal, com acompanhamento de representante da organização e dos empregados | 5.5.3 i | Ata de apuração com testemunhas |
| Processo que garanta **segurança do sistema, confidencialidade e precisão do registro dos votos** | 5.5.3 j | **base legal para voto eletrônico** |
| **Quórum**: menos de 50% → prorroga para o dia seguinte, válida com **1/3** | 5.5.4 | Controle de quórum por dia |
| Segundo dia com menos de **1/3** → prorroga de novo, válida com **qualquer número** | 5.5.4.1 | Terceira rodada |
| Prorrogação comunicada ao sindicato | 5.5.4.2 | Registro de comunicação |
| Denúncia ao órgão de inspeção em até **30 dias** após o resultado | 5.5.5 | Registro de denúncia |
| Anulação só da votação → nova votação em **10 dias**, garantidas as inscrições | 5.5.5.2 | Fluxo de revotação |
| Assumem os **mais votados**; empate decide por **maior tempo de serviço** | 5.5.6 / 5.5.7 | Critério de desempate cadastrado |
| Não eleitos relacionados na ata em **ordem decrescente**, para vacância | 5.5.8 | Lista de suplência ordenada |

### 2.3 Funcionamento (5.6)

| Exigência | Item | Vira no sistema |
|---|---|---|
| Reuniões **ordinárias mensais**, com calendário preestabelecido | 5.6.1 | Calendário anual |
| ME/EPP grau de risco 1 e 2 podem ser **bimestrais** | 5.6.1.1 | Regra por porte e grau |
| Presencial preferencialmente, **participação remota permitida** | 5.6.2 | Modalidade na ata |
| Data e horário acordados observando turnos | 5.6.2.1 | Agendamento |
| **Atas assinadas pelos presentes** | 5.6.3 | Assinatura por participante |
| Atas disponibilizadas a todos os integrantes | 5.6.3.1 | Distribuição |
| **Deliberações em quadro de aviso ou meio eletrônico** para todos os empregados | 5.6.3.2 | Publicação das deliberações |
| Reunião **extraordinária**: acidente grave/fatal ou solicitação de uma das representações | 5.6.4 | Gatilhos de convocação |
| **Secretário** designado por reunião para redigir a ata | 5.6.5 | Campo secretário |
| Titular **perde o mandato** ao faltar a mais de **4 reuniões ordinárias** sem justificativa | 5.6.6 | Contador de faltas + substituição automática |
| Vacância suprida por suplente na ordem da ata | 5.6.7 | Ordem de suplência |
| Sem suplentes nos **primeiros 6 meses** → **eleição extraordinária**, válida com 1/3 | 5.6.7.1 | Fluxo de eleição extraordinária |
| Prazos da extraordinária **reduzidos à metade** | 5.6.7.1.1 | Divisão dos prazos |
| Afastamento do presidente: organização indica substituto em **2 dias úteis** | 5.6.7.2 | Prazo |
| Afastamento do vice: titulares dos empregados escolhem em **2 dias úteis** | 5.6.7.3 | Prazo |
| Mandato do eleito em extraordinária compatibilizado | 5.6.7.4 | Alinhamento de datas |
| Treinamento do eleito em extraordinária em até **30 dias** da posse | 5.6.7.5 | Prazo |
| Decisões preferencialmente por **consenso** | 5.6.8 | Campo de deliberação |
| Sem consenso: CIPA regula votação e pedido de reconsideração | 5.6.8.1 | Registro do procedimento |

### 2.4 Treinamento (5.7) — ✅ já no catálogo

| Exigência | Item |
|---|---|
| Treinamento antes da posse para membros titulares e suplentes | 5.7.1 |
| Primeiro mandato: em até **30 dias** da posse | 5.7.1.1 |
| Conteúdo mínimo (a–h), incluindo **prevenção ao assédio** (Portaria 4.219/2022) | 5.7.2 |
| Aproveitamento de treinamento com menos de **2 anos** | 5.7.3 |
| Carga horária: **8h** (GR1), **12h** (GR2), **16h** (GR3), **20h** (GR4) | 5.7.4 |
| Máximo **8h por dia** | 5.7.4.1 |
| Presencial: mínimo 4h (GR2) e 8h (GR3 e GR4) | 5.7.4.2 |
| GR1 e representante nomeado podem ser **100% EaD** | 5.7.4.3 |
| EaD deve contemplar riscos específicos do estabelecimento | 5.7.4.4 |
| Integrante do SESMT **dispensado** do treinamento | 5.7.4.5 |

### 2.5 Terceiros e construção (5.8 e Anexo I)

| Exigência | Item |
|---|---|
| Prestadora com empregados na UF no Quadro I → **CIPA centralizada** | 5.8.1 |
| Contratante em GR 3 ou 4 e prestadora no Quadro I → **CIPA própria** no estabelecimento | 5.8.1.1 |
| Serviço de até **180 dias** → dispensa de CIPA própria | 5.8.1.1.1 |
| Desobrigada de CIPA própria com **5 ou mais** empregados → nomear **representante da NR-05** | 5.8.2 |
| Nomeação dispensada se já há membro de CIPA centralizada | 5.8.2.1 |
| Representante nomeado treinado conforme grau de risco da **contratante** | 5.8.4 |
| Contratante deve **exigir** a nomeação da contratada | 5.8.6 |
| Contratante deve **convidar** a contratada para a reunião da CIPA | 5.8.7 |
| Canteiro de obras: CIPA por canteiro no Quadro I | Anexo I 3.1 |
| Canteiro fora do Quadro I → nomear ao menos **1 representante** | Anexo I 3.1.1 |
| Dispensa de CIPA por **frente de trabalho** | Anexo I 3.1.2 |
| Representante nomeado pode cobrir **mais de uma frente** | Anexo I 3.1.3.1 |
| Obras de até **180 dias**: dispensa de CIPA, mas nomeia representante | Anexo I 3.3 / 3.3.1 |
| Representante nomeado: treinamento mínimo de **8 horas** | Anexo I 3.5.1 |
| Convalidação entre organizações permitida (NR-01 item 1.7) | Anexo I 3.5.1.2 |

### 2.6 Disposições finais (5.9)

| Exigência | Item |
|---|---|
| Contratante garante informação sobre riscos a contratadas, CIPAs e representantes | 5.9.1 |
| **Documentação da CIPA guardada no estabelecimento por no mínimo 5 anos** | 5.9.2 |
| Mudança de grau de risco → redimensionamento na **próxima eleição** | 5.9.3 |

---

## 3. Sobre o voto eletrônico — resposta direta

**Sim, a norma permite e até exige que o processo seja seguro.**

O item **5.5.3, alínea "j"** diz que a eleição deve ser organizada "por meio de processo que
garanta tanto a **segurança do sistema** como a **confidencialidade** e a **precisão do registro
dos votos**". Além disso, 5.5.3 já admite explicitamente meio eletrônico em três pontos:
edital (a), comprovante de inscrição (c) e relação de inscritos (e).

Ou seja: **voto eletrônico não é uma licença poética do sistema — é um caminho previsto pela
norma.** Mas ele precisa atender requisitos técnicos que vou listar.

### 3.1 O que o voto eletrônico precisa garantir

| Requisito | Por quê | Como implementar |
|---|---|---|
| **Sigilo do voto** (5.5.3 h) | escrutínio secreto | voto não vinculado ao eleitor na base |
| **Um voto por eleitor** | precisão | controle de comparecimento separado do voto |
| **Elegibilidade verificada** | só empregados do estabelecimento | lista de eleitores derivada do cadastro de trabalhadores ativos |
| **Comprovante de inscrição** (5.5.3 c) | exigido pela norma | recibo por candidato inscrito |
| **Precisão e integridade** (5.5.3 j) | resultado confiável | registro de urna + hash da lista de votos |
| **Controle de quórum** (5.5.4 e 5.5.4.1) | 50% → 1/3 → qualquer número | apuração só quando quórum atingido |
| **Apuração testemunhada** (5.5.3 i) | representantes da organização e dos empregados | registro de quem acompanhou |
| **Trilha de auditoria** | fiscalização | log append-only de eventos |
| **Desempate por tempo de serviço** (5.5.7) | norma | data de admissão no cadastro |
| **Ordem decrescente na ata** (5.5.8) | suplência | ranking completo, não só eleitos |

### 3.2 O desenho técnico que recomendo

O ponto crítico é o **sigilo**. O jeito correto é separar duas coisas:

1. **Lista de comparecimento** — registra *que* o empregado votou, sem dizer em quem.
2. **Urna** — registra os votos, sem saber de quem são.

Assim é impossível reconstruir o voto de uma pessoa a partir da base, e ao mesmo tempo
é possível provar que ninguém votou duas vezes.

Para a integridade, cada urna recebe um **hash do conjunto de votos** no fechamento, e esse hash
é assinado pela comissão eleitoral e pelas testemunhas. Se alguém alterar um voto depois, o hash
não fecha — igual ao mecanismo que já usamos no catálogo de ITs e da NR-5.

### 3.3 O que ainda depende de decisão sua

1. **Voto 100% remoto ou urna presencial com terminal?** A norma exige "dia normal de trabalho,
   respeitando os horários de turnos, em horário que possibilite a participação da maioria". Uma
   urna remota 24h pode conflitar com isso. O caminho mais seguro é **terminal presencial no
   estabelecimento**, com janela por turno.
2. **Identificação do eleitor** — hoje o sistema usa login por e-mail e senha. Para eleição, isso
   é fraco. Precisa de algo como código individual entregue em mão, ou OTP.
3. **Quem opera a urna** — a comissão eleitoral. O sistema precisa de um papel específico para
   isso, com poderes limitados.
4. **Auditoria externa** — o sindicato pode pedir a documentação (5.4.9). O sistema precisa
   gerar um pacote exportável com edital, inscritos, atas, resultado e hashes.

---

## 4. O que já foi implementado (hoje)

Migration `0016_nr5_cipa_standard_catalog.sql`, **aplicada e provada** (13 verificações, zero falhas):

- `nr5_standards` — edição da norma versionada, com hash SHA-256 do PDF oficial, revisor
  obrigatório para publicar, e índice único de uma edição vigente.
- `nr5_dimension_bands` — **Quadro I** por grau de risco (1–4) e faixa de empregados, com
  efetivos, suplentes e incremento por grupo de 2.500.
- `nr5_training_requirements` — cargas horárias 8/12/16/20h por grau de risco, prazo de 30 dias,
  reaproveitamento em 24 meses, EaD permitido para GR1 e representante nomeado.
- `nr5_election_rules` — prazos eleitorais (60 dias convocação, 15 inscrição, 30 eleição).
- `nr5_standard_reviews` e `nr5_dimension_band_entries` — conferência humana por tenant,
  append-only, com RLS.

A fonte oficial está em `docs/fontes-normativas/NR-05-atualizada-2022.pdf`.

---

## 5. Próximas fases

**Fase 3 — Mandato e composição.**
`cipa_term`, `cipa_member` (designados e eleitos), `named_representative`, com estabilidade e
controle de reeleição.

**Fase 4 — Processo eleitoral e voto.**
`election_notice` (edital), `candidate_registration` (inscrição + comprovante), `electoral_commission`,
`ballot_session`, `ballot` (sigiloso), `attendance_list`, `vote_count` (apuração com testemunhas).

**Fase 5 — Funcionamento.**
`cipa_meeting`, `cipa_minutes` (ata com assinaturas), `cipa_action`, controle de faltas e perda de mandato.

**Fase 6 — Terceiros e construção.**
CIPA centralizada, representante nomeado da contratada, Anexo I da construção.

**Fase 7 — Painel e alertas.**
Mandato vencendo, eleição não convocada no prazo, reunião atrasada, treinamento vencido,
estabilidade terminando, documentação com 5 anos incompletos.
