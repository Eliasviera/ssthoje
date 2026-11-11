# PAE + Brigada de Incêndio — documento único, com as fontes que você definiu

**Data:** 2026-11-03
**Autor:** Meu assistente
**Definição do Elias (PLH):**
- **PAE** apoiado em **NR-01** e **ABNT NBR 15219**
- **Brigada** apoiada em **NR-23** e nas **ITs do Corpo de Bombeiros estaduais**
- **PAE e Brigada caminham em conjunto** — não são módulos separados

---

## 1. A consequência disso na arquitetura

Minha proposta anterior tratava PAE e Brigada como dois documentos com categorias
separadas. Sua definição corrige isso: **o PAE é o plano, a brigada é a capacidade de
resposta que executa o plano.** São faces do mesmo documento operacional.

Isso muda três decisões técnicas:

| Antes (minha proposta) | Agora (sua definição) |
|---|---|
| Duas categorias soltas: `PAE` e `Brigada de Incêndio` | Uma **entidade PAE** que **contém** a brigada |
| Brigada como cadastro independente | Brigada vinculada a um PAE e a um cenário |
| Dimensionamento isolado | Dimensionamento **do cenário de incêndio** dentro do PAE |

A categoria documental `PAE` já está implementada e testada (migration `0014`). A
categoria `Brigada de Incêndio` continua útil **para a contratada enviar o documento
dela pelo portal** — mas internamente, na empresa atendida, o correto é uma entidade
única.

---

## 2. As quatro fontes e o papel de cada uma

### NR-01 — a base do PAE

O sistema **já cita a NR-01 em vários pontos** do PGR, inclusive nos itens que tratam
exatamente disto:

- `pgr-section.tsx`, linha 60: NR-1 cap. 1.5 — "GRO/PGR, avaliação e classificação de
  riscos, inventário, plano de ação, **preparação para emergências** e documentação".
- `pgr-section.tsx`, linha 79, seção "Implementação, acompanhamento e resposta a
  emergências": já descreve "procedimentos de emergência, responsáveis e recursos para
  primeiros socorros, encaminhamento e abandono; avaliar exercícios simulados e
  integração com os planos dos clientes" — **com referência explícita aos itens 1.5.5.3
  e 1.5.6 da NR-01**.

Ou seja: **o sistema já tem o gancho normativo do PAE dentro do PGR.** O PAE não é um
documento estranho ao sistema — é o detalhamento daquele item 1.5.6. Isso é uma
oportunidade grande: em vez de criar um módulo paralelo, o PAE pode **nascer da seção 8
do PGR** e se desdobrar.

### ABNT NBR 15219 — a estrutura do plano

A NBR 15219 é a norma de **plano de emergência** propriamente dita: ela define a
estrutura do documento, os cenários, os recursos, as responsabilidades e o fluxo de
acionamento. É ela que dá o **esqueleto de campos** do PAE — e é por isso que ela é
diferente da NR-23:

- **NBR 15219** diz **como o plano deve ser escrito** (estrutura).
- **NR-23** e as **ITs estaduais** dizem **quanto e quem** (dimensionamento e requisitos
  de proteção).

Uma observação importante: a ABNT é **norma vendida**, não é de domínio público como as
NRs. O sistema **não pode reproduzir o texto dela**. Pode citar a referência, usar a
estrutura como checklist e registrar a edição — mas o conteúdo tem que ser o seu texto
técnico, não cópia da norma. Isso precisa ficar explícito no sistema.

### NR-23 — proteção contra incêndios

Já citada no PGR (`pgr-section.tsx`, linha 64), junto com NR-20 e NR-26. Define os
requisitos de proteção contra incêndio e a existência da brigada. É a norma que
**obriga**, mas não dimensiona em detalhe.

### ITs do Corpo de Bombeiros estaduais — o dimensionamento

Como analisado antes: são elas que trazem a **tabela de composição da brigada** por
ocupação, grau de risco, população e turno. Variam por estado e por versão. É o catálogo
versionado por UF que propus (`brigade_standard` + `brigade_occupancy_table`).

---

## 3. A arquitetura corrigida

```
PGR (já existe, seção 8 = preparação para emergências, NR-01 1.5.6)
  │
  └── PAE  ← entidade única, por empresa/unidade
        ├── Base normativa        NR-01 (1.5.6) + NBR 15219 (estrutura)
        ├── Cenários              incêndio, evacuação, vazamento, espaço confinado…
        │     └── Cenário "incêndio"
        │           ├── Brigada      ← dimensionada pela IT do estado (NR-23 + IT)
        │           │     ├── Exigido: ocupação + risco + população/turno → N brigadistas
        │           │     └── Real: brigadistas cadastrados, nível, validade, turno
        │           ├── Recursos     extintores, hidrantes, rotas, ponto de encontro
        │           └── Simulados    data, cenário, participantes, falhas, ação
        ├── Responsabilidades  coordenador, líderes, acionamento
        └── Contatos           internos e externos (SAMU, bombeiros)
```

### Entidades de dados

**1. `emergency_plan` — o PAE**

