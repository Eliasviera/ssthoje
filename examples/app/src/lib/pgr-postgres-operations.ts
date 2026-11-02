import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { TenantWriteContext } from "./tenant-write-operations";
import { validatePgrRiskInventory, type PgrRiskInventory, type PgrRiskItem } from "./pgr-risk-inventory";

type PgrActor = Pick<TenantWriteContext, "userId" | "role">;
type InventoryRow = { company_id: string; unit_id: string; status: string; revision: number | string; legacy_source?: unknown };
export type PgrInventoryRecord = { id: string; status: "draft" | "in_review" | "approved"; reviewerUserId?: string; reviewerRole?: string; createdAt: string; updatedAt: string; inventory: PgrRiskInventory };
export type PgrRiskOptionSet = {
  inventoryId: string;
  inventoryRevision: number;
  companyId: string;
  unitId: string;
  title: string;
  risks: Array<Pick<PgrRiskItem, "id" | "process" | "activity" | "hazard" | "possibleHarm" | "exposureDescription">>;
};

export class PgrTransitionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PgrTransitionBlockedError";
  }
}

function ensureInventory(inventory: PgrRiskInventory, tenantId: string) {
  const result = validatePgrRiskInventory(inventory);
  if ("error" in result || result.value.tenantId !== tenantId) throw new Error("Inventário PGR inválido para esta consultoria.");
  return result.value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function listPgrInventoriesInTransaction(client: PoolClient, tenantId: string): Promise<PgrInventoryRecord[]> {
  const result = await client.query<{
    id: string; status: string; reviewer_user_id: string | null; reviewer_role: string | null;
    company_id: string; unit_id: string; title: string; activity_description: string; action_plan: string;
    created_at: Date | string; updated_at: Date | string; revision: number | string; content: PgrRiskInventory;
  }>(
    `SELECT i.id, i.status, i.reviewer_user_id, i.reviewer_role, i.company_id, i.unit_id,
       i.title, i.activity_description, i.action_plan, i.created_at, i.updated_at, i.revision, r.content
     FROM sst.pgr_risk_inventories i
     JOIN sst.pgr_risk_inventory_revisions r
       ON r.tenant_id = i.tenant_id AND r.inventory_id = i.id AND r.revision = i.revision
     WHERE i.tenant_id = $1 ORDER BY i.updated_at DESC, i.id`,
    [tenantId],
  );
  return result.rows.map((row) => {
    const checked = validatePgrRiskInventory(row.content);
    if ("error" in checked || checked.value.tenantId !== tenantId || checked.value.companyId !== row.company_id || checked.value.unitId !== row.unit_id
      || checked.value.title !== row.title || checked.value.activityDescription !== row.activity_description || checked.value.actionPlan !== row.action_plan
      || Number(row.revision) !== checked.value.revision
      || !["draft", "in_review", "approved"].includes(row.status)) throw new Error("Snapshot PGR ausente ou incompatível com o cabeçalho.");
    return {
      id: row.id,
      status: row.status as PgrInventoryRecord["status"],
      ...(row.reviewer_user_id ? { reviewerUserId: row.reviewer_user_id } : {}),
      ...(row.reviewer_role ? { reviewerRole: row.reviewer_role } : {}),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      inventory: checked.value,
    };
  });
}

export async function listApprovedPgrRiskOptionsInTransaction(
  client: PoolClient,
  tenantId: string,
  scopes: Array<{ companyId: string; unitId: string }>,
): Promise<PgrRiskOptionSet[]> {
  if (!scopes.length) return [];
  const result = await client.query<{
    id: string; company_id: string; unit_id: string; title: string; revision: number | string;
    content: PgrRiskInventory;
  }>(
    `SELECT i.id, i.company_id, i.unit_id, i.title, i.revision, r.content
     FROM sst.pgr_risk_inventories i
     JOIN sst.pgr_risk_inventory_revisions r
       ON r.tenant_id = i.tenant_id AND r.inventory_id = i.id AND r.revision = i.revision
     WHERE i.tenant_id = $1 AND i.status = 'approved'
       AND EXISTS (
         SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS assigned(company_id text, unit_id text)
         WHERE assigned.company_id = i.company_id::text AND assigned.unit_id = i.unit_id::text
       )
     ORDER BY i.company_id, i.unit_id, i.updated_at DESC, i.id`,
    [tenantId, JSON.stringify(scopes)],
  );
  return result.rows.map((row) => {
    const checked = validatePgrRiskInventory(row.content);
    if ("error" in checked || checked.value.tenantId !== tenantId || checked.value.companyId !== row.company_id
      || checked.value.unitId !== row.unit_id || checked.value.title !== row.title
      || checked.value.revision !== Number(row.revision)) {
      throw new Error("Snapshot do PGR aprovado ausente ou incompatível.");
    }
    return {
      inventoryId: row.id,
      inventoryRevision: Number(row.revision),
      companyId: row.company_id,
      unitId: row.unit_id,
      title: row.title,
      risks: checked.value.items.map(({ id, process, activity, hazard, possibleHarm, exposureDescription }) => ({
        id, process, activity, hazard, possibleHarm, exposureDescription,
      })),
    };
  });
}

async function assertPgrCompanyUnit(client: PoolClient, tenantId: string, companyId: string, unitId: string) {
  const result = await client.query(
    `SELECT 1 FROM sst.client_companies c
     JOIN sst.client_units u ON u.tenant_id = c.tenant_id AND u.company_id = c.id
     WHERE c.tenant_id = $1 AND c.id = $2 AND c.status = 'active' AND u.id = $3`,
    [tenantId, companyId, unitId],
  );
  if (!result.rowCount) throw new Error("Selecione uma empresa e unidade ativas desta consultoria.");
}

async function insertSnapshot(client: PoolClient, tenantId: string, inventoryId: string, inventory: PgrRiskInventory, actor: PgrActor, createdAt: string) {
  await client.query(
    `INSERT INTO sst.pgr_risk_inventory_revisions
     (tenant_id, inventory_id, revision, content, actor_user_id, actor_role, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
    [tenantId, inventoryId, inventory.revision, JSON.stringify(inventory), actor.userId, actor.role, createdAt],
  );
}

async function appendAudit(client: PoolClient, tenantId: string, inventoryId: string, actor: PgrActor, action: "pgr.created" | "pgr.updated" | "pgr.submitted" | "pgr.approved", occurredAt: string) {
  await client.query(
    `INSERT INTO sst.pgr_audit_history (id, tenant_id, actor_user_id, actor_role, action, target_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), tenantId, actor.userId, actor.role, action, inventoryId, occurredAt],
  );
}

