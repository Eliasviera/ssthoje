import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { loadAdminPostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const migrationFile = "0007_pcmso_domain.sql";
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
    "0006_pgr_exposure_evaluations.sql",
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
    if (prior.rows[0].checksum !== checksum) throw new Error("Checksum divergente da migration 0007; nenhuma alteração foi feita.");
    console.log("Migration 0007 já aplicada com o checksum esperado.");
  } else {
    const tables = ["pcmso_records", "pcmso_revisions", "pcmso_history", "pcmso_pgr_link_sets", "pcmso_pgr_risk_links", "pcmso_pgr_link_history"];
    for (const table of tables) {
      const existing = await client.query("SELECT to_regclass($1) AS table_name", [`sst.${table}`]);
      if (existing.rows[0].table_name) throw new Error(`A tabela ${table} já existe sem registro no ledger; nenhuma alteração foi feita.`);
    }

    await client.query("BEGIN");
    try {
      await client.query(migrationSql);
      const verification = await client.query(`
        SELECT count(*)::int AS table_count,
          count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity)::int AS secured_table_count,
          (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'sst' AND tablename LIKE 'pcmso_%') AS policy_count,
          (SELECT count(*)::int FROM sst.pcmso_records) AS records,
          (SELECT count(*)::int FROM sst.pcmso_revisions) AS revisions,
          (SELECT count(*)::int FROM sst.pcmso_history) AS history,
          (SELECT count(*)::int FROM sst.pcmso_pgr_link_sets) AS link_sets,
          (SELECT count(*)::int FROM sst.pcmso_pgr_risk_links) AS risk_links,
          (SELECT count(*)::int FROM sst.pcmso_pgr_link_history) AS link_history
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sst' AND c.relname = ANY($1::text[])
      `, [tables]);
      const state = verification.rows[0];
      if (state.table_count !== 6 || state.secured_table_count !== 6 || state.policy_count !== 6
        || state.records || state.revisions || state.history || state.link_sets || state.risk_links || state.link_history) {
        throw new Error("A verificação das seis tabelas, RLS, políticas ou estado vazio falhou.");
      }
      const grants = await client.query(`
        SELECT has_table_privilege('sst_hoje_app', 'sst.pcmso_records', 'SELECT') AS records_read,
          has_table_privilege('sst_hoje_app', 'sst.pcmso_records', 'INSERT') AS records_insert,
          has_table_privilege('sst_hoje_app', 'sst.pcmso_revisions', 'INSERT') AS revisions_insert,
          has_table_privilege('sst_hoje_app', 'sst.pcmso_history', 'INSERT') AS history_insert,
          has_table_privilege('sst_hoje_app', 'sst.pcmso_pgr_link_sets', 'INSERT') AS links_insert,
          has_table_privilege('sst_hoje_app', 'sst.pcmso_pgr_risk_links', 'DELETE') AS risk_links_delete,
          has_table_privilege('sst_hoje_app', 'sst.pcmso_pgr_link_history', 'INSERT') AS link_history_insert
      `);
      if (Object.values(grants.rows[0]).some((value) => value !== true)) throw new Error("Os grants mínimos do papel de aplicação não conferem.");
      await client.query("INSERT INTO sst.schema_migrations (version, checksum) VALUES ($1, $2)", [migrationFile, checksum]);
      await client.query("COMMIT");
      console.log("Migration 0007 aplicada: seis tabelas vazias, RLS forçada, políticas e grants mínimos conferidos.");
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
