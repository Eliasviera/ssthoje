import assert from "node:assert/strict";
import test from "node:test";
import type { PgrInventoryRecord } from "../src/lib/pgr-postgres-operations.ts";
import { validatePcmsoRiskLink, type PcmsoRiskLink } from "../src/lib/pcmso-risk-link.ts";

function source(): PgrInventoryRecord {
  return {
    id: "inventory-1",
    status: "approved",
    createdAt: "2026-10-12T12:00:00.000Z",
    updatedAt: "2026-10-12T12:00:00.000Z",
    inventory: {
      schemaVersion: 1,
      tenantId: "tenant-1",
      companyId: "company-1",
      unitId: "unit-1",
      revision: 3,
      title: "PGR fictício",
      activityDescription: "Atividade de demonstração",
      actionPlan: "A revisar",
      items: [{
        id: "risk-1", process: "", activity: "", hazard: "", sourceCircumstance: "", possibleHarm: "",
        exposedGroups: [], exposureDescription: "", existingMeasures: [], evidenceRefs: [], assessment: { status: "reported" },
      }],
    },
  };
}

function link(): PcmsoRiskLink {
  return {
    schemaVersion: 1,
    tenantId: "tenant-1",
    companyId: "company-1",
    unitId: "unit-1",
    inventoryId: "inventory-1",
    inventoryRevision: 3,
    riskItemIds: ["risk-1"],
    medicalReview: { status: "pending" },
  };
}

test("aceita referência pendente a risco existente na revisão aprovada da unidade", () => {
  assert.ok("value" in validatePcmsoRiskLink(link(), source()));
});

test("exige revisão médica explícita e com autoria/data", () => {
  const value = link();
  value.medicalReview = { status: "reviewed", reviewerUserId: "doctor-1", reviewedAt: "2026-10-12T12:30:00.000Z" };
  assert.ok("value" in validatePcmsoRiskLink(value, source()));
  value.medicalReview.reviewerUserId = "";
  assert.ok("error" in validatePcmsoRiskLink(value, source()));
});

test("rejeita risco desconhecido, versão obsoleta e inventário não aprovado", () => {
  const unknownRisk = link();
  unknownRisk.riskItemIds = ["risk-missing"];
  assert.ok("error" in validatePcmsoRiskLink(unknownRisk, source()));

  const stale = link();
  stale.inventoryRevision = 2;
  assert.ok("error" in validatePcmsoRiskLink(stale, source()));

  const draft = source();
  draft.status = "draft";
  assert.ok("error" in validatePcmsoRiskLink(link(), draft));
});

test("rejeita escopo de outra unidade e IDs duplicados", () => {
  const wrongUnit = link();
  wrongUnit.unitId = "unit-2";
  assert.ok("error" in validatePcmsoRiskLink(wrongUnit, source()));

  const duplicates = link();
  duplicates.riskItemIds = ["risk-1", "risk-1"];
  assert.ok("error" in validatePcmsoRiskLink(duplicates, source()));
});
