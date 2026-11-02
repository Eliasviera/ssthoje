import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { analyzePcmsoMigration } from "../src/lib/pcmso-migration.ts";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const tables = ["sst.pcmso_records", "sst.pcmso_revisions", "sst.pcmso_history", "sst.pcmso_pgr_link_sets", "sst.pcmso_pgr_risk_links", "sst.pcmso_pgr_link_history"];
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function timestamp(value) { try { return new Date(value).toISOString(); } catch { return "invalid"; } }
function scopesFrom(companies) {
  if (!Array.isArray(companies)) throw new Error("invalid scopes");
  const scopes = new Set();
  for (const company of companies) {
    if (!company || typeof company.tenantId !== "string" || typeof company.id !== "string" || !Array.isArray(company.units)) throw new Error("invalid company");
    for (const unit of company.units) {
      if (!unit || typeof unit.id !== "string") throw new Error("invalid unit");
      scopes.add(`${company.tenantId}\u0000${company.id}\u0000${unit.id}`);
    }
  }
  return scopes;
}
function sourceEvents(record) {
  return record.history.map((event) => `${event.action}\u0000${event.actorUserId}\u0000${timestamp(event.occurredAt)}`).sort();
}

let pool;
let client;
let open = false;
let stage = "start";
try {
  if (process.argv.includes("--apply")) throw new Error("Este verificador é somente leitura e não possui modo de aplicação.");
  const dataDir = join(process.cwd(), "data");
  const [pcmsoBytes, companyBytes] = await Promise.all([readFile(join(dataDir, "pcmso.json")), readFile(join(dataDir, "clients.json"))]);
  const source = JSON.parse(pcmsoBytes.toString("utf8"));
  const companies = JSON.parse(companyBytes.toString("utf8"));
  const report = analyzePcmsoMigration(source, scopesFrom(companies));
  const records = source.records;
  const tenantIds = [...new Set([...records.map((record) => record.tenantId), ...companies.map((company) => company.tenantId)])];
  const sourceTenantCount = new Set(records.map((record) => record.tenantId)).size;
  const safeSource = { tenants: sourceTenantCount, records: report.total, ready: report.ready, blocked: report.blocked,
    issues: report.issues.reduce((counts, issue) => { counts[issue.code] = (counts[issue.code] ?? 0) + 1; return counts; }, {}) };

  pool = new Pool(loadRuntimePostgresConfig());
  stage = "connect";
  client = await pool.connect();
  stage = "begin-read-only";
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  stage = "schema-check";
  const tableResult = await client.query("SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS required(name)", [tables]);
  const missingTables = tableResult.rows.filter((row) => !row.present).length;
  if (missingTables) {
    await client.query("COMMIT"); open = false;
    console.log(JSON.stringify({ mode: "read-only", databaseAvailable: true, schemaInstalled: false,
      plan: { state: "schema_missing", canImport: false }, source: safeSource, missingTables }));
  } else {
    let destinationRecords = 0, destinationRevisions = 0, destinationHistory = 0;
    let destinationLinkSets = 0, destinationRiskLinks = 0, destinationLinkHistory = 0;
    const actualRecords = new Map(), actualRevisions = new Map(), actualEvents = new Map();
    const databaseScopes = new Set();
    for (const tenantId of tenantIds) {
      stage = "read-tenant-records";
      await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantId]);
      const scopeRows = await client.query(
        `SELECT c.id AS company_id, u.id AS unit_id FROM sst.client_companies c
         JOIN sst.client_units u ON u.tenant_id = c.tenant_id AND u.company_id = c.id
         WHERE c.tenant_id = $1`, [tenantId],
      );
      for (const row of scopeRows.rows) databaseScopes.add(`${tenantId}\u0000${row.company_id}\u0000${row.unit_id}`);
      const recordRows = await client.query(`SELECT id, company_id, unit_id, company_name, unit_name, coordinator_id, status, version, content, created_at, updated_at FROM sst.pcmso_records WHERE tenant_id = $1`, [tenantId]);
      const revisionRows = await client.query(`SELECT pcmso_id, version, content, saved_at, actor_user_id FROM sst.pcmso_revisions WHERE tenant_id = $1 ORDER BY pcmso_id, version`, [tenantId]);
      const eventRows = await client.query(`SELECT pcmso_id, action, actor_user_id, occurred_at FROM sst.pcmso_history WHERE tenant_id = $1`, [tenantId]);
      const linkCounts = await client.query(`SELECT (SELECT count(*) FROM sst.pcmso_pgr_link_sets WHERE tenant_id = $1)::integer AS sets,
          (SELECT count(*) FROM sst.pcmso_pgr_risk_links WHERE tenant_id = $1)::integer AS links,
          (SELECT count(*) FROM sst.pcmso_pgr_link_history WHERE tenant_id = $1)::integer AS history`, [tenantId]);
      destinationRecords += recordRows.rowCount;
      destinationRevisions += revisionRows.rowCount;
      destinationHistory += eventRows.rowCount;
      destinationLinkSets += Number(linkCounts.rows[0].sets);
      destinationRiskLinks += Number(linkCounts.rows[0].links);
      destinationLinkHistory += Number(linkCounts.rows[0].history);
      for (const row of recordRows.rows) actualRecords.set(`${tenantId}\u0000${row.id}`, row);
      for (const row of revisionRows.rows) {
        const key = `${tenantId}\u0000${row.pcmso_id}`;
        actualRevisions.set(`${key}\u0000${row.version}`, row);
      }
      for (const row of eventRows.rows) {
        const key = `${tenantId}\u0000${row.pcmso_id}`;
        const values = actualEvents.get(key) ?? [];
        values.push(`${row.action}\u0000${row.actor_user_id}\u0000${timestamp(row.occurred_at)}`);
        actualEvents.set(key, values);
      }
    }
    let matchedRecords = 0, matchedRevisions = 0, matchedHistory = 0, missingDatabaseScopes = 0;
    for (const record of records) {
      if (!databaseScopes.has(`${record.tenantId}\u0000${record.companyId}\u0000${record.unitId}`)) missingDatabaseScopes += 1;
      const key = `${record.tenantId}\u0000${record.id}`;
      const row = actualRecords.get(key);
      if (row && row.company_id === record.companyId && row.unit_id === record.unitId && row.company_name === record.companyName
        && row.unit_name === record.unitName && row.coordinator_id === record.coordinatorId && row.status === record.status
        && Number(row.version) === record.version && row.content === record.content
        && timestamp(row.created_at) === timestamp(record.createdAt) && timestamp(row.updated_at) === timestamp(record.updatedAt)) matchedRecords += 1;
      for (const revision of record.revisions) {
        const actual = actualRevisions.get(`${key}\u0000${revision.version}`);
        if (actual && actual.content === revision.content && actual.actor_user_id === revision.actorUserId
          && timestamp(actual.saved_at) === timestamp(revision.savedAt)) matchedRevisions += 1;
      }
      const actualEventList = actualEventsMap(actualEvents, key);
      if (stable(actualEventList) === stable(sourceEvents(record))) matchedHistory += record.history.length;
    }
    const empty = destinationRecords + destinationRevisions + destinationHistory + destinationLinkSets + destinationRiskLinks + destinationLinkHistory === 0;
    const fullyMatched = matchedRecords === records.length && matchedRevisions === records.reduce((sum, record) => sum + record.revisions.length, 0)
      && matchedHistory === records.reduce((sum, record) => sum + record.history.length, 0)
      && destinationRecords === records.length && destinationRevisions === matchedRevisions && destinationHistory === matchedHistory
      && destinationLinkSets === 0 && destinationRiskLinks === 0 && destinationLinkHistory === 0;
    const state = report.blocked || missingDatabaseScopes ? "source_blocked" : empty ? "ready_to_import" : fullyMatched ? "already_reconciled" : "destination_conflict";
    stage = "finish-read-only";
    await client.query("COMMIT"); open = false;
    console.log(JSON.stringify({ mode: "read-only", databaseAvailable: true, schemaInstalled: true,
      hashes: { pcmso: hash(pcmsoBytes), clientScopes: hash(companyBytes) },
      plan: { state, canImport: state === "ready_to_import" }, source: safeSource,
      destination: { records: destinationRecords, revisions: destinationRevisions, history: destinationHistory,
        linkSets: destinationLinkSets, riskLinks: destinationRiskLinks, linkHistory: destinationLinkHistory },
      matched: { records: matchedRecords, revisions: matchedRevisions, history: matchedHistory, missingDatabaseScopes } }));
  }
} catch (error) {
  if (client && open) { try { await client.query("ROLLBACK"); } catch {} }
  console.error(`Reconciliação PCMSO não concluída na etapa ${stage} (${error?.code ?? error?.name ?? "erro"}); nenhum conteúdo ou detalhe de conexão foi exibido.`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}

function actualEventsMap(events, key) { return [...(events.get(key) ?? [])].sort(); }
