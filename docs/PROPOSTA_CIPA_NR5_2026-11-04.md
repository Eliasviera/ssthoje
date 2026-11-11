# NR-5 (CIPA) — proposta de inclusão no SST Hoje

**Data:** 2026-11-04
**Autor:** Meu assistente
**Status:** proposta para decisão do Elias (engenheiro de segurança do trabalho). Nada foi implementado.

---

## 1. O que existe hoje

Levantamento feito no código:

- **Não existe nada de CIPA no sistema.** A busca por `CIPA`, `NR-5`, `NR-05` em `src/` e em `docs/*.md`
  retorna **zero ocorrências**. O que aparece ao buscar "cipa" são apenas fragmentos de "parti**cipa**ção".
- **Categorias de documento hoje:**
  `PGR · PCMSO · LTCAT · Ficha de EPI · Treinamento · O.S. · PAE · Brigada de Incêndio · Outro`
  Não há Ata de CIPA, Ata de Reunião, Quadro de CIPA nem Atas de eleição.
- **O cadastro de trabalhador já existe** (`worker-store.ts`) e tem exatamente os campos que a CIPA
  precisa: `displayName`, `jobTitle`, `area`, `riskCategories`, `status`, e histórico de mudanças.
  A CIPA não precisa de cadastro paralelo de pessoas — precisa **referenciar** o trabalhador.

---

## 2. Por que a CIPA não é "mais um tipo de documento"

O padrão que funcionou para PAE e Brigada foi: uma entidade com o documento, e outra com as pessoas
que o executam. A CIPA segue a mesma lógica, mas com uma diferença importante — **a CIPA é um
colegiado com mandato**, e o que gera não conformidade na prática não é o documento existir, é:

1. **Mandato vencido** — a CIPA continua funcionando sem eleição nova.
2. **Composição irregular** — número de representantes do empregador e dos empregados fora do que a NR-5
   exige, ou sem estabilidade garantida.
3. **Reunião não realizada** — a NR-5 exige reunião ordinária mensal, com ata.
4. **Ata não registrada** — a ata precisa existir, ser assinada e ficar disponível.
5. **Falta de treinamento** — o membro da CIPA precisa de treinamento, com validade.

Só guardar o PDF da ata não resolve nenhum desses cinco pontos.

---

## 3. Arquitetura proposta

### 3.1 Entidades

**A) `cipa_term` — o mandato (a legislatura)**

```
tenant_id, company_id, unit_id
term_number          ex.: "Gestão 2026/2027"
election_type        "processo_eleitoral" | "designado" (por convenção/acordo)
started_on, ends_on  início e fim do mandato
establishment_size   número de empregados no estabelecimento (define o dimensionamento)
status               draft | active | ended
created_by, created_at
```

**B) `cipa_dimension` — o dimensionamento aplicável**

Aqui está o mesmo cuidado que tivemos com a brigada: o número de representantes **vem da NR-5**
(agrupamento de estabelecimentos por número de empregados), e a tabela precisa ter **fonte, versão
e vigência**, não ser constante solta no código. Mesma arquitetura do catálogo de ITs:
catálogo versionado + conferência humana + assinatura.

```
standard_id            FK para o catálogo da NR-5 (versionado)
employees_from, employees_to
employer_representatives   quantos pelo empregador
employee_representatives   quantos pelos empregados
notes
```

**C) `cipa_member` — quem compõe a CIPA**

```
term_id
worker_id              referência ao trabalhador já cadastrado (não duplicar pessoa)
representation         "empregador" | "empregado"
role                   "presidente" | "vice_presidente" | "secretario" | "membro"
is_titular             titular ou suplente
elected_at
stability_until        estabilidade no emprego (data limite)
training_completed_at, training_valid_until
status                 active | replaced | ended
replacement_of         quando um suplente assume no lugar do titular
```

**D) `cipa_meeting` — as reuniões**

```
term_id
meeting_type           "ordinaria" | "extraordinaria"
scheduled_for, held_at
agenda                 pauta
minutes_document_id    ata anexada (documento versionado)
absences               quem faltou
status                 scheduled | held | cancelled
```

