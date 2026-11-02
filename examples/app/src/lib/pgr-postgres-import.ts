import type { PoolClient } from "pg";
import type { PgrDraft } from "./pgr-store";
import { analyzePgrAuditMigration, analyzePgrMigration, previewPgrLegacyMigration } from "./pgr-legacy-migration";
import type { PgrRiskInventory } from "./pgr-risk-inventory";

type LegacyAuditEvent = {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  action: "pgr.created" | "pgr.updated" | "pgr.submitted" | "pgr.approved";
  targetId?: string | null;
  occurredAt: string;
};

type InventoryRow = {
  id: string;
  source_draft_id: string;
  company_id: string;
  unit_id: string;
  title: string;
  activity_description: string;
  action_plan: string;
  status: string;
  reviewer_user_id: string | null;
  reviewer_role: string | null;
  revision: number | string;
  legacy_source: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameTimestamp(actual: Date | string, expected: string): boolean {
  return new Date(actual).toISOString() === new Date(expected).toISOString();
}

function matchesInventory(row: InventoryRow, snapshot: PgrRiskInventory, draft: PgrDraft): boolean {
  return row.id === draft.id
    && row.source_draft_id === draft.id
    && row.company_id === draft.companyId
    && row.unit_id === draft.unitId
    && row.title === draft.title
    && row.activity_description === draft.activityDescription
    && row.action_plan === draft.actionPlan
    && row.status === draft.status
    && row.reviewer_user_id === (draft.reviewerUserId ?? null)
    && row.reviewer_role === (draft.reviewerRole ?? null)
    && Number(row.revision) === snapshot.revision
    && canonicalJson(row.legacy_source) === canonicalJson(snapshot.legacySource)
    && sameTimestamp(row.created_at, draft.createdAt)
    && sameTimestamp(row.updated_at, draft.updatedAt);
}

function matchesAudit(row: Record<string, unknown>, event: LegacyAuditEvent): boolean {
  const targetId = typeof event.targetId === "string" && event.targetId.trim() ? event.targetId : null;
  return row.tenant_id === event.tenantId
    && row.actor_user_id === event.actorUserId
    && row.actor_role === event.actorRole
    && row.action === event.action
    && row.target_id === targetId
    && sameTimestamp(row.occurred_at as Date | string, event.occurredAt);
}

function assertSourceReady(drafts: PgrDraft[], events: LegacyAuditEvent[]) {
  const draftReport = analyzePgrMigration(drafts);
  const auditReport = analyzePgrAuditMigration(events, drafts);
  if (draftReport.blocked || auditReport.blocked) throw new Error("Origem PGR inválida para importação.");
}

export async function importPgrLegacyBatchInTransaction(
  client: PoolClient,
  tenantId: string,
  drafts: PgrDraft[],
  tenantEvents: LegacyAuditEvent[],
): Promise<"imported" | "already_imported"> {
  if (!tenantId || drafts.some((draft) => draft.tenantId !== tenantId) || tenantEvents.some((event) => event.tenantId !== tenantId)) {
    throw new Error("A importação PGR excedeu o escopo da consultoria.");
  }
  const transactionScope = await client.query<{ tenant_id: string | null; read_only: boolean }>(
    "SELECT current_setting('sst.tenant_id', true) AS tenant_id, current_setting('transaction_read_only')::boolean AS read_only",
  );
  if (transactionScope.rows[0]?.tenant_id !== tenantId || transactionScope.rows[0]?.read_only !== false) {
    throw new Error("A importação PGR exige uma transação de escrita no tenant selecionado.");
  }
  assertSourceReady(drafts, tenantEvents);
  const prepared = drafts.map((draft) => {
    const inventory = previewPgrLegacyMigration(draft);
    const snapshotRevision = inventory.legacySource?.snapshots.at(-1);
    if (!snapshotRevision?.actorUserId || !snapshotRevision.actorRole) {
      throw new Error("A origem não identifica o responsável pela revisão inicial.");
    }
    return { draft, inventory, snapshotRevision };
  });
  const draftIds = drafts.map((draft) => draft.id);
  if (new Set(draftIds).size !== draftIds.length || new Set(tenantEvents.map((event) => event.id)).size !== tenantEvents.length) {
    throw new Error("A origem contém chaves repetidas; importação interrompida.");
  }

  const selected = await client.query<InventoryRow>(
    `SELECT id, source_draft_id, company_id, unit_id, title, activity_description, action_plan, status,
       reviewer_user_id, reviewer_role, revision, legacy_source, created_at, updated_at
     FROM sst.pgr_risk_inventories WHERE tenant_id = $1
       AND (source_draft_id = ANY($2::text[]) OR id = ANY($2::text[])) FOR UPDATE`,
    [tenantId, draftIds],
  );
  if (selected.rows.length !== new Set(selected.rows.map((row) => row.source_draft_id)).size) throw new Error("Conflito de chave no destino PGR.");

  const revisionResult = await client.query<{ inventory_id: string; revision: number | string; content: PgrRiskInventory; created_at: Date | string }>(
    `SELECT inventory_id, revision, content, created_at FROM sst.pgr_risk_inventory_revisions
     WHERE tenant_id = $1 AND inventory_id = ANY($2::text[])`,
    [tenantId, draftIds],
  );
  const itemResult = await client.query<{ inventory_id: string; count: number | string }>(
    "SELECT inventory_id, count(*)::integer AS count FROM sst.pgr_risk_items WHERE tenant_id = $1 AND inventory_id = ANY($2::text[]) GROUP BY inventory_id",
    [tenantId, draftIds],
  );
  const auditResult = await client.query<Record<string, unknown>>(
    `SELECT id, tenant_id, actor_user_id, actor_role, action, target_id, occurred_at
     FROM sst.pgr_audit_history WHERE tenant_id = $1`,
    [tenantId],
  );
  const destinationCountResult = await client.query<{ count: number | string }>(
    "SELECT count(*)::integer AS count FROM sst.pgr_risk_inventories WHERE tenant_id = $1",
    [tenantId],
  );

  const inventoryBySource = new Map(selected.rows.map((row) => [row.source_draft_id, row]));
  const revisionsByInventory = new Map(revisionResult.rows.map((row) => [row.inventory_id, row]));
  const itemsByInventory = new Map(itemResult.rows.map((row) => [row.inventory_id, Number(row.count)]));
  const allDraftsPresent = prepared.every(({ draft, inventory, snapshotRevision }) => {
    const row = inventoryBySource.get(draft.id);
    const snapshot = revisionsByInventory.get(draft.id);
    return !!row && !!snapshot
      && matchesInventory(row, inventory, draft)
      && Number(snapshot.revision) === inventory.revision
      && canonicalJson(snapshot.content) === canonicalJson(inventory)
      && sameTimestamp(snapshot.created_at, snapshotRevision.savedAt)
      && (itemsByInventory.get(draft.id) ?? 0) === 0;
  });
  const completeHeaderAndSnapshotSet = selected.rows.length === prepared.length
    && revisionResult.rows.length === prepared.length
    && prepared.every(({ draft, inventory }) => Number(revisionsByInventory.get(draft.id)?.revision) === inventory.revision);
  const allEventsPresent = auditResult.rows.length === tenantEvents.length
    && tenantEvents.every((event) => {
      const row = auditResult.rows.find((candidate) => candidate.id === event.id);
      return row && matchesAudit(row, event);
    });
  const completeTenantInventorySet = Number(destinationCountResult.rows[0]?.count ?? 0) === prepared.length;
  if (selected.rowCount || revisionResult.rowCount || itemResult.rowCount || auditResult.rowCount || Number(destinationCountResult.rows[0]?.count ?? 0) > 0) {
    if (allDraftsPresent && completeHeaderAndSnapshotSet && allEventsPresent && completeTenantInventorySet) return "already_imported";
    throw new Error("Destino PGR está parcial ou diverge da origem; lote interrompido sem sobrescrever dados.");
  }

  for (const { draft, inventory, snapshotRevision } of prepared) {
    await client.query(
      `INSERT INTO sst.pgr_risk_inventories
       (tenant_id, id, source_draft_id, company_id, unit_id, title, activity_description, action_plan,
        status, reviewer_user_id, reviewer_role, revision, legacy_source, created_at, updated_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)`,
      [tenantId, draft.id, draft.companyId, draft.unitId, draft.title, draft.activityDescription, draft.actionPlan,
        draft.status, draft.reviewerUserId ?? null, draft.reviewerRole ?? null, inventory.revision,
        JSON.stringify(inventory.legacySource), draft.createdAt, draft.updatedAt],
    );
    await client.query(
      `INSERT INTO sst.pgr_risk_inventory_revisions
       (tenant_id, inventory_id, revision, content, actor_user_id, actor_role, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [tenantId, draft.id, inventory.revision, JSON.stringify(inventory), snapshotRevision.actorUserId,
        snapshotRevision.actorRole, snapshotRevision.savedAt],
    );
  }
  for (const event of tenantEvents) {
    await client.query(
      `INSERT INTO sst.pgr_audit_history (id, tenant_id, actor_user_id, actor_role, action, target_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, tenantId, event.actorUserId, event.actorRole, event.action,
        typeof event.targetId === "string" && event.targetId.trim() ? event.targetId : null, event.occurredAt],
    );
  }
  return "imported";
}