```
tenant_id, company_id, unit_id
version, status (draft | active | superseded)
normative_basis        ["NR-01 1.5.6", "ABNT NBR 15219:<edição>"]
structure_reference    NBR 15219 — só a referência, nunca o texto
reviewer               quem assinou (você)
reviewed_at
valid_from, next_review_at
```

**2. `emergency_scenario` — cada cenário do plano**

```
plan_id
scenario_type          incêndio | evacuação | vazamento | espaço confinado | médica | outro
description
activation_procedure
meeting_point
routes
resources              extintores, hidrantes, alarme, iluminação de emergência
```

**3. `brigade_standard` — a IT de um estado (catálogo versionado)**

```
jurisdiction (UF), it_number, it_version, issued_at, valid_from, valid_until
source_url, source_hash (SHA-256), reviewer, status
```

**4. `brigade_occupancy_table` — a tabela de dimensionamento da IT**

```
standard_id, occupancy_code, occupancy_label, risk_level,
population_from, population_to,
brigadists_min, level_basic, level_intermediate, level_advanced, notes
```

**5. `brigade_requirement` — o que o cenário de incêndio exige naquela unidade**

```
scenario_id (FK para o cenário "incêndio")
standard_id (qual IT foi aplicada)
occupancy_code, risk_level, population_per_shift (JSON por turno)
required_total, required_by_level
computed_from (snapshot da faixa usada — para auditoria)
```

**6. `brigade_member` — o brigadista real**

```
tenant_id, company_id, unit_id, scenario_id
worker_link | declared_name
role (coordenador | líder | brigadista)
shift
training_level (básico | intermediário | avançado)
trained_at, valid_until
certificate_document_id
status (ativo | afastado | desligado)
```

**7. `emergency_drill` — simulado**

```
scenario_id, held_at, participants, scenario_exercised,
findings, corrective_action, evidence_ref
```

---

## 4. O que o painel mostra

Por unidade, por cenário e por turno:

| Cenário | IT aplicada | Exigido | Cadastrados | Treinamento válido | Situação |
|---|---|---|---|---|---|
| Incêndio · Diurno | IT-17/SP 2024 | 12 | 10 | 8 | ⚠ Déficit 4 + 2 vencidos |
| Incêndio · Noturno | IT-17/SP 2024 | 8 | 4 | 4 | ⚠ Déficit 4 |
| Evacuação | — | — | — | — | Último simulado: 14 meses ⚠ |

E o vínculo com o PGR: o PAE é a evidência do item **1.5.6 da NR-01**, então o PGR passa
a mostrar que a preparação para emergências **existe e está vigente** — em vez de um
texto genérico.

---

## 5. Sequência proposta

**Fase 1 — CONCLUÍDA hoje.** Categorias `PAE` e `Brigada de Incêndio` implementadas e
provadas em banco descartável (migration `0014`, 12 verificações aprovadas). Ainda não
aplicada ao banco persistente.

**Fase 2 — Catálogo de ITs.** `brigade_standard` + `brigade_occupancy_table`, com
importação assistida do PDF da IT e conferência assinada por você. **Não calcula nada.**
É a fundação: uma vez validado, serve para todos os clientes daquele estado.

**Fase 3 — PAE como entidade.** `emergency_plan` + `emergency_scenario`, nascendo da
seção 8 do PGR, com a estrutura da NBR 15219 como checklist (sem reproduzir o texto).

**Fase 4 — Brigada dentro do cenário.** `brigade_requirement` + `brigade_member`, com o
cálculo exigido × real por turno e validade de treinamento.

**Fase 5 — Simulados e ciclo de revisão.** `emergency_drill`, alerta de simulado atrasado
e revisão vencida do PAE.

---

## 6. O que ainda preciso de você

1. **Edição da NBR 15219** que você usa como referência (para registrar no sistema).
2. **São Paulo** como primeiro estado? Qual IT e qual versão (IT-17?).
3. O sistema deve **baixar** a IT ou só **aceitar o arquivo** que você envia?
   Recomendo aceitar o arquivo — você controla qual versão entrou.
4. **A tabela de dimensionamento**: você transcreve ou extrai e confere?
5. Os **níveis de treinamento** da IT que você usa: básico / intermediário / avançado?
6. **Confirma** que o PAE deve nascer da seção 8 do PGR (NR-01 1.5.6) em vez de ser um
   módulo totalmente separado? Tecnicamente isso economiza muito trabalho e deixa a
   rastreabilidade melhor.

---

## 7. Riscos registrados

- **Texto da ABNT.** Não reproduzir a NBR 15219 no sistema. Usar como referência de
  estrutura e citar a edição. Reproduzir norma vendida é violação de direito autoral.
- **Cálculo errado com cara de autoridade.** Se a tabela da IT for transcrita
  incorretamente, o sistema produz um número errado e convincente. Por isso a publicação
  do catálogo precisa de assinatura sua e o cálculo precisa mostrar **qual versão da IT e
  qual UF** o gerou.
- **IT desatualizada.** Estado publica nova versão e o catálogo fica velho. Precisa de
  `valid_until` e alerta de revisão — o campo já existe no padrão das regras do sistema.