**E) `cipa_action` — as deliberações da ata**

Toda ata de CIPA gera encaminhamentos com responsável e prazo. Isso alimenta o painel de
pendências que o sistema já tem (M12):

```
meeting_id
description, responsible_worker_id, due_date
status                 open | in_progress | done
evidence
```

### 3.2 O que o sistema mostra

Por unidade, um painel de CIPA:

| Item | Situação |
|---|---|
| Mandato | Gestão 2026/2027 · vigente até 31/12/2027 ✅ |
| Dimensionamento | 4 empregados → exige 2 do empregador + 2 dos empregados ✅ |
| Composição atual | 2 + 2 titulares, 2 suplentes ✅ |
| Treinamento | 3 válidos · **1 vencido** ⚠ |
| Reunião ordinária | Última: 14/10 · **próxima 14/11** ⚠ (não agendada) |
| Ações em aberto | **2 vencidas** ⚠ |

E o vínculo com o PGR: a NR-5 exige que a CIPA participe do gerenciamento de riscos. O sistema
pode mostrar, no PGR, que a CIPA da unidade está vigente e que houve reunião no período.

---

## 4. Pontos que só você pode decidir (engenheiro responsável)

Não vou inventar regra normativa. Preciso que você defina, com fonte e versão:

1. **Qual edição da NR-5 usar como referência** e o link oficial do MTE.
2. **Dimensionamento**: o sistema deve **calcular** o número de representantes a partir do número de
   empregados, ou apenas **registrar** o que a empresa declarou? (Mesma pergunta da brigada.)
3. **Agrupamento de estabelecimentos**: a NR-5 permite agrupar estabelecimentos de mesma atividade
   para dimensionar a CIPA. O sistema deve modelar esse agrupamento ou tratar por unidade isolada?
4. **Periodicidade da reunião ordinária** — mensal? Quem pode convocar extraordinária?
5. **Validade do treinamento do cipista** — qual a periodicidade e quem valida?
6. **Estabilidade**: o sistema deve apenas registrar a data-limite, ou também alertar vencimento
   e bloquear desligamento? (O sistema não faz desligamento, então provavelmente só registrar e alertar.)
7. **Quem assina a ata** — presidente, vice, secretário? O sistema exige assinatura de todos?
8. **CIPA designada** (empresas que não precisam de processo eleitoral): o fluxo muda?

---

## 5. Sequência proposta

**Fase 1 — Categorias documentais (rápida).**
Adicionar `Ata de CIPA`, `Quadro de CIPA` e `Calendário de Reuniões` às categorias, com migration
`0016` atualizando os três `CHECK` — mesmo padrão da `0014`. Isso já permite anexar, versionar e
avaliar os documentos da CIPA.

**Fase 2 — Mandato e composição.**
`cipa_term` + `cipa_dimension` + `cipa_member`, com catálogo de dimensionamento versionado e
conferência assinada por você (mesmo modelo do catálogo de ITs da `0015`).

**Fase 3 — Reuniões e ações.**
`cipa_meeting` + `cipa_action`, ligando as deliberações ao painel de pendências existente.

**Fase 4 — Painel e alertas.**
Mandato vencendo, reunião não realizada, treinamento vencido, ação atrasada.

---

## 6. Recomendação

A Fase 1 é barata e independente de decisão normativa — dá para fazer já.

A Fase 2 depende das respostas de 1 a 3 acima. E, como na brigada, o ponto crítico é o
**dimensionamento**: se o sistema calcular e estiver errado, ele produz um número com aparência de
autoridade. A solução é a mesma que já provamos funcionar: catálogo versionado, conferência humana,
hash do documento de origem e assinatura sua.

**Uma vantagem da CIPA sobre a brigada:** o dimensionamento está na **NR-5**, que é pública e
federal — não varia por estado como as ITs. Isso torna o catálogo muito mais simples: uma fonte,
uma tabela, versionada. Só precisa da sua conferência uma vez.
