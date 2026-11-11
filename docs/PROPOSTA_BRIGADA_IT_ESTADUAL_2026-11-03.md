# Brigada de Incêndio — análise técnica da proposta "baixar a IT do estado e o sistema monta os campos"

**Data:** 2026-11-03
**Autor:** Meu assistente
**Contexto:** definição do Elias (PLH): a Brigada se apoia na **NR-23** e nas **ITs do Corpo de Bombeiros estaduais**; o sistema deve permitir **baixar a IT de um estado** e, a partir dela, **analisar a composição da brigada e montar os campos a preencher**.
**Status:** análise técnica. Nada foi implementado além da categoria documental (ver seção 6).

---

## 1. Por que a ideia é boa — e por que ela é a parte difícil

A ideia resolve o problema real: dimensionamento de brigada **não é universal**. Muda por estado, por tipo de ocupação, por grau de risco, por população fixa e por turno. Deixar isso como texto livre no sistema seria inútil; calcular com número fixo seria errado.

Mas há uma diferença crucial entre as duas coisas que você descreveu:

| O que você pediu | Dificuldade real |
|---|---|
| Baixar a IT de um estado e **montar os campos** | **Alta** — exige transformar um PDF/DOCX de bombeiro em estrutura |
| **Analisar a composição** da brigada | **Muito alta** — exige a tabela normativa de dimensionamento transcrita e validada |

A primeira é engenharia de extração. A segunda é **responsabilidade técnica**: se o sistema calcular 12 brigadistas e a IT exigir 15, quem assina é você.

---

## 2. O que a arquitetura do SST Hoje já tem para isso

Levantamento no código:

- **`pgr-pdf-extractor.ts`** — já extrai estrutura de PDF de PGR.
- **`epi-stock-pdf-extractor.ts`** — extrai tabela de estoque de EPI de PDF.
- **`worker-pdf-extractor.ts`** — extrai dados de trabalhador de PDF.
- **`pgr-contractor-risk-catalog.ts`** — catálogo de riscos com `id`, `keywords`, `hazard`, `control`, `ppe`. **É exatamente o padrão de "catálogo com fonte" que a IT precisaria.**
- **`esocial-catalog.ts`** — catálogo de tabelas do eSocial, versionado.
- **Tabela `sst.third_party_compliance_rules`** — já guarda `document_kind`, `criteria`, `source_title`, `source_version`, `jurisdiction`, `valid_from`, `valid_until`, `reviewer`. **O campo `jurisdiction` já existe e é exatamente o lugar da UF.**

Ou seja: a fundação para "regra com fonte, jurisdição, versão e responsável" já está construída. O que falta é o formato específico da brigada.

---

## 3. A parte que o sistema NÃO consegue fazer sozinho

Aqui preciso ser direto, porque isso decide se o projeto é viável:

**As ITs do Corpo de Bombeiros não são documentos de leitura uniforme.** Na prática:

- São publicadas em PDF, muitas vezes escaneado, com tabelas de dimensionamento em layout de colunas.
- Cada estado tem estrutura própria: número da IT, versão, data de vigência e redação diferentes.
- Alguns estados publicam em DOCX; outros só em PDF fechado.
- **Não existe uma API oficial** de ITs. Baixar é acesso a site de governo.
- A tabela de dimensionamento costuma ter várias entradas: ocupação, risco, população por turno, e a saída é o número de brigadistas por nível de treinamento.

**Conclusão:** "o sistema baixa a IT e monta os campos sozinho" **não é confiável como automação cega**. O caminho que funciona é o mesmo que o seu `AGENTS.md` já exige para IA: **o sistema extrai e sugere; uma pessoa habilitada confere e publica.** Você confere uma vez por estado e por versão da IT, e o resultado vira catálogo versionado — depois disso, todo cliente daquele estado usa o catálogo já validado.

---

## 4. Arquitetura proposta

### 4.1 Estrutura de dados (o coração)

Precisa de três entidades novas, no padrão do que já existe:

**A) `brigade_standard` — a IT de um estado, versionada**

```
jurisdiction      UF (SP, MG, RS…)          ← reaproveita o campo que já existe
it_number         ex.: "IT-17"
it_version        ex.: "2024"
issued_at         data de publicação
valid_from        vigência
valid_until       quando for substituída
source_url        de onde foi baixada
source_hash       SHA-256 do arquivo baixado
reviewer          quem conferiu (você, PLH)
status            draft | active | superseded
```

**B) `brigade_occupancy_table` — a tabela de dimensionamento**