async function syncRiskItems(client: PoolClient, tenantId: string, inventoryId: string, revision: number, items: PgrRiskItem[], now: string) {
  const activeIds = items.map((item) => item.id);
  await client.query(
    `UPDATE sst.pgr_risk_items SET active = false, revision = $3, updated_at = $4
     WHERE tenant_id = $1 AND inventory_id = $2 AND active = true AND NOT (id = ANY($5::text[]))`,
    [tenantId, inventoryId, revision, now, activeIds],
  );
  for (const item of items) {
    await client.query(
      `INSERT INTO sst.pgr_risk_items
       (tenant_id, inventory_id, id, process, activity, hazard, source_circumstance, possible_harm,
        exposed_groups, exposure_description, existing_measures, evidence_refs, assessment,
        revision, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, true, $15, $15)
       ON CONFLICT (tenant_id, inventory_id, id) DO UPDATE SET
        process = EXCLUDED.process, activity = EXCLUDED.activity, hazard = EXCLUDED.hazard,
        source_circumstance = EXCLUDED.source_circumstance, possible_harm = EXCLUDED.possible_harm,
        exposed_groups = EXCLUDED.exposed_groups, exposure_description = EXCLUDED.exposure_description,
        existing_measures = EXCLUDED.existing_measures, evidence_refs = EXCLUDED.evidence_refs,
        assessment = EXCLUDED.assessment, revision = EXCLUDED.revision, active = true, updated_at = EXCLUDED.updated_at`,
      [tenantId, inventoryId, item.id, item.process, item.activity, item.hazard, item.sourceCircumstance,
        item.possibleHarm, JSON.stringify(item.exposedGroups), item.exposureDescription,
        JSON.stringify(item.existingMeasures), JSON.stringify(item.evidenceRefs), JSON.stringify(item.assessment),
        revision, now],
    );
  }
}

