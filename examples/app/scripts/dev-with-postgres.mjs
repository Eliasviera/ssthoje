import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const projectRoot = process.cwd();
let postgresConfig;
try {
  postgresConfig = loadRuntimePostgresConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const nextCli = resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");
// A porta padrão do projeto é 3107 (atalhos do desktop, assets/abrir-sst-hoje.mjs e
// docs/ACESSOS-PAINEIS.md dependem dela). Sobrescreva com SST_PORT ou PORT se precisar.
const port = process.env.SST_PORT ?? process.env.PORT ?? "3107";
const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "localhost", "--port", port], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PGHOST: postgresConfig.host,
    PGPORT: String(postgresConfig.port),
    PGDATABASE: postgresConfig.database,
    PGUSER: postgresConfig.user,
    PGPASSWORD: postgresConfig.password,
    SST_SITE_CMS_STORAGE: process.env.SST_SITE_CMS_STORAGE ?? "postgres",
    SST_PCMSO_STORAGE: process.env.SST_PCMSO_STORAGE ?? "postgres",
  },
});

child.on("error", () => {
  console.error("Não foi possível iniciar o servidor de desenvolvimento.");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
