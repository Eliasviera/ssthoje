import assert from "node:assert/strict";
import test from "node:test";
import { validatePgrRiskInventory, type PgrRiskInventory } from "../src/lib/pgr-risk-inventory.ts";
import { ESOCIAL_CATALOG_SNAPSHOT } from "../src/lib/esocial-catalog.ts";

function inventory(): PgrRiskInventory {
  return {
    schemaVersion: 1,
    tenantId: "tenant-ficticia",
    companyId: "empresa-ficticia",
    unitId: "unidade-ficticia",
    revision: 1,
    title: "PGR de teste",
    activityDescription: "Atividade a revisar.",
    actionPlan: "Plano a elaborar.",
    items: [{
      id: "risk-1",
      process: "",
      activity: "",
      hazard: "",
      sourceCircumstance: "",
      possibleHarm: "",
      exposedGroups: [],
      exposureDescription: "",
      existingMeasures: [],
      evidenceRefs: [],
      assessment: { status: "reported" },
    }],
  };
}

test("inventário aceita item ainda não avaliado sem inferir classificação", () => {
  const result = validatePgrRiskInventory(inventory());
  assert.ok("value" in result);
});

test("referência manual à Tabela 24 exige código e justificativa do snapshot vigente", () => {
  const value = inventory();
  const table = ESOCIAL_CATALOG_SNAPSHOT.tables.find((candidate) => candidate.table === "24");
  assert.ok(table);
  const entry = table.entries[0];
  assert.ok(entry);
  value.items[0].esocialTable24 = {
    code: entry.code,
    label: entry.label,
    catalogVersion: ESOCIAL_CATALOG_SNAPSHOT.sourceVersion,
    sourceUrl: ESOCIAL_CATALOG_SNAPSHOT.sourceUrl,
    rationale: "Associação manual a conferir pela equipe responsável.",
  };
  assert.ok("value" in validatePgrRiskInventory(value));

  value.items[0].esocialTable24.code = "codigo-inexistente";
  assert.ok("error" in validatePgrRiskInventory(value));
  value.items[0].esocialTable24.code = entry.code;
  value.items[0].esocialTable24.label = "Rótulo alterado pelo formulário";
  assert.ok("error" in validatePgrRiskInventory(value));
  value.items[0].esocialTable24.label = entry.label;
  value.items[0].esocialTable24.rationale = " ";
  assert.ok("error" in validatePgrRiskInventory(value));
});

test("inventário exige IDs únicos e não permite avaliação concluída sem autoria", () => {
  const duplicated = inventory();
  duplicated.items.push({ ...duplicated.items[0] });
  assert.ok("error" in validatePgrRiskInventory(duplicated));

  const incomplete = inventory();
  incomplete.items[0].assessment = { status: "assessed", method: "", decision: "", assessor: "", assessedAt: "" };
  assert.ok("error" in validatePgrRiskInventory(incomplete));
});

test("inventário rejeita categorias adicionais inesperadas em grupos", () => {
  const value = inventory();
  value.items[0].exposedGroups = ["Soldador", "Soldador"];
  assert.ok("error" in validatePgrRiskInventory(value));
});

test("inventário preserva avaliação quantitativa e referência profissional sem inferir ART", () => {
  const value = inventory();
  value.items[0].exposureEvaluations = [{
    id: "evaluation-1",
    agent: "Agente a identificar pela avaliação técnica",
    type: "quantitative",
    status: "collected",
    method: "Método informado pelo responsável",
    result: "Resultado demonstrativo",
    unit: "unidade registrada",
    evaluatedAt: "2026-10-12",
    responsible: "Responsável fictício",
    qualification: "Qualificação a validar",
    professionalRegistration: "Registro a conferir",
    evidenceRefs: ["evidencia-ficticia-1"],
  }];
  assert.ok("value" in validatePgrRiskInventory(value));
  value.items[0].exposureEvaluations[0].artReference = "ART-ficticia-1";
  assert.ok("value" in validatePgrRiskInventory(value));
});

test("avaliação quantitativa concluída exige unidade e registro feito exige rastreabilidade mínima", () => {
  const value = inventory();
  value.items[0].exposureEvaluations = [{
    id: "evaluation-1", agent: "Agente informado", type: "quantitative", status: "collected",
    method: "Método", result: "Resultado", evaluatedAt: "2026-10-12", responsible: "Responsável", evidenceRefs: [],
  }];
  assert.ok("error" in validatePgrRiskInventory(value));
  value.items[0].exposureEvaluations[0].unit = "unidade";
  assert.ok("value" in validatePgrRiskInventory(value));
  value.items[0].exposureEvaluations[0].result = "";
  assert.ok("error" in validatePgrRiskInventory(value));
});
