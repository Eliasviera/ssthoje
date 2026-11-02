import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { loadAdminPostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const migrationFile = "0006_pgr_exposure_evaluations.sql";
const migrationsDir = join(process.cwd(), "db", "migrations");
const pool = new Pool(loadAdminPostgresConfig());
let client;

try {
  client = await pool.connect();
  await client.query("SELECT pg_advisory_lock(22022, 1)");
  const prerequisites = [
    "0001_tenant_registry.sql",
    "0002_site_cms.sql",
    "0003_site_cms_runtime_write.sql",
    "0004_client_companies.sql",
    "0005_pgr_risk_inventory.sql",
  ];
  for (const file of prerequisites) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const result = await client.query("SELECT checksum FROM sst.schema_migrations WHERE version = $1", [file]);
    if (result.rowCount !== 1 || result.rows[0].checksum !== checksum) {
      throw new Error(`Pré-requisito ausente ou checksum divergente: ${file}. Nenhuma alteração foi feita.`);
    }
  }

  const migrationSql = await readFile(join(migrationsDir, migrationFile), "utf8");
  const checksum = createHash("sha256").update(migrationSql).digest("hex");
  const prior = await client.query("SELECT checksum FROM sst.schema_migrations WHERE version = $1", [migrationFile]);
  if (prior.rowCount) {
    if (prior.rows[0].checksum !== checksum) throw new Error("Checksum divergente da migration 0006; nenhuma alteração foi feita.");
    console.log("Migration 0006 já aplicada com o checksum esperado.");
  } else {
    const existing = await client.query("SELECT to_regclass('sst.pgr_exposure_evaluations') AS table_name");
    if (existing.rows[0].table_name) throw new Error("A tabela de avaliações já existe sem registro correspondente no ledger; nenhuma alteração foi feita.");
    const riskTable = await client.query("SELECT to_regclass('sst.pgr_risk_items') AS table_name");
    if (!riskTable.rows[0].table_name) throw new Error("A tabela de riscos PGR não existe; nenhuma alteração foi feita.");

    await client.query("BEGIN");
    try {
      await client.query(migrationSql);
      const verification = await client.query(`
        SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
          (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'sst' AND tablename = 'pgr_exposure_evaluations') AS policy_count,
          (SELECT count(*)::int FROM sst.pgr_exposure_evaluations) AS row_count,
          has_table_privilege('sst_hoje_app', 'sst.pgr_exposure_evaluations', 'SELECT') AS app_can_select,
          has_table_privilege('sst_hoje_app', 'sst.pgr_exposure_evaluations', 'INSERT') AS app_can_insert,
          has_column_privilege('sst_hoje_app', 'sst.pgr_exposure_evaluations', 'agent', 'UPDATE') AS app_can_update,
          has_table_privilege('sst_hoje_app', 'sst.pgr_exposure_evaluations', 'DELETE') AS app_can_delete
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sst' AND c.relname = 'pgr_exposure_evaluations'
      `);
      const state = verification.rows[0];
      if (!state?.rls_enabled || !state.rls_forced || state.policy_count !== 1 || state.row_count !== 0
        || !state.app_can_select || !state.app_can_insert || !state.app_can_update || !state.app_can_delete) {
        throw new Error("A verificação de RLS, grants ou tabela vazia falhou.");
      }
      await client.query("INSERT INTO sst.schema_migrations (version, checksum) VALUES ($1, $2)", [migrationFile, checksum]);
      await client.query("COMMIT");
      console.log("Migration 0006 aplicada e verificada: RLS ativa/forçada, política presente, grants mínimos e tabela vazia.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.query("SELECT pg_advisory_unlock(22022, 1)"); } catch {}
    client.release();
  }
  await pool.end();
}
