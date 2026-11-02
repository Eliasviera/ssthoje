import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { ensureRuntimePostgresConfig, loadAdminPostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const migrationsDir = join(process.cwd(), "db", "migrations");
const admin = new Pool(loadAdminPostgresConfig());
let client;

try {
  client = await admin.connect();
  await client.query("SELECT pg_advisory_lock(22022, 1)");

  const ledgerExists = (await client.query("SELECT to_regclass('sst.schema_migrations') IS NOT NULL AS present")).rows[0].present;
  if (!ledgerExists) {
    const existing = await client.query(`
      SELECT count(*)::int AS count
      FROM pg_catalog.pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    `);
    if (existing.rows[0].count !== 0) {
      throw new Error("O banco contém tabelas fora das migrações SST; nenhuma migração foi aplicada.");
    }
  }

  await client.query("BEGIN");
  await client.query("CREATE SCHEMA IF NOT EXISTS sst");
  await client.query(`
    CREATE TABLE IF NOT EXISTS sst.schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
  await client.query("COMMIT");

  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = await client.query("SELECT checksum FROM sst.schema_migrations WHERE version = $1", [file]);
    if (prior.rowCount) {
      if (prior.rows[0].checksum !== checksum) throw new Error(`Checksum divergente na migração ${file}; não edite migrações aplicadas.`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO sst.schema_migrations (version, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`Aplicada ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  const runtime = ensureRuntimePostgresConfig();
  const roleStatement = await client.query(
    "SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS', $1::text, $2::text) AS statement",
    [runtime.user, runtime.password],
  );
  await client.query(roleStatement.rows[0].statement);
  console.log("Migrações aplicadas; credencial local de privilégio mínimo preparada.");
} catch (error) {
  if (client) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.query("SELECT pg_advisory_unlock(22022, 1)"); } catch {}
    client.release();
  }
  await admin.end();
}