async function syncExposureEvaluations(client: PoolClient, tenantId: string, inventoryId: string, revision: number, items: PgrRiskItem[], now: string) {
  await client.query(
    "DELETE FROM sst.pgr_exposure_evaluations WHERE tenant_id = $1 AND inventory_id = $2",
    [tenantId, inventoryId],
  );
  for (const item of items) {
    for (const evaluation of item.exposureEvaluations ?? []) {
      await client.query(
        `INSERT INTO sst.pgr_exposure_evaluations
         (tenant_id, inventory_id, risk_item_id, id, agent, evaluation_type, status, method, result,
          unit, evaluated_at, responsible, qualification, professional_registration, art_reference,
          evidence_refs, revision, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $18)`,
        [tenantId, inventoryId, item.id, evaluation.id, evaluation.agent, evaluation.type, evaluation.status,
          evaluation.method ?? null, evaluation.result ?? null, evaluation.unit ?? null, evaluation.evaluatedAt ?? null,
          evaluation.responsible ?? null, evaluation.qualification ?? null, evaluation.professionalRegistration ?? null,
          evaluation.artReference ?? null, JSON.stringify(evaluation.evidenceRefs), revision, now],
      );
    }
  }
}

export async function createPgrInventoryInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  inventoryId: string,
  input: PgrRiskInventory,
  actor: PgrActor,
): Promise<PgrRiskInventory> {
  const inventory = ensureInventory(input, context.tenantId);
  if (!inventoryId || inventoryId.length > 200 || inventory.revision !== 1) throw new Error("Identificador ou revisão inicial inválidos.");
  await assertPgrCompanyUnit(client, context.tenantId, inventory.companyId, inventory.unitId);
  const now = new Date().toISOString();
  const sourceDraftId = inventory.legacySource?.draftId ?? inventoryId;
  await client.query(
    `INSERT INTO sst.pgr_risk_inventories
     (tenant_id, id, source_draft_id, company_id, unit_id, title, activity_description, action_plan,
      status, revision, legacy_source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', 1, $9::jsonb, $10, $10)`,
    [context.tenantId, inventoryId, sourceDraftId, inventory.companyId, inventory.unitId, inventory.title,
      inventory.activityDescription, inventory.actionPlan, inventory.legacySource ? JSON.stringify(inventory.legacySource) : null, now],
  );
  await syncRiskItems(client, context.tenantId, inventoryId, 1, inventory.items, now);
  await syncExposureEvaluations(client, context.tenantId, inventoryId, 1, inventory.items, now);
  await insertSnapshot(client, context.tenantId, inventoryId, inventory, actor, now);
  await appendAudit(client, context.tenantId, inventoryId, actor, "pgr.created", now);
  return inventory;
}

