import assert from "node:assert/strict";
import test from "node:test";
import type { SafetyApr } from "../src/lib/safety-operations-store.ts";
import type { PgrInventoryRecord } from "../src/lib/pgr-postgres-operations.ts";
import type { ClientCompany } from "../src/lib/client-store.ts";
import { assessWorkPermitReadiness, WORK_PERMIT_PTE_TYPES, WORK_PERMIT_TYPES } from "../src/lib/work-permit-readiness.ts";
function fixture() {
  const company: ClientCompany = { id: "company-a", tenantId: "tenant-a", status: "active", legalName: "Empresa fictícia", tradeName: "", contactName: "", contactEmail: "", contactPhone: "", units: [{ id: "unit-a", name: "Unidade fictícia", cnpj: "", cityState: "" }], createdAt: "2026-10-24", updatedAt: "2026-10-24" };
  const pgr: PgrInventoryRecord = { id: "pgr-a", status: "approved", createdAt: "2026-10-24", updatedAt: "2026-10-24", inventory: { schemaVersion: 1, tenantId: "tenant-a", companyId: company.id, unitId: "unit-a", revision: 2, title: "PGR fictício", activityDescription: "Atividade sintética", actionPlan: "Plano sintético", items: [{ id: "risk-a", process: "Processo fictício", activity: "Atividade sintética", hazard: "Perigo sintético", sourceCircumstance: "Fonte sintética", possibleHarm: "Dano sintético", exposedGroups: [], exposureDescription: "Exposição sintética", existingMeasures: ["Medida fictícia informada"], evidenceRefs: [], assessment: { status: "reported" } }] } };
  const risk = pgr.inventory.items[0];
  const apr: SafetyApr = { id: "apr-a", tenantId: "tenant-a", revision: 3, status: "in_review", title: "APR fictícia", companyId: company.id, unitId: "unit-a", activityStage: "Etapa fictícia", workArea: "Local fictício", responsible: "Pessoa fictícia", pgrInventoryId: pgr.id, pgrRevision: 2, pgrTitle: pgr.inventory.title, risks: [{ inventoryId: pgr.id, inventoryRevision: 2, riskId: risk.id, activity: risk.activity, hazard: risk.hazard, possibleHarm: risk.possibleHarm, exposureDescription: risk.exposureDescription }], checklistTemplateId: "template-a", checklistTemplateVersion: 1, checklistTitle: "Checklist fictício", answers: [{ id: "answer-a", prompt: "Questão sintética", result: "observed", notes: "", nextStep: "", responsible: "" }], createdAt: "2026-10-24", updatedAt: "2026-10-24", createdBy: "account-a" };
  return { company, pgr, apr };
}
test("catálogo apresenta seis PTs e mantém a PTE em categoria separada", () => {
  assert.deepEqual(WORK_PERMIT_TYPES.map(({ label }) => label), ["02 · Altura", "03 · Trabalho a quente", "04 · Içamento", "05 · Escavação", "06 · Mergulho profissional", "07 · Elétrica"]);
  assert.deepEqual(WORK_PERMIT_PTE_TYPES.map(({ label }) => label), ["01 · Entrada e trabalho em espaço confinado"]);
  assert.equal(WORK_PERMIT_TYPES[0].status, "Somente demonstração; conteúdo técnico revisado ainda não fornecido.");
  assert.ok(WORK_PERMIT_TYPES.slice(1).every(({ status }) => status.startsWith("Planejada;")));
  assert.ok(WORK_PERMIT_PTE_TYPES.every(({ status }) => status.startsWith("Planejada;")));
  assert.match(WORK_PERMIT_TYPES[4].note, /aplicabilidade da NORMAM-222 depende do cenário/);
  assert.match(WORK_PERMIT_TYPES[4].note, /ajuste posterior pela equipe/);
});
test("vínculos correspondentes nunca emitem permissão nem inferem adequação técnica", () => {
  const { company, pgr, apr } = fixture();
  const result = assessWorkPermitReadiness("tenant-a", apr, [pgr], [company]);
  assert.equal(result.linksVerified, true);
  assert.equal(result.canIssue, false);
  assert.deepEqual(result.blockers, ["TECHNICAL_PARAMETERS_PENDING", "ACTIVITY_RISK_MAPPING_PENDING", "OPERATIONAL_RELEASE_UNAVAILABLE", "AUTHORIZATION_FLOW_PENDING"]);
  assert.deepEqual(result.risks[0].existingMeasures, pgr.inventory.items[0].existingMeasures);
  result.risks[0].existingMeasures[0] = "Mutação externa";
  assert.equal(pgr.inventory.items[0].existingMeasures[0], "Medida fictícia informada");
});
test("recusa tenant, empresa, unidade ou empresa arquivada sem expor riscos", () => {
  for (const kind of ["apr-tenant", "company-tenant", "unit", "archived"] as const) {
    const { company, pgr, apr } = fixture();
    if (kind === "apr-tenant") apr.tenantId = "tenant-b";
    if (kind === "company-tenant") company.tenantId = "tenant-b";
    if (kind === "unit") apr.unitId = "unit-b";
    if (kind === "archived") company.status = "archived";
    const result = assessWorkPermitReadiness("tenant-a", apr, [pgr], [company]);
    assert.equal(result.linksVerified, false);
    assert.equal(result.risks.length, 0);
    assert.equal(result.canIssue, false);
  }
});
test("fonte ausente, indisponível, ambígua ou fora do tenant falha fechada", () => {
  const { company, pgr, apr } = fixture();
  for (const sources of [null, [], [pgr, pgr], [{ ...pgr, inventory: { ...pgr.inventory, tenantId: "tenant-b" } }]]) {
    const result = assessWorkPermitReadiness("tenant-a", apr, sources, [company]);
    assert.equal(result.linksVerified, false);
    assert.equal(result.risks.length, 0);
    assert.equal(result.canIssue, false);
  }
});
test("PGR não aprovado ou revisão diferente não reutiliza snapshot antigo", () => {
  for (const kind of ["draft", "revision"] as const) {
    const { company, pgr, apr } = fixture();
    if (kind === "draft") pgr.status = "draft"; else pgr.inventory.revision++;
    const result = assessWorkPermitReadiness("tenant-a", apr, [pgr], [company]);
    assert.equal(result.linksVerified, false);
    assert.equal(result.risks.length, 0);
    assert.ok(result.blockers.includes(kind === "draft" ? "PGR_NOT_APPROVED" : "PGR_REVISION_CHANGED"));
  }
});
test("risco ausente, duplicado ou ligado a outra revisão não passa", () => {
  for (const kind of ["none", "missing", "duplicate", "wrong-revision", "source-duplicate"] as const) {
    const { company, pgr, apr } = fixture();
    if (kind === "none") apr.risks = [];
    if (kind === "missing") apr.risks[0].riskId = "absent";
    if (kind === "duplicate") apr.risks.push({ ...apr.risks[0] });
    if (kind === "wrong-revision") apr.risks[0].inventoryRevision++;
    if (kind === "source-duplicate") pgr.inventory.items.push({ ...pgr.inventory.items[0] });
    const result = assessWorkPermitReadiness("tenant-a", apr, [pgr], [company]);
    assert.ok(result.blockers.includes("APR_RISKS_INVALID"));
    assert.equal(result.risks.length, 0);
  }
});
test("mesmo ID com conteúdo divergente não confirma o vínculo", () => {
  const { company, pgr, apr } = fixture();
  apr.risks[0].hazard = "Texto divergente";
  const result = assessWorkPermitReadiness("tenant-a", apr, [pgr], [company]);
  assert.ok(result.blockers.includes("APR_RISK_CONTENT_CHANGED"));
  assert.equal(result.linksVerified, false);
});
test("medidas ausentes e checklist pendente são reportados sem inventar conteúdo", () => {
  const { company, pgr, apr } = fixture();
  pgr.inventory.items[0].existingMeasures = [];
  apr.status = "draft";
  apr.answers[0].result = "attention";
  const result = assessWorkPermitReadiness("tenant-a", apr, [pgr], [company]);
  assert.ok(result.blockers.includes("PGR_MEASURES_ABSENT"));
  assert.ok(result.blockers.includes("APR_CHECKLIST_INCOMPLETE"));
  assert.ok(result.blockers.includes("APR_NOT_IN_REVIEW"));
  assert.deepEqual(result.risks[0].existingMeasures, []);
  assert.equal(result.canIssue, false);
});
