# PAE e Brigada de Incêndio — proposta de inclusão no SST Hoje

**Data:** 2026-11-03
**Autor:** Meu assistente
**Status:** proposta para decisão do Elias (PLH). Nenhum código, migration ou dado foi alterado.

---

## 1. O que existe hoje

Levantamento feito no código:

- **Não existe nenhum módulo de PAE nem de Brigada de Incêndio.** A busca por
  `PAE`, `emergência`, `brigada` e `incêndio` em `src/` retorna apenas:
  - `pgr-section.tsx`, linha 64 — uma linha de tabela citando NR-20 / NR-23 / NR-26
    como referência de risco do PGR. É texto informativo, não funcionalidade.
  - `pgr-contractor-risk-templates.ts`, `pgr-pdf-extractor.ts`,
    `work-permit-source-field-maps.ts` — menções incidentais em listas.
- **Categorias de documento hoje** (`src/lib/document-categories.ts`):
  `PGR · PCMSO · LTCAT · Ficha de EPI · Treinamento · O.S. · Outro`
  Não há PAE, Brigada, nem Plano de Emergência.
- **O banco tem `CHECK` de categoria** em três tabelas
  (`db/migrations/0010_third_party_os_document_kind.sql`). Ou seja, incluir
  categoria nova exige **migration**, não só mudar a lista do TypeScript.

---

## 2. O ponto mais importante: são duas coisas, não uma

**Brigada de incêndio** e **PAE** têm naturezas diferentes, e tratá-las como
"mais um tipo de documento" deixaria o sistema fraco. Proposta de separação:

| | Brigada de Incêndio | PAE — Plano de Atendimento a Emergências |
|---|---|---|
| Natureza | **Pessoas e capacidade de resposta** | **Plano documentado e cenários** |
| Pergunta central | Tem gente treinada suficiente e na escala certa? | O plano cobre os cenários reais e está atualizado? |
| Precisa de | Cadastro de brigadistas, função, treinamento, validade, escala por turno | Cenários de emergência, recursos, rotas, pontos de encontro, contatos, simulados |
| O que vence | Validade do treinamento de cada brigadista | Revisão do plano e registro de simulado |
| Evidência | Certificado, ata de formação, lista nominal | Documento do PAE, registro de simulado, ART/PT |

Se o sistema só guardar o PDF, você perde exatamente o que mais gera
não conformidade na prática: **brigadista com treinamento vencido** e
**turno sem cobertura**.

---

## 3. Como eu proporia encaixar no sistema

### Fase 1 — Categoria documental (rápido, destrava o uso)

Adicionar duas categorias em `DOCUMENT_KINDS`:

```
"PAE", "Brigada de Incêndio"
```

Impacto técnico: mudar `src/lib/document-categories.ts`,
`src/lib/third-party-policy.ts` e criar uma migration `0014` para atualizar
os três `CHECK` de `document_kind`. Isso permite anexar o documento,
versionar, avaliar por checklist e gerar pendência — reaproveitando tudo que
já existe (versionamento, auditoria, reavaliação, portal de terceiros).

**Esforço estimado:** baixo. É o mesmo padrão de `O.S.` na migration `0010`.

### Fase 2 — Brigada como cadastro operacional (o que realmente agrega)

Um módulo novo, por empresa/unidade, com:

- **Brigadista:** nome/vínculo ao trabalhador, função na brigada
  (coordenador, líder, brigadista), turno, data de formação, validade,
  certificado anexado.
- **Cobertura por turno:** o sistema mostra quantos brigadistas ativos existem
  em cada turno e sinaliza turno descoberto.
- **Vencimento:** treinamento vencido ou perto de vencer vira pendência no
  painel, com o mesmo fluxo de correção e reavaliação do M12.
- **Histórico:** troca de brigadista e renovação ficam auditadas, sem apagar
  o registro anterior.

### Fase 3 — PAE estruturado

- **Cenários de emergência** por unidade: incêndio, vazamento, queda,
  espaço confinado, emergência médica, evacuação, entre outros configuráveis.
- **Recursos por cenário:** rotas de fuga, pontos de encontro, equipamentos,
  acionamento, contatos internos e externos (SAMU, bombeiros).
- **Simulados:** data, cenário exercitado, participantes, o que falhou e ação
  corretiva. Simulado atrasado vira pendência.
- **Revisão do plano:** versão, responsável técnico, data de vigência e
  próxima revisão — reaproveitando o modelo de vigência que o PGR já usa.

### Onde as coisas aparecem na tela

- **Documentos** — PAE e Brigada como categorias, para o PDF e a avaliação.
- **Pendências** — brigadista vencido, turno descoberto, simulado atrasado,
  PAE vencido.
- **Terceiros** — contratada envia o PAE dela pelo portal; a avaliação segue
  o rigor por tipo de documento que já existe.
- **PGR** — o PAE passa a poder ser citado como medida de controle nos riscos
  que exigem resposta a emergência.

---

## 4. Pontos que só você pode decidir (PLH)

Não vou inventar regra normativa. Preciso que você defina, com fonte e versão:

1. **Base normativa e jurisdição.** NR-23 (proteção contra incêndios) e a
   legislação estadual de bombeiros variam por estado. Qual referência o
   sistema deve citar, com qual versão?
2. **Dimensionamento da brigada.** O sistema deve *calcular* o número mínimo
   de brigadistas (por população fixa, grau de risco, turno) ou apenas
   *registrar* o que a empresa declarou? Calcular exige a tabela normativa
   embutida com fonte — é o tipo de regra que o `AGENTS.md` proíbe colocar
   como constante sem fonte, jurisdição, versão e responsável.
3. **Validade do treinamento de brigadista.** Anual? Bienal? Muda por nível
   de treinamento? Quem é o responsável por validar?
4. **Periodicidade do simulado.** Anual? Semestral? Por cenário?
5. **Abrangência do PAE.** Só incêndio e evacuação, ou também emergências
   ambientais, químicas e de espaço confinado?
6. **Escopo por empresa.** O PAE é por CNPJ, por unidade ou por
   estabelecimento com população flutuante?

---

## 5. Recomendação de sequência

**Fazer a Fase 1 agora** — é barato, destrava o uso documental e não exige
nenhuma decisão normativa sua. O sistema passa a aceitar, versionar e avaliar
PAE e Brigada como documentos.

**A Fase 2 só depois** que você responder os itens 1 a 3 acima. Ela é o maior
valor, mas é onde a regra normativa precisa estar certa — e é a sua assinatura
que responde por ela.

**A Fase 3 por último**, porque depende do PAE já estar sendo usado na prática
para saber quais cenários e campos realmente importam.

---

## 6. Observação de escopo

Isto é **novo escopo de produto**, não parte do M22. Se você quiser manter o
foco atual em "testes de usuários sem vendas", eu recomendaria a Fase 1
entrar como uma fatia pequena e independente, e as fases 2 e 3 ficarem
registradas em `docs/` como roadmap, sem competir com o fechamento do M22.