export async function savePgrInventoryInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  inventoryId: string,
  expectedRevision: number,
  input: PgrRiskInventory,
  actor: PgrActor,
): Promise<PgrRiskInventory | null> {
  const inventory = ensureInventory(input, context.tenantId);
  if (!inventoryId || inventoryId.length > 200 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return null;
  const selected = await client.query<InventoryRow>(
    `SELECT company_id, unit_id, status, revision, legacy_source FROM sst.pgr_risk_inventories
     WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [context.tenantId, inventoryId],
  );
  const row = selected.rows[0];
  if (!row || row.status !== "draft" || Number(row.revision) !== expectedRevision || row.company_id !== inventory.companyId || row.unit_id !== inventory.unitId
    || canonicalJson(row.legacy_source ?? null) !== canonicalJson(inventory.legacySource ?? null)) return null;
  await assertPgrCompanyUnit(client, context.tenantId, inventory.companyId, inventory.unitId);

  const now = new Date().toISOString();
  const saved = { ...inventory, revision: expectedRevision + 1 };
  await client.query(
    `UPDATE sst.pgr_risk_inventories
     SET title = $3, activity_description = $4, action_plan = $5, revision = $6, updated_at = $7
     WHERE tenant_id = $1 AND id = $2`,
    [context.tenantId, inventoryId, saved.title, saved.activityDescription, saved.actionPlan, saved.revision, now],
  );
  await syncRiskItems(client, context.tenantId, inventoryId, saved.revision, saved.items, now);
  await syncExposureEvaluations(client, context.tenantId, inventoryId, saved.revision, saved.items, now);
  await insertSnapshot(client, context.tenantId, inventoryId, saved, actor, now);
  await appendAudit(client, context.tenantId, inventoryId, actor, "pgr.updated", now);
  return saved;
}

export async function transitionPgrInventoryInTransaction(
  client: PoolClient,
  context: TenantWriteContext,
  inventoryId: string,
  next: "in_review" | "approved",
  expectedRevision: number,
  actor: PgrActor,
): Promise<PgrRiskInventory | null> {
  const selected = await client.query<InventoryRow>(
    `SELECT company_id, unit_id, status, revision, legacy_source FROM sst.pgr_risk_inventories
     WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [context.tenantId, inventoryId],
  );
  const row = selected.rows[0];
  if (!row || Number(row.revision) !== expectedRevision || (next === "in_review" && row.status !== "draft") || (next === "approved" && row.status !== "in_review")) return null;

  const latest = await client.query<{ content: PgrRiskInventory }>(
    `SELECT content FROM sst.pgr_risk_inventory_revisions
     WHERE tenant_id = $1 AND inventory_id = $2 AND revision = $3`,
    [context.tenantId, inventoryId, expectedRevision],
  );
  const current = latest.rows[0]?.content;
  if (!current || "error" in validatePgrRiskInventory(current) || current.tenantId !== context.tenantId) throw new Error("Snapshot PGR ausente ou inválido.");
  if (next === "approved" && current.items.length === 0) {
    throw new PgrTransitionBlockedError("Não é possível registrar a revisão interna: ainda não há riscos estruturados no inventário para análise. O relato legado permanece preservado.");
  }
  if (next === "approved" && current.items.some((item) =>
    [item.process, item.activity, item.hazard, item.sourceCircumstance, item.possibleHarm, item.exposureDescription]
      .some((field) => !field.trim()))) {
    throw new PgrTransitionBlockedError("Não é possível registrar a revisão interna: preencha os campos de processo, atividade, perigo, circunstância, possível dano e exposição em cada risco.");
  }

  const now = new Date().toISOString();
  const saved = { ...current, revision: expectedRevision + 1 };
  await client.query(
    `UPDATE sst.pgr_risk_inventories SET status = $3, reviewer_user_id = $4, reviewer_role = $5, revision = $6, updated_at = $7
     WHERE tenant_id = $1 AND id = $2`,
    [context.tenantId, inventoryId, next, next === "approved" ? actor.userId : null, next === "approved" ? actor.role : null, saved.revision, now],
  );
  await insertSnapshot(client, context.tenantId, inventoryId, saved, actor, now);
  await appendAudit(client, context.tenantId, inventoryId, actor, next === "approved" ? "pgr.approved" : "pgr.submitted", now);
  return saved;
}
