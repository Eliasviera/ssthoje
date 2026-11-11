import { readFileSync } from "node:fs";

// Preenche o checklist da APR de demonstração com respostas coerentes.
// Usa o próprio store (saveSafetyAprAnswers) para respeitar as regras de edição.
// Dois itens ficam como "ponto a tratar": é deles que nasce a não conformidade.

const store = await import("../src/lib/safety-operations-store.ts");
const TENANT = "tenant-horizonte";

const data = JSON.parse(readFileSync("data/safety-operations.json", "utf8"));
const apr = data.aprs[0];
if (!apr) throw new Error("Nenhuma APR para preencher.");

// Resposta por posição do item no checklist (1..15).
const PLANO = {
  1: { result: "observed", notes: "Atividade, área e OS 2026/118 conferidas na abertura.", nextStep: "", responsible: "" },
  2: { result: "observed", notes: "Estrutura metálica não pode ser executada no solo por exigência de montagem final.", nextStep: "", responsible: "" },
  3: { result: "observed", notes: "Proteção coletiva avaliada; cabine de pintura tem exaustão.", nextStep: "", responsible: "" },
  4: { result: "observed", notes: "Há trabalho em altura e trabalho a quente: PT e PTQ emitidas.", nextStep: "", responsible: "" },
  5: { result: "attention", notes: "Dois soldadores com treinamento de trabalho a quente vencido desde 09/2026.", nextStep: "Suspender a atividade de solda desses profissionais e reagendar o treinamento.", responsible: "Elias Alves Vieira" },
  6: { result: "observed", notes: "Perigos identificados: corte, projeção de partículas, fumos metálicos, trabalho em altura.", nextStep: "", responsible: "" },
  7: { result: "observed", notes: "Avaliado acesso e resgate em altura; área sinalizada.", nextStep: "", responsible: "" },
  8: { result: "observed", notes: "Controles coletivos e EPIs definidos; máscara de solda automática e respirador PFF2.", nextStep: "", responsible: "" },
  9: { result: "attention", notes: "Bloqueio/etiquetagem da prensa não foi confirmado no momento da avaliação.", nextStep: "Confirmar LOTO da prensa antes do início da atividade.", responsible: "Encarregado de produção" },
  10: { result: "observed", notes: "Ferramentas inspecionadas; EPIs conferidos no almoxarifado.", nextStep: "", responsible: "" },
  11: { result: "observed", notes: "Análise sequencial da tarefa registrada em 6 passos.", nextStep: "", responsible: "" },
  12: { result: "observed", notes: "Plano de emergência e brigada acionados conforme PAE.", nextStep: "", responsible: "" },
  13: { result: "observed", notes: "Critério de interrupção: mudança de condição climática ou falha de exaustão.", nextStep: "", responsible: "" },
  14: { result: "observed", notes: "Encerramento prevê limpeza e retirada de isolamento.", nextStep: "", responsible: "" },
  15: { result: "not_applicable", notes: "Itens de revisão e liberação são registrados na PT.", nextStep: "", responsible: "" },
};

const answers = apr.answers.map((item, index) => {
  const plano = PLANO[index + 1] ?? { result: "unanswered", notes: "", nextStep: "", responsible: "" };
  return { id: item.id, ...plano };
});

const updated = store.saveSafetyAprAnswers(TENANT, apr.id, apr.revision, answers, "sst-demo-user");
const pontos = updated.answers.filter((a) => a.result === "attention").length;
console.log("APR:", updated.title);
console.log("revisão:", updated.revision, "| status:", updated.status);
console.log("itens respondidos:", updated.answers.filter((a) => a.result !== "unanswered").length, "de", updated.answers.length);
console.log("pontos a tratar:", pontos);
updated.answers.filter((a) => a.result === "attention").forEach((a) => console.log("  ⚠", a.notes.slice(0, 80), "→", a.nextStep.slice(0, 60)));
