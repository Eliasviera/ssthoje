import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { analyzePgrAuditMigration, analyzePgrMigration } from "../src/lib/pgr-legacy-migration.ts";
import { importPgrLegacyBatchInTransaction } from "../src/lib/pgr-postgres-import.ts";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const dataDir = join(process.cwd(), "data");
const sourceFiles = ["pgr-drafts.json", "clients.json", "audit-log.jsonl"];

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseScopes(value) {
  if (!Array.isArray(value)) throw new Error("origem inválida");
  const scopes = new Set();
  for (const company of value) {
    if (!company || typeof company.tenantId !== "string" || typeof company.id !== "string" || !Array.isArray(company.units)) {
      throw new Error("origem inválida");
    }
    for (const unit of company.units) {
      if (!unit || typeof unit.id !== "string") throw new Error("origem inválida");
      scopes.add(`${company.tenantId}\u0000${company.id}\u0000${unit.id}`);
    }
  }
  return scopes;
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

let pool;
let client;
let transactionOpen = false;
try {
  if (!process.argv.includes("--apply")) throw new Error("Importação não iniciada: informe --apply após autorização.");
  const sourceBytes = await Promise.all(sourceFiles.map((file) => readFile(join(dataDir, file))));
  const [drafts, companies, allEvents] = [
    JSON.parse(sourceBytes[0].toString("utf8")),
    JSON.parse(sourceBytes[1].toString("utf8")),
    parseJsonLines(sourceBytes[2].toString("utf8")),
  ];
  const events = allEvents.filter((event) => event && typeof event.action === "string" && event.action.startsWith("pgr."));
  const draftReport = analyzePgrMigration(drafts, parseScopes(companies));
  const auditReport = analyzePgrAuditMigration(allEvents, drafts);
  if (draftReport.blocked || auditReport.blocked) throw new Error("A origem PGR possui bloqueios; lote não iniciado.");

  const draftsByTenant = new Map();
  const eventsByTenant = new Map();
  for (const draft of drafts) draftsByTenant.set(draft.tenantId, [...(draftsByTenant.get(draft.tenantId) ?? []), draft]);
  for (const event of events) eventsByTenant.set(event.tenantId, [...(eventsByTenant.get(event.tenantId) ?? []), event]);
  const tenantIds = [...new Set([...draftsByTenant.keys(), ...eventsByTenant.keys()])].sort();
  const results = [];

  pool = new Pool(loadRuntimePostgresConfig());
  client = await pool.connect();
  await client.query("BEGIN");
  transactionOpen = true;
  await client.query("SELECT pg_advisory_xact_lock(22022, 2)");
  for (const tenantId of tenantIds) {
    await client.query("SELECT set_config('sst.user_id', $1, true)", ["pgr-legacy-import"]);
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantId]);
    const result = await importPgrLegacyBatchInTransaction(
      client,
      tenantId,
      draftsByTenant.get(tenantId) ?? [],
      eventsByTenant.get(tenantId) ?? [],
    );
    results.push(result);
  }

  const finalSourceBytes = await Promise.all(sourceFiles.map((file) => readFile(join(dataDir, file))));
  if (sourceBytes.some((bytes, index) => digest(bytes) !== digest(finalSourceBytes[index]))) {
    throw new Error("A origem mudou durante a importação; lote revertido.");
  }
  await client.query("COMMIT");
  transactionOpen = false;
  console.log(JSON.stringify({
    mode: "imported",
    tenants: tenantIds.length,
    drafts: draftReport.total,
    auditEvents: auditReport.total,
    unlinkedAuditEvents: auditReport.unlinked,
    batchesImported: results.filter((result) => result === "imported").length,
    batchesAlreadyPresent: results.filter((result) => result === "already_imported").length,
    sourceHashes: Object.fromEntries(sourceFiles.map((file, index) => [file, digest(sourceBytes[index])])),
    cutover: false,
  }));
} catch (error) {
  if (transactionOpen) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  const message = error instanceof Error ? error.message : "erro inesperado";
  console.error(`Importação PGR revertida ou não iniciada: ${message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
