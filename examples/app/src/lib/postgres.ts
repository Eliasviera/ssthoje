import "server-only";
import { Pool } from "pg";

const globalForPostgres = globalThis as typeof globalThis & {
  sstHojePostgresPool?: Pool;
};

export function getPostgresPool(): Pool | null {
  const password = process.env.PGPASSWORD;
  // Elastic Beanstalk/Heroku costumam entregar uma única DATABASE_URL.
  const connectionString = process.env.DATABASE_URL;
  if (!password && !connectionString) return null;

  if (!globalForPostgres.sstHojePostgresPool) {
    // Produção (RDS) exige TLS; localmente o docker/postgres não usa SSL.
    const ssl = process.env.PGSSL === "require" || process.env.PGSSL === "verify-full"
      ? { rejectUnauthorized: process.env.PGSSL === "verify-full" }
      : undefined;
    const common = { ssl, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 };
    const pool = new Pool(connectionString
      ? { connectionString, ...common }
      : {
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? "54329"),
        database: process.env.PGDATABASE ?? "sst_hoje_dev",
        user: process.env.PGUSER ?? "sst_hoje_dev",
        password,
        ...common,
      });
    pool.on("error", () => undefined);
    globalForPostgres.sstHojePostgresPool = pool;
  }

  return globalForPostgres.sstHojePostgresPool;
}

export async function checkPostgresConnection(): Promise<boolean> {
  const pool = getPostgresPool();
  if (!pool) return false;

  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
