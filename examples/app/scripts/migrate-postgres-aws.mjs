// Migrações para ambientes gerenciados (AWS RDS e afins), sem depender dos
// arquivos locais .env.pg.local / .env.pg.app.local usados no desenvolvimento.
// Uso: PGHOST=... PGDATABASE=... PGADMINUSER=... PGADMINPASSWORD=... \
//      node scripts/migrate-postgres-aws.mjs
// Não cria nem altera usuários: no RDS a credencial da aplicação é gerenciada
// pelo console/Secrets Manager. Só aplica as migrações versionadas de db/migrations.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;
const required = ["PGHOST", "PGDATABASE"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Variáveis ausentes: ${missing.join(", ")}.`);
  process.exit(1);
}

const adminPassword = process.env.PGADMINPASSWORD ?? process.env.PGPASSWORD;
if (!adminPassword) {
  console.error("Defina PGADMINPASSWORD (ou PGPASSWORD) com a credencial que pode criar schema.");
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? "5432"),
  database: process.env.PGDATABASE,
  user: process.env.PGADMINUSER ?? process.env.PGUSER ?? "postgres",
  password: adminPassword,
  ssl: process.env.PGSSL === "disable" ? undefined : { rejectUnauthorized: process.env.PGSSL === "verify-full" },
  max: 2,
  connectionTimeoutMillis: 5000,
});

const migrationsDir = join(process.cwd(), "db", "migrations");
let client;

try {
  client = await pool.connect();
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

  let applied = 0;
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
      applied += 1;
      console.log(`Aplicada ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log(applied === 0 ? "Nenhuma migração pendente." : `${applied} migração(ões) aplicada(s).`);
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
  await pool.end();
}
