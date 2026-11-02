import assert from "node:assert/strict";
import test from "node:test";
import type { PgrDraft } from "../src/lib/pgr-store.ts";
import { analyzePgrAuditMigration, analyzePgrMigration, previewPgrLegacyMigration } from "../src/lib/pgr-legacy-migration.ts";
import { validatePgrRiskInventory } from "../src/lib/pgr-risk-inventory.ts";

function draft(): PgrDraft {
  const revision = (version: number, riskInventory: string) => ({
    version,
    companyId: "company-ficticia",
    unitId: "unit-ficticia",
    title: `PGR ${version}`,
    activityDescription: `Atividade ${version}`,
    riskInventory,
    actionPlan: `Plano ${version}`,
    savedAt: `2026-10-0${version}T10:00:00.000Z`,
    actorUserId: `actor-${version}`,
    actorRole: "consultoria_admin" as const,
  });
  return {
    id: "draft-ficticio",
    tenantId: "tenant-ficticio",
    companyId: "company-ficticia",
    unitId: "unit-ficticia",
    title: "PGR atual",
    activityDescription: "Atividade atual",
    riskInventory: "Relato atual: não classificar automaticamente.",
    actionPlan: "Plano atual",
    status: "draft",
    authorUserId: "actor-2",
    revision: 3,
    revisions: [revision(1, "Relato anterior 1"), revision(2, "Relato anterior 2")],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-03T10:00:00.000Z",
    history: [{ id: "event-draft", action: "draft", occurredAt: "2026-10-01T10:00:00.000Z", actorUserId: "actor-1", actorRole: "consultoria_admin" }],
  };
}

test("prévia preserva todas as revisões e adiciona estado atual divergente sem estruturar riscos", () => {
  const source = draft();
  const migrated = previewPgrLegacyMigration(source);
  assert.deepEqual(migrated.items, []);
  assert.deepEqual(migrated.legacySource?.history, source.history);
  assert.deepEqual(migrated.legacySource?.snapshots.map((snapshot) => snapshot.riskInventory), [
    "Relato anterior 1",
    "Relato anterior 2",
    "Relato atual: não classificar automaticamente.",
  ]);
  assert.ok("value" in validatePgrRiskInventory(migrated));
  assert.equal(source.revisions.length, 2);
});

test("prévia evita duplicar o snapshot quando o estado atual já é a última revisão", () => {
  const source = draft();
  source.revisions[1] = {
    ...source.revisions[1],
    title: source.title,
    activityDescription: source.activityDescription,
    riskInventory: source.riskInventory,
    actionPlan: source.actionPlan,
  };
  const migrated = previewPgrLegacyMigration(source);
  assert.equal(migrated.legacySource?.snapshots.length, 2);
  assert.ok("error" in validatePgrRiskInventory({ ...migrated, accidentalField: true }));
});

test("pré-check reporta duplicidade e limite sem incluir os textos legados", () => {
  const first = draft();
  first.revisions = [];
  const duplicate = { ...draft(), riskInventory: "conteúdo privado".repeat(400) };
  const report = analyzePgrMigration([first, duplicate]);
  assert.equal(report.total, 2);
  assert.equal(report.ready, 1);
  assert.equal(report.blocked, 1);
  assert.ok(report.issues.some((issue) => issue.code === "duplicate_source_key"));
  assert.ok(report.issues.some((issue) => issue.code === "snapshot_limit_exceeded"));
  assert.ok(report.issues.some((issue) => issue.code === "missing_revision_history" && issue.severity === "warning"));
  assert.equal(JSON.stringify(report).includes("conteúdo privado"), false);
});

test("pré-check aceita histórico ausente como aviso quando o snapshot atual é válido", () => {
  const source = draft();
  source.revisions = [];
  const report = analyzePgrMigration([source]);
  assert.equal(report.ready, 1);
  assert.equal(report.blocked, 0);
  assert.equal(report.warnings, 1);
});

test("pré-check bloqueia referência a empresa/unidade fora do escopo fornecido", () => {
  const report = analyzePgrMigration([draft()], new Set(["tenant-ficticio\u0000outra-empresa\u0000outra-unidade"]));
  assert.equal(report.ready, 0);
  assert.equal(report.blocked, 1);
  assert.ok(report.issues.some((issue) => issue.code === "unresolved_company_unit"));
});

test("pré-check sinaliza coleção de origem inválida como blocker", () => {
  const report = analyzePgrMigration({ not: "a list" });
  assert.ok(report.issues.some((issue) => issue.code === "invalid_collection" && issue.severity === "blocker"));
});

test("auditoria PGR preserva evento sem alvo e bloqueia ID duplicado", () => {
  const events = [
    { id: "audit-1", tenantId: "tenant-ficticio", actorUserId: "actor", actorRole: "consultoria_admin", action: "pgr.created", targetId: "draft-ficticio", occurredAt: "2026-10-01T10:00:00.000Z" },
    { id: "audit-2", tenantId: "tenant-ficticio", actorUserId: "actor", actorRole: "consultoria_admin", action: "pgr.updated", occurredAt: "2026-10-02T10:00:00.000Z" },
    { id: "audit-2", tenantId: "tenant-ficticio", actorUserId: "actor", actorRole: "consultoria_admin", action: "pgr.approved", targetId: "draft-ficticio", occurredAt: "2026-10-03T10:00:00.000Z" },
  ];
  const report = analyzePgrAuditMigration(events, [draft()]);
  assert.equal(report.total, 3);
  assert.equal(report.ready, 2);
  assert.equal(report.unlinked, 1);
  assert.equal(report.blocked, 1);
  assert.ok(report.issues.some((issue) => issue.code === "unlinked_event" && issue.severity === "warning"));
  assert.ok(report.issues.some((issue) => issue.code === "duplicate_event_id" && issue.severity === "blocker"));
});

test("auditoria avisa vínculo órfão sem anexar a outro tenant", () => {
  const event = { id: "audit-cross", tenantId: "tenant-aurora", actorUserId: "actor", actorRole: "consultoria_admin", action: "pgr.updated", targetId: "draft-ficticio", occurredAt: "2026-10-03T10:00:00.000Z" };
  const report = analyzePgrAuditMigration([event], [draft()]);
  assert.equal(report.ready, 1);
  assert.equal(report.blocked, 0);
  assert.ok(report.issues.some((issue) => issue.code === "cross_tenant_target" && issue.severity === "warning"));
});
