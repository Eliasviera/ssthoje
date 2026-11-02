import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { analyzePgrAuditMigration, analyzePgrMigration, previewPgrLegacyMigration } from "../src/lib/pgr-legacy-migration.ts";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const dataDir = join(process.cwd(), "data");
const requiredTables = [
  "sst.pgr_risk_inventories",
  "sst.pgr_risk_items",
  "sst.pgr_risk_inventory_revisions",
  "sst.pgr_audit_history",
];

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseScopes(value) {
  if (!Array.isArray(value)) throw new Error("invalid source");
  const scopes = new Set();
  for (const company of value) {
    if (!company || typeof company.tenantId !== "string" || typeof company.id !== "string" || !Array.isArray(company.units)) throw new Error("invalid source");
    for (const unit of company.units) {
      if (!unit || typeof unit.id !== "string") throw new Error("invalid source");
      scopes.add(`${company.tenantId}\u0000${company.id}\u0000${unit.id}`);
    }
  }
  return scopes;
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function sourceAudit(events) {
  return events.filter((event) => event && typeof event.action === "string" && event.action.startsWith("pgr."));
}

function sameTimestamp(actual, expected) {
  try {
    return new Date(actual).toISOString() === new Date(expected).toISOString();
  } catch {
    return false;
  }
}

function inventoryMatches(row, revision, revisionCount, riskItemCount, draft, inventory) {
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
    && Number(row.revision) === inventory.revision
    && stable(row.legacy_source) === stable(inventory.legacySource)
    && sameTimestamp(row.created_at, draft.createdAt)
    && sameTimestamp(row.updated_at, draft.updatedAt)
    && revision !== undefined
    && revisionCount === 1
    && riskItemCount === 0
    && stable(revision.content) === stable(inventory)
    && sameTimestamp(revision.created_at, inventory.legacySource?.snapshots.at(-1)?.savedAt);
}

function auditMatches(row, event) {
  const targetId = typeof event.targetId === "string" && event.targetId.trim() ? event.targetId : null;
  return row.tenant_id === event.tenantId
    && row.actor_user_id === event.actorUserId
    && row.actor_role === event.actorRole
    && row.action === event.action
    && row.target_id === targetId
    && sameTimestamp(row.occurred_at, event.occurredAt);
}

let pool;
let client;
let transactionOpen = false;
try {
  if (process.argv.includes("--apply")) throw new Error("Este verificador é somente leitura e não possui modo de aplicação.");
  const [pgrBytes, clientsBytes, auditBytes] = await Promise.all([
    readFile(join(dataDir, "pgr-drafts.json")),
    readFile(join(dataDir, "clients.json")),
    readFile(join(dataDir, "audit-log.jsonl")),
  ]);
  const drafts = JSON.parse(pgrBytes.toString("utf8"));
  const companies = JSON.parse(clientsBytes.toString("utf8"));
  const allEvents = parseJsonLines(auditBytes.toString("utf8"));
  const localReport = analyzePgrMigration(drafts, parseScopes(companies));
  const auditReport = analyzePgrAuditMigration(allEvents, drafts);
  const events = sourceAudit(allEvents);
  const safeSource = {
    drafts: localReport.total,
    ready: localReport.ready,
    blocked: localReport.blocked,
    warnings: localReport.warnings,
    auditEvents: auditReport.total,
    unlinkedAuditEvents: auditReport.unlinked,
    blockedAuditEvents: auditReport.blocked,
  };
  const sourceReady = !localReport.blocked && !auditReport.blocked;

  pool = new Pool(loadRuntimePostgresConfig());
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  transactionOpen = true;
  const tableResult = await client.query(
    "SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS required(name)",
    [requiredTables],
  );
  const missingTables = tableResult.rows.filter((row) => !row.present).map((row) => row.name);
  if (missingTables.length) {
    await client.query("COMMIT");
    transactionOpen = false;
    console.log(JSON.stringify({
      mode: "read-only",
      databaseAvailable: true,
      schemaInstalled: false,
      plan: { state: sourceReady ? "schema_missing" : "source_blocked", canImport: false },
      source: safeSource,
      missingTables: missingTables.length,
    }));
    process.exitCode = 0;
  } else {
    const tenantIds = [...new Set([...drafts.map((draft) => draft.tenantId), ...events.map((event) => event.tenantId)])];
    const inventories = new Map();
    const revisions = new Map();
    const revisionCounts = new Map();
    const riskItemCounts = new Map();
    const auditRows = new Map();
    const destinationInventoriesByTenant = new Map();
    const destinationRevisionsByTenant = new Map();
    const destinationRiskItemsByTenant = new Map();
    const destinationAuditEventsByTenant = new Map();

    for (const tenantId of tenantIds) {
      await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantId]);
      const inventoryResult = await client.query(
        `SELECT i.id, i.source_draft_id, i.company_id, i.unit_id, i.title, i.activity_description, i.action_plan,
           i.status, i.revision, i.reviewer_user_id, i.reviewer_role, i.legacy_source, i.created_at, i.updated_at
         FROM sst.pgr_risk_inventories i WHERE i.tenant_id = $1`,
        [tenantId],
      );
      const revisionResult = await client.query(
        `SELECT r.inventory_id, r.revision, r.content, r.created_at
         FROM sst.pgr_risk_inventory_revisions r WHERE r.tenant_id = $1`,
        [tenantId],
      );
      const riskItemResult = await client.query(
        `SELECT ri.inventory_id, count(*)::integer AS count
         FROM sst.pgr_risk_items ri WHERE ri.tenant_id = $1 GROUP BY ri.inventory_id`,
        [tenantId],
      );
      const auditResult = await client.query(
        `SELECT id, tenant_id, actor_user_id, actor_role, action, target_id, occurred_at
         FROM sst.pgr_audit_history WHERE tenant_id = $1`,
        [tenantId],
      );
      const countResult = await client.query(
        "SELECT count(*)::integer AS count FROM sst.pgr_risk_inventories WHERE tenant_id = $1",
        [tenantId],
      );
      destinationInventoriesByTenant.set(tenantId, Number(countResult.rows[0]?.count ?? 0));
      destinationRevisionsByTenant.set(tenantId, revisionResult.rows.length);
      destinationRiskItemsByTenant.set(tenantId, riskItemResult.rows.reduce((sum, row) => sum + Number(row.count), 0));
      destinationAuditEventsByTenant.set(tenantId, auditResult.rows.length);
      for (const row of inventoryResult.rows) inventories.set(`${tenantId}\u0000${row.source_draft_id}`, row);
      for (const row of revisionResult.rows) {
        const key = `${tenantId}\u0000${row.inventory_id}`;
        revisions.set(`${key}\u0000${row.revision}`, row);
        revisionCounts.set(key, (revisionCounts.get(key) ?? 0) + 1);
      }
      for (const row of riskItemResult.rows) riskItemCounts.set(`${tenantId}\u0000${row.inventory_id}`, Number(row.count));
      for (const row of auditResult.rows) auditRows.set(row.id, row);
    }

    let matchedDrafts = 0;
    let missingDrafts = 0;
    let conflictingDrafts = 0;
    for (const draft of drafts) {
      const row = inventories.get(`${draft.tenantId}\u0000${draft.id}`);
      if (!row) {
        missingDrafts += 1;
        continue;
      }
      const inventory = previewPgrLegacyMigration(draft);
      const inventoryKey = `${draft.tenantId}\u0000${row.id}`;
      const revision = revisions.get(`${inventoryKey}\u0000${inventory.revision}`);
      if (inventoryMatches(
        row,
        revision,
        revisionCounts.get(inventoryKey) ?? 0,
        riskItemCounts.get(inventoryKey) ?? 0,
        draft,
        inventory,
      )) matchedDrafts += 1;
      else conflictingDrafts += 1;
    }

    let matchedAuditEvents = 0;
    let missingAuditEvents = 0;
    let conflictingAuditEvents = 0;
    for (const event of events) {
      const row = auditRows.get(event.id);
      if (!row) missingAuditEvents += 1;
      else if (auditMatches(row, event)) matchedAuditEvents += 1;
      else conflictingAuditEvents += 1;
    }
    const expectedDraftsByTenant = new Map();
    const expectedEventsByTenant = new Map();
    for (const draft of drafts) expectedDraftsByTenant.set(draft.tenantId, (expectedDraftsByTenant.get(draft.tenantId) ?? 0) + 1);
    for (const event of events) expectedEventsByTenant.set(event.tenantId, (expectedEventsByTenant.get(event.tenantId) ?? 0) + 1);
    const destinationInventories = [...destinationInventoriesByTenant.values()].reduce((sum, count) => sum + count, 0);
    const destinationRevisions = [...destinationRevisionsByTenant.values()].reduce((sum, count) => sum + count, 0);
    const destinationRiskItems = [...destinationRiskItemsByTenant.values()].reduce((sum, count) => sum + count, 0);
    const destinationAuditEvents = [...destinationAuditEventsByTenant.values()].reduce((sum, count) => sum + count, 0);
    const extraDestinationInventories = [...destinationInventoriesByTenant].reduce((sum, [tenantId, count]) =>
      sum + Math.max(0, count - (expectedDraftsByTenant.get(tenantId) ?? 0)), 0);
    const extraDestinationAuditEvents = [...destinationAuditEventsByTenant].reduce((sum, [tenantId, count]) =>
      sum + Math.max(0, count - (expectedEventsByTenant.get(tenantId) ?? 0)), 0);
    const extraDestinationRevisions = [...destinationRevisionsByTenant].reduce((sum, [tenantId, count]) =>
      sum + Math.max(0, count - (expectedDraftsByTenant.get(tenantId) ?? 0)), 0);
    const destinationEmpty = destinationInventories === 0 && destinationRevisions === 0
      && destinationRiskItems === 0 && destinationAuditEvents === 0;
    const fullyReconciled = matchedDrafts === localReport.total && matchedAuditEvents === auditReport.total
      && missingDrafts === 0 && conflictingDrafts === 0 && missingAuditEvents === 0 && conflictingAuditEvents === 0
      && extraDestinationInventories === 0 && extraDestinationRevisions === 0 && destinationRiskItems === 0
      && extraDestinationAuditEvents === 0;
    const planState = !sourceReady ? "source_blocked"
      : destinationEmpty ? "ready_to_import"
        : fullyReconciled ? "already_reconciled" : "destination_conflict";

    await client.query("COMMIT");
    transactionOpen = false;
    console.log(JSON.stringify({
      mode: "read-only",
      databaseAvailable: true,
      schemaInstalled: true,
      plan: { state: planState, canImport: planState === "ready_to_import" },
      source: safeSource,
      destinationInventories,
      extraDestinationInventories,
      destinationRevisions,
      extraDestinationRevisions,
      destinationRiskItems,
      drafts: { matched: matchedDrafts, missing: missingDrafts, conflicting: conflictingDrafts },
      audit: { destinationEvents: destinationAuditEvents, extraDestinationEvents: extraDestinationAuditEvents, matched: matchedAuditEvents, missing: missingAuditEvents, conflicting: conflictingAuditEvents },
      sourceHashes: { pgrDrafts: digest(pgrBytes), clientScopes: digest(clientsBytes), auditLog: digest(auditBytes) },
    }));
    if (!sourceReady || planState === "destination_conflict") process.exitCode = 1;
  }
} catch {
  if (transactionOpen) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  console.error("Reconciliação PGR não concluída; nenhuma gravação foi executada e nenhum dado foi exibido.");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
