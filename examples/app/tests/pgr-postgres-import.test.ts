import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { importPgrLegacyBatchInTransaction } from "../src/lib/pgr-postgres-import.ts";
import { previewPgrLegacyMigration } from "../src/lib/pgr-legacy-migration.ts";
import type { PgrDraft } from "../src/lib/pgr-store.ts";
import { executeTenantWriteTransaction, type TenantWriteContext } from "../src/lib/tenant-write-operations.ts";

const tenantId = "tenant-import-test";
const context: TenantWriteContext = { tenantId, userId: "migration-test", role: "consultoria_admin" };

function draft(id: string, status: PgrDraft["status"] = "draft"): PgrDraft {
  const createdAt = "2026-10-01T09:00:00.000Z";
  const updatedAt = "2026-10-02T10:00:00.000Z";
  const revision = {
    version: 1,
    companyId: "company-import-test",
    unitId: "unit-import-test",
    title: `PGR ${id}`,
    activityDescription: "Atividade fictícia para teste.",
    riskInventory: "Relato legado preservado.",
    actionPlan: "Plano legado preservado.",
    savedAt: updatedAt,
    actorUserId: "author-import-test",
    actorRole: "consultoria_admin" as const,
  };
  return {
    id,
    tenantId,
    companyId: revision.companyId,
    unitId: revision.unitId,
    title: revision.title,
    activityDescription: revision.activityDescription,
    riskInventory: revision.riskInventory,
    actionPlan: revision.actionPlan,
    status,
    authorUserId: revision.actorUserId,
    ...(status === "approved" ? { reviewerUserId: "reviewer-import-test", reviewerRole: "consultoria_admin" as const } : {}),
    revision: 1,
    revisions: [revision],
    createdAt,
    updatedAt,
    history: [
      { id: `history-${id}`, action: "draft", occurredAt: createdAt, actorUserId: revision.actorUserId, actorRole: revision.actorRole },
      ...(status === "approved" ? [{ id: `review-${id}`, action: "approved" as const, occurredAt: updatedAt, actorUserId: "reviewer-import-test", actorRole: "consultoria_admin" as const }] : []),
    ],
  };
}

function auditEvent(id = "audit-import-test") {
  return {
    id,
    tenantId,
    actorUserId: "audit-actor-test",
    actorRole: "consultoria_admin",
    action: "pgr.created" as const,
    occurredAt: "2026-10-01T09:00:00.000Z",
  };
}

function fakeClient(options: {
  inventories?: Record<string, unknown>[];
  revisions?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  audit?: Record<string, unknown>[];
  destinationCount?: number;
  scopeTenant?: string;
  readOnly?: boolean;
  failAuditInsert?: boolean;
} = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      statements.push({ sql: normalized, values });
      if (normalized.startsWith("SELECT current_setting('sst.tenant_id'")) {
        return { rows: [{ tenant_id: options.scopeTenant ?? tenantId, read_only: options.readOnly ?? false }], rowCount: 1 };
      }
      if (normalized.startsWith("SELECT id, source_draft_id")) return { rows: options.inventories ?? [], rowCount: options.inventories?.length ?? 0 };
      if (normalized.startsWith("SELECT inventory_id, revision, content")) return { rows: options.revisions ?? [], rowCount: options.revisions?.length ?? 0 };
      if (normalized.startsWith("SELECT inventory_id, count(*)")) return { rows: options.items ?? [], rowCount: options.items?.length ?? 0 };
      if (normalized.startsWith("SELECT id, tenant_id, actor_user_id")) return { rows: options.audit ?? [], rowCount: options.audit?.length ?? 0 };
      if (normalized.startsWith("SELECT count(*)::integer AS count FROM sst.pgr_risk_inventories")) {
        return { rows: [{ count: options.destinationCount ?? options.inventories?.length ?? 0 }], rowCount: 1 };
      }
      if (normalized.startsWith("INSERT INTO sst.pgr_audit_history") && options.failAuditInsert) throw new Error("falha de auditoria simulada");
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as unknown as PoolClient, statements };
}

function existingInventory(source: PgrDraft) {
  const snapshot = previewPgrLegacyMigration(source);
  return {
    id: source.id,
    source_draft_id: source.id,
    company_id: source.companyId,
    unit_id: source.unitId,
    title: source.title,
    activity_description: source.activityDescription,
    action_plan: source.actionPlan,
    status: source.status,
    reviewer_user_id: source.reviewerUserId ?? null,
    reviewer_role: source.reviewerRole ?? null,
    revision: 1,
    legacy_source: snapshot.legacySource,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
  };
}

function existingRevision(source: PgrDraft) {
  const content = previewPgrLegacyMigration(source);
  return { inventory_id: source.id, revision: 1, content, created_at: content.legacySource?.snapshots.at(-1)?.savedAt };
}

function existingAudit(event: ReturnType<typeof auditEvent>) {
  return { id: event.id, tenant_id: event.tenantId, actor_user_id: event.actorUserId, actor_role: event.actorRole, action: event.action, target_id: null, occurred_at: event.occurredAt };
}

