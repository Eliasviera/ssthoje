import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const adminSecretPath = resolve(projectRoot, "..", "..", ".env.pg.local");
const runtimeSecretPath = resolve(projectRoot, ".env.pg.app.local");

function readSecret(path, key) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Não foi possível ler o arquivo local ${path}.`);
  }
  const line = contents.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  const value = line?.slice(key.length + 1).trim();
  if (!value || value === "escolha-uma-senha-local") {
    throw new Error(`${key} está vazia ou ainda usa o valor de exemplo.`);
  }
  return value;
}

export function loadAdminPostgresConfig() {
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? "54329"),
    database: process.env.PGDATABASE ?? "sst_hoje_dev",
    user: process.env.PGADMINUSER ?? "sst_hoje_dev",
    password: readSecret(adminSecretPath, "POSTGRES_PASSWORD"),
    max: 2,
    connectionTimeoutMillis: 3000,
  };
}

export function ensureRuntimePostgresConfig() {
  if (!existsSync(runtimeSecretPath)) {
    const password = randomBytes(32).toString("base64url");
    try {
      writeFileSync(runtimeSecretPath, `POSTGRES_APP_PASSWORD=${password}\n`, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw new Error("Não foi possível salvar a credencial local do usuário da aplicação.");
    }
  }
  return loadRuntimePostgresConfig();
}

export function loadRuntimePostgresConfig() {
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? "54329"),
    database: process.env.PGDATABASE ?? "sst_hoje_dev",
    user: "sst_hoje_app",
    password: readSecret(runtimeSecretPath, "POSTGRES_APP_PASSWORD"),
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  };
}
