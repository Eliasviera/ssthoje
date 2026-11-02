import assert from "node:assert/strict";
import test from "node:test";
import type { PgrInventoryRecord } from "../src/lib/pgr-postgres-operations.ts";
import { projectPgrPostgresLegacyView } from "../src/lib/pgr-postgres-legacy-view.ts";
import { previewPgrLegacyMigration } from "../src/lib/pgr-legacy-migration.ts";
import type { PgrDraft } from "../src/lib/pgr-store.ts";

function draft(): PgrDraft {
  const firstRevision = {
    version: 1,
    companyId: "company-view-test",
    unitId: "unit-view-test",
    title: "PGR inicial",
    activityDescription: "Atividade inicial",
    riskInventory: "Relato legado versão inicial.",
    actionPlan: "Plano inicial",
    savedAt: "2026-10-01T10:00:00.000Z",
    actorUserId: "author-view-test",
    actorRole: "consultoria_admin" as const,
  };
  const currentRevision = {
    ...firstRevision,
    version: 2,
    title: "PGR atual",
    activityDescription: "Atividade atual",
    riskInventory: "Relato legado atual.",
    actionPlan: "Plano atual",
    savedAt: "2026-10-02T10:00:00.000Z",
    actorUserId: "reviewer-view-test",
  };
  return {
    id: "draft-view-test",
    tenantId: "tenant-view-test",
    companyId: currentRevision.companyId,
    unitId: currentRevision.unitId,
    title: currentRevision.title,
    activityDescription: currentRevision.activityDescription,
    riskInventory: currentRevision.riskInventory,
    actionPlan: currentRevision.actionPlan,
    status: "approved",
    authorUserId: firstRevision.actorUserId,
    reviewerUserId: "reviewer-view-test",
    reviewerRole: "consultoria_admin",
    revision: 2,
    revisions: [firstRevision, currentRevision],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: currentRevision.savedAt,
    history: [{ id: "history-view-test", action: "approved", occurredAt: currentRevision.savedAt, actorUserId: "reviewer-view-test", actorRole: "consultoria_admin" }],
  };
}

function record(source: PgrDraft): PgrInventoryRecord {
  return {
    id: source.id,
    status: source.status,
    reviewerUserId: source.reviewerUserId,
    reviewerRole: source.reviewerRole,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    inventory: previewPgrLegacyMigration(source),
  };
}

test("projeção separa revisão original de storage e preserva relato/histórico sem inferir itens", () => {
  const source = draft();
  const projected = projectPgrPostgresLegacyView(record(source));

  assert.equal(projected.sourceRevision, 2);
  assert.equal(projected.storageRevision, 1);
  assert.equal(projected.legacyRiskReport, source.riskInventory);
  assert.equal(projected.status, source.status);
  assert.equal(projected.reviewerUserId, source.reviewerUserId);
  assert.deepEqual(projected.legacySnapshots.map((snapshot) => snapshot.riskInventory), [
    "Relato legado versão inicial.",
    "Relato legado atual.",
  ]);
  assert.deepEqual(projected.history, source.history);
  assert.deepEqual(projected.items, []);
});

test("projeção rejeita ausência ou vínculo divergente da origem legada", () => {
  const imported = record(draft());
  assert.throws(() => projectPgrPostgresLegacyView({ ...imported, inventory: { ...imported.inventory, legacySource: undefined } }), /origem legada/);
  assert.throws(() => projectPgrPostgresLegacyView({ ...imported, inventory: { ...imported.inventory, legacySource: { ...imported.inventory.legacySource!, draftId: "outro-draft" } } }), /origem legada/);
});

test("projeção devolve cópias defensivas de itens e histórico", () => {
  const source = draft();
  const imported = record(source);
  imported.inventory.items = [{
    id: "risk-view-test",
    process: "Processo informado",
    activity: "Atividade observada",
    hazard: "Perigo relatado",
    sourceCircumstance: "Circunstância relatada",
    possibleHarm: "A validar",
    exposedGroups: ["Função demonstrativa"],
    exposureDescription: "A descrever",
    existingMeasures: [],
    evidenceRefs: [],
    assessment: { status: "reported" },
    exposureEvaluations: [{ id: "evaluation-view-test", agent: "Agente demonstrativo", type: "quantitative", status: "planned", evidenceRefs: ["evidence-view-test"] }],
  }];
  const projected = projectPgrPostgresLegacyView(imported);
  projected.items[0].exposedGroups.push("Alteração local");
  projected.items[0].exposureEvaluations?.[0].evidenceRefs.push("alteração local");
  projected.history[0].action = "updated";
  assert.deepEqual(imported.inventory.items[0].exposedGroups, ["Função demonstrativa"]);
  assert.deepEqual(imported.inventory.items[0].exposureEvaluations?.[0].evidenceRefs, ["evidence-view-test"]);
  assert.equal(imported.inventory.legacySource?.history[0].action, "approved");
});
