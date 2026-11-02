import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { loadAdminPostgresConfig } from "./postgres-env.mjs";

const config = loadAdminPostgresConfig();
const localHosts = new Set(["127.0.0.1", "::1", "localhost"]);
if (!process.argv.includes("--apply")) {
  throw new Error("Instalação não executada. Revise o alvo local e rode novamente com --apply.");
}
if (!localHosts.has(config.host) || config.database !== "sst_hoje_dev") {
  throw new Error("A instalação M22 aceita somente o PostgreSQL local sst_hoje_dev.");
}

const sqlPath = resolve(process.cwd(), "..", "..", "schemas", "third-party-legacy-reconciliation-panel-read-functions-candidate.sql");
const sql = await readFile(sqlPath, "utf8");
const pool = new Pool(config);
let client;

try {
  client = await pool.connect();
  await client.query("BEGIN");
  const prerequisites = await client.query(`
    SELECT
      to_regclass('operational_authority_candidate.third_party_cases') IS NOT NULL AS cases_exist,
      to_regclass('operational_authority_candidate.client_registrars') IS NOT NULL AS registrars_exist,
      to_regclass('operational_authority_candidate.registrar_events') IS NOT NULL AS registrar_events_exist,
      to_regclass('third_party_legacy_reconciliation_candidate.invitation_case_link_events') IS NOT NULL AS link_events_exist,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'third_party_legacy_reconciliation_candidate_executor') AS executor_exists,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'third_party_legacy_reconciliation_candidate_app') AS candidate_app_role_exists,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sst_hoje_app') AS runtime_app_role_exists
  `);
  const check = prerequisites.rows[0];
  if (Object.values(check).some((value) => value !== true)) {
    throw new Error("Pré-requisitos candidatos da M22 ausentes; nenhuma função foi instalada.");
  }

  await client.query("GRANT CREATE ON SCHEMA third_party_legacy_reconciliation_candidate TO third_party_legacy_reconciliation_candidate_executor");
  await client.query(sql);
  await client.query("REVOKE CREATE ON SCHEMA third_party_legacy_reconciliation_candidate FROM third_party_legacy_reconciliation_candidate_executor");
  await client.query("COMMIT");
  console.log(JSON.stringify({ status: "installed", database: config.database, host: config.host, functions: 3 }));
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ status: "failed", message: error instanceof Error ? error.message : "Falha ao instalar funções locais." }));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
