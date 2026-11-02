import "server-only";
import { Pool } from "pg";

const globalForPostgres = globalThis as typeof globalThis & {
  sstHojePostgresPool?: Pool;
};

export function getPostgresPool(): Pool | null {
  const password = process.env.PGPASSWORD;
  if (!password) return null;

  if (!globalForPostgres.sstHojePostgresPool) {
    const pool = new Pool({
      host: process.env.PGHOST ?? "127.0.0.1",
      port: Number(process.env.PGPORT ?? "54329"),
      database: process.env.PGDATABASE ?? "sst_hoje_dev",
      user: process.env.PGUSER ?? "sst_hoje_dev",
      password,
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
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