```
standard_id       FK para brigade_standard
occupancy_code    ex.: "J-1", "M-2" (classificação de ocupação da IT)
occupancy_label   ex.: "Escritório", "Indústria"
risk_level        leve | moderado | alto
population_from   faixa de população fixa (de)
population_to     faixa de população fixa (até)
brigadists_min    número mínimo de brigadistas
level_basic       quantos com treinamento básico
level_intermediate quantos com intermediário
level_advanced    quantos com avançado
notes             observações da IT
```

**C) `brigade_member` — o brigadista real da empresa**

```
tenant_id, company_id, unit_id
worker_link       vínculo com o trabalhador (ou nome declarado)
role              coordenador | líder | brigadista
shift             turno
training_level    básico | intermediário | avançado
trained_at        data do treinamento
valid_until       validade
certificate_id    documento anexado
status            ativo | afastado | desligado
```

### 4.2 O fluxo de "baixar a IT e montar os campos"

1. **Upload/download.** Você baixa a IT do site do Corpo de Bombeiros do estado e envia no sistema (ou o sistema baixa, se você informar a URL).
2. **Extração assistida.** O extrator lê o PDF e propõe: número da IT, versão, vigência, tabela de ocupação e faixas de população. **Tudo entra como rascunho.**
3. **Conferência humana obrigatória.** A tela mostra lado a lado o PDF original e os campos extraídos. Você confere, corrige e **assina a publicação** — com seu nome, data e hash do arquivo.
4. **Catálogo publicado.** A partir daí, toda empresa daquela UF usa aquele padrão. Empresas de outro estado precisam do padrão do estado delas.
5. **Aplicação na empresa.** A empresa informa ocupação, grau de risco e população por turno. O sistema consulta o padrão vigente e calcula o que a IT exige.
6. **Confronto com a realidade.** O sistema compara o exigido com os brigadistas cadastrados e mostra: *"a IT exige 12 no turno diurno; você tem 8 ativos e 2 com treinamento vencido"*.

### 4.3 O que o sistema mostra ao final

Um painel de brigada por unidade e por turno:

| Turno | Exigido pela IT | Cadastrados | Ativos | Treinamento válido | Situação |
|---|---|---|---|---|---|
| Diurno | 12 | 10 | 10 | 8 | ⚠ Déficit de 4 |
| Noturno | 8 | 4 | 4 | 4 | ⚠ Débito de 4 |

Isso vira pendência no painel operacional, com o mesmo fluxo de correção e reavaliação do M12.

---

## 5. Recomendação de fases

**Fase 1 — categoria documental. CONCLUÍDA e testada hoje.**
`PAE` e `Brigada de Incêndio` já são categorias válidas, com migration `0014` provada em PostgreSQL 17 descartável (12 verificações aprovadas). Isso já permite anexar, versionar e avaliar o documento da brigada.

**Fase 2 — catálogo de ITs por estado.**
Tabelas `brigade_standard` e `brigade_occupancy_table`, com importação assistida do PDF da IT e conferência humana. **Não calcula nada ainda** — só guarda a norma de forma versionada e auditável. É aqui que você valida São Paulo, seu estado, e depois os demais.

**Fase 3 — brigadistas e cálculo.**
Cadastro de brigadistas com validade de treinamento e o confronto exigido × existente, por turno. Aqui a regra já está publicada e assinada na Fase 2, então o cálculo é determinístico e rastreável.

**Fase 4 — PAE estruturado.**
Cenários, recursos, simulados e revisão — como descrito na proposta anterior.

---

## 6. O que eu preciso de você para a Fase 2

1. **Qual estado começa?** Presumo São Paulo. Se for outro, mudo a referência.
2. **Qual IT?** A IT-17 (Brigada de Incêndio) do CBPMESP? Outro número?
3. **O sistema deve baixar da internet ou só aceitar o arquivo que você enviar?** Recomendo **só aceitar o arquivo**: baixar automaticamente de site de governo é frágil, e você quer controle de qual versão entrou.
4. **A tabela de dimensionamento deve ser transcrita por você ou extraída e você confere?** Recomendo extrair e conferir — mas se a extração errar muito, transcrever à mão uma vez por estado é mais seguro.
5. **Quais níveis de treinamento a IT de referência usa?** Básico, intermediário e avançado? Outros nomes?

---

## 7. Risco a registrar

Se o sistema calcular dimensionamento com base em IT transcrita **incorretamente**, ele produz um número errado com aparência de autoridade — e isso é pior do que não calcular. Por isso a Fase 2 tem que terminar com **publicação assinada por você**, e a tela precisa sempre mostrar **qual versão da IT e qual jurisdição** gerou aquele número. O `AGENTS.md` já proíbe constante normativa sem fonte, jurisdição, versão e responsável — esta proposta segue essa regra.
