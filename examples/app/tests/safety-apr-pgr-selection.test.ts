import assert from "node:assert/strict";
import test from "node:test";
import type { PgrInventoryRecord } from "../src/lib/pgr-postgres-operations.ts";
import { selectApprovedPgrRisks } from "../src/lib/safety-apr-pgr-selection.ts";

function fixture(overrides: Partial<PgrInventoryRecord> = {}): PgrInventoryRecord {
  return {
    id: "pgr-a",
    status: "approved",
    createdAt: "2026-10-24T12:00:00.000Z",
    updatedAt: "2026-10-24T12:00:00.000Z",
    inventory: {
      schemaVersion: 1,
      tenantId: "tenant-a",
      companyId: "company-a",
      unitId: "unit-a",
      revision: 2,
      title: "PGR de teste",
      activityDescription: "Atividade sintética",
      actionPlan: "Plano sintético",
      items: [
        { id: "risk-a", process: "Processo", activity: "Atividade A", hazard: "Perigo A", sourceCircumstance: "Fonte", possibleHarm: "Dano", exposedGroups: [], exposureDescription: "Descrição", existingMeasures: [], evidenceRefs: [], assessment: { status: "reported" } },
        { id: "risk-b", process: "Processo", activity: "Atividade B", hazard: "Perigo B", sourceCircumstance: "Fonte", possibleHarm: "Dano", exposedGroups: [], exposureDescription: "Descrição", existingMeasures: [], evidenceRefs: [], assessment: { status: "reported" } },
      ],
    },
    ...overrides,
  };
}

const requested = {
  tenantId: "tenant-a",
  inventoryId: "pgr-a",
  companyId: "company-a",
  unitId: "unit-a",
  riskIds: ["risk-b"],
};

test("APR resolve somente riscos explicitamente selecionados do PGR aprovado e escopo correspondente", () => {
  const result = selectApprovedPgrRisks([fixture()], requested);

  assert.ok(result);
  assert.equal(result.inventory.id, "pgr-a");
  assert.equal(result.inventory.inventory.revision, 2);
  assert.deepEqual(result.risks.map(({ id }) => id), ["risk-b"]);
});

test("APR rejeita PGR não aprovado, de outro tenant ou de outro escopo", () => {
  assert.equal(selectApprovedPgrRisks([fixture({ status: "draft" })], requested), null);
  assert.equal(selectApprovedPgrRisks([fixture({ status: "in_review" })], requested), null);
  assert.equal(selectApprovedPgrRisks([fixture({
    inventory: { ...fixture().inventory, tenantId: "tenant-b" },
  })], requested), null);
  assert.equal(selectApprovedPgrRisks([fixture({
    inventory: { ...fixture().inventory, companyId: "company-b" },
  })], requested), null);
  assert.equal(selectApprovedPgrRisks([fixture({
    inventory: { ...fixture().inventory, unitId: "unit-b" },
  })], requested), null);
});

test("APR rejeita risco ausente, seleção vazia ou IDs duplicados", () => {
  assert.equal(selectApprovedPgrRisks([fixture()], { ...requested, riskIds: ["risk-absent"] }), null);
  assert.equal(selectApprovedPgrRisks([fixture()], { ...requested, riskIds: [] }), null);
  assert.equal(selectApprovedPgrRisks([fixture()], { ...requested, riskIds: ["risk-a", "risk-a"] }), null);
});
