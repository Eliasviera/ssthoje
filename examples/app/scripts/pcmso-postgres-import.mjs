import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { analyzePcmsoMigration } from "../src/lib/pcmso-migration.ts";
import { importPcmsoTenantBatchInTransaction } from "../src/lib/pcmso-postgres-operations.ts";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const tenantIndex = process.argv.indexOf("--tenant");
const tenantId = tenantIndex >= 0 ? process.argv[tenantIndex + 1] : "";
if (!process.argv.includes("--apply") || !tenantId || tenantId.startsWith("--")) {
  console.error("Uso: node scripts/pcmso-postgres-import.mjs --tenant <tenant-id> --apply");
  process.exit(2);
}

const dataDir = join(process.cwd(), "data");
const sourcePath = join(dataDir, "pcmso.json");
const companyPath = join(dataDir, "clients.json");
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function scopeSet(companies) {
  if (!Array.isArray(companies)) throw new Error("invalid scope source");
  const result = new Set();
  for (const company of companies) {
    if (!company || typeof company.tenantId !== "string" || typeof company.id !== "string" || !Array.isArray(company.units)) throw new Error("invalid company source");
    for (const unit of company.units) {
      if (!unit || typeof unit.id !== "string") throw new Error("invalid unit source");
      result.add(`${company.tenantId}\u0000${company.id}\u0000${unit.id}`);
    }
  }
  return result;
}

let pool;
let client;
let transactionOpen = false;
let stage = "source-read";
try {
  const [sourceBytes, companyBytes] = await Promise.all([readFile(sourcePath), readFile(companyPath)]);
  const source = JSON.parse(sourceBytes.toString("utf8"));
  const companies = JSON.parse(companyBytes.toString("utf8"));
  const report = analyzePcmsoMigration(source, scopeSet(companies));
  const records = source.records.filter((record) => record?.tenantId === tenantId);
  if (report.blocked || records.length === 0) throw new Error("source_not_ready");
  const sourceHashes = { pcmso: digest(sourceBytes), clients: digest(companyBytes) };

  pool = new Pool(loadRuntimePostgresConfig());
  stage = "connect";
  client = await pool.connect();
  stage = "begin-transaction";
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  transactionOpen = true;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`pcmso-import:${tenantId}`]);
  await client.query("SELECT set_config('sst.user_id', $1, true)", ["pcmso-import-operator"]);
  await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantId]);
  stage = "validate-database-scopes";
  for (const record of records) {
    const scope = await client.query(
      `SELECT 1 FROM sst.client_companies c JOIN sst.client_units u
         ON u.tenant_id = c.tenant_id AND u.company_id = c.id
       WHERE c.tenant_id = $1 AND c.id = $2 AND u.id = $3`, [tenantId, record.companyId, record.unitId],
    );
    if (!scope.rowCount) throw new Error("database_scope_missing");
  }
  stage = "import-tenant-batch";
  const result = await importPcmsoTenantBatchInTransaction(client, tenantId, records);
  stage = "confirm-source-unchanged";
  const [sourceAfter, companiesAfter] = await Promise.all([readFile(sourcePath), readFile(companyPath)]);
  if (digest(sourceAfter) !== sourceHashes.pcmso || digest(companiesAfter) !== sourceHashes.clients) throw new Error("source_changed");
  stage = "commit";
  await client.query("COMMIT");
  transactionOpen = false;
  console.log(JSON.stringify({ mode: "transactional-import", result, tenantRecords: records.length,
    revisions: records.reduce((sum, record) => sum + record.revisions.length, 0),
    historyEvents: records.reduce((sum, record) => sum + record.history.length, 0), hashes: sourceHashes }));
} catch (error) {
  if (client && transactionOpen) { try { await client.query("ROLLBACK"); } catch {} }
  console.error(`Importação PCMSO interrompida na etapa ${stage} (${error?.code ?? error?.message ?? "erro"}); nenhuma divergência foi sobrescrita.`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