test("importa o lote preservando status, revisor, timestamps e eventos sem alvo", async () => {
  const sources = [draft("draft-import-a"), draft("draft-import-b", "approved")];
  const events = [auditEvent()];
  const { client, statements } = fakeClient();
  const result = await executeTenantWriteTransaction(client, context, (tx) =>
    importPgrLegacyBatchInTransaction(tx, tenantId, sources, events));
  assert.equal(result, "imported");
  const headers = statements.filter(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_risk_inventories"));
  assert.equal(headers.length, 2);
  const approved = headers.find(({ values }) => values[1] === "draft-import-b");
  assert.equal(approved?.values[7], "approved");
  assert.equal(approved?.values[8], "reviewer-import-test");
  assert.equal(approved?.values[12], sources[1].createdAt);
  assert.equal(approved?.values[13], sources[1].updatedAt);
  const historyInsert = statements.find(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_audit_history"));
  assert.equal(historyInsert?.values[0], events[0].id);
  assert.equal(historyInsert?.values[5], null);
  assert.equal(statements.at(-1)?.sql, "COMMIT");
});

test("retentativa só é idempotente quando lote, snapshots e auditoria conferem integralmente", async () => {
  const source = draft("draft-existing-test");
  const event = auditEvent("audit-existing-test");
  const { client } = fakeClient({ inventories: [existingInventory(source)], revisions: [existingRevision(source)], audit: [existingAudit(event)] });
  const result = await importPgrLegacyBatchInTransaction(client, tenantId, [source], [event]);
  assert.equal(result, "already_imported");
});

test("lote parcialmente importado ou divergente aborta antes de qualquer INSERT", async () => {
  const source = draft("draft-partial-test");
  const { client, statements } = fakeClient({ inventories: [existingInventory(source)] });
  await assert.rejects(importPgrLegacyBatchInTransaction(client, tenantId, [source], [auditEvent()]), /parcial ou diverge/);
  assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO")), false);
});

test("retentativa detecta registros ou eventos adicionais no tenant", async () => {
  const source = draft("draft-complete-test");
  const event = auditEvent("audit-complete-test");
  const { client: extraEventClient } = fakeClient({
    inventories: [existingInventory(source)],
    revisions: [existingRevision(source)],
    audit: [existingAudit(event), existingAudit(auditEvent("audit-unexpected-test"))],
  });
  await assert.rejects(importPgrLegacyBatchInTransaction(extraEventClient, tenantId, [source], [event]), /parcial ou diverge/);

  const { client: extraInventoryClient } = fakeClient({ destinationCount: 1 });
  await assert.rejects(importPgrLegacyBatchInTransaction(extraInventoryClient, tenantId, [], []), /parcial ou diverge/);
});

test("retentativa rejeita divergência no revisor, revisão adicional ou item estruturado", async () => {
  const source = draft("draft-exact-retry-test", "approved");
  const event = auditEvent("audit-exact-retry-test");
  const inventory = existingInventory(source);
  const revision = existingRevision(source);
  const audit = existingAudit(event);

  const reviewerMismatch = fakeClient({
    inventories: [{ ...inventory, reviewer_user_id: "reviewer-divergente" }],
    revisions: [revision],
    audit: [audit],
  });
  await assert.rejects(importPgrLegacyBatchInTransaction(reviewerMismatch.client, tenantId, [source], [event]), /parcial ou diverge/);
  assert.equal(reviewerMismatch.statements.some(({ sql }) => sql.startsWith("INSERT INTO")), false);

  const extraRevision = fakeClient({
    inventories: [inventory],
    revisions: [revision, { ...revision, revision: 2 }],
    audit: [audit],
  });
  await assert.rejects(importPgrLegacyBatchInTransaction(extraRevision.client, tenantId, [source], [event]), /parcial ou diverge/);
  assert.equal(extraRevision.statements.some(({ sql }) => sql.startsWith("INSERT INTO")), false);

  const structuredItem = fakeClient({
    inventories: [inventory],
    revisions: [revision],
    items: [{ inventory_id: source.id, count: 1 }],
    audit: [audit],
  });
  await assert.rejects(importPgrLegacyBatchInTransaction(structuredItem.client, tenantId, [source], [event]), /parcial ou diverge/);
  assert.equal(structuredItem.statements.some(({ sql }) => sql.startsWith("INSERT INTO")), false);
});

test("falha ao gravar evento reverte todo o lote", async () => {
  const sources = [draft("draft-rollback-a"), draft("draft-rollback-b")];
  const { client, statements } = fakeClient({ failAuditInsert: true });
  await assert.rejects(executeTenantWriteTransaction(client, context, (tx) =>
    importPgrLegacyBatchInTransaction(tx, tenantId, sources, [auditEvent("audit-rollback-test")])), /falha de auditoria simulada/);
  assert.ok(statements.some(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_risk_inventories")));
  assert.equal(statements.at(-1)?.sql, "ROLLBACK");
  assert.equal(statements.some(({ sql }) => sql === "COMMIT"), false);
});

test("não permite importar dados de outra consultoria", async () => {
  const { client, statements } = fakeClient();
  await assert.rejects(importPgrLegacyBatchInTransaction(client, tenantId, [draft("draft-foreign-test", "draft")].map((record) => ({ ...record, tenantId: "tenant-foreign" })), []), /escopo da consultoria/);
  assert.equal(statements.length, 0);
});

test("exige contexto de escrita tenant-scoped antes de consultar o domínio", async () => {
  const wrongTenant = fakeClient({ scopeTenant: "tenant-other-test" });
  await assert.rejects(importPgrLegacyBatchInTransaction(wrongTenant.client, tenantId, [draft("draft-scope-test")], []), /transação de escrita/);
  assert.equal(wrongTenant.statements.length, 1);

  const readOnly = fakeClient({ readOnly: true });
  await assert.rejects(importPgrLegacyBatchInTransaction(readOnly.client, tenantId, [draft("draft-readonly-test")], []), /transação de escrita/);
  assert.equal(readOnly.statements.length, 1);
});
