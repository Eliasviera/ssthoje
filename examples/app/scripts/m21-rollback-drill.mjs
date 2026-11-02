import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackup, restoreIsolated, verifyBackup } from "./m21-backup.mjs";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function runRollbackDrill() {
  const root = mkdtempSync(join(tmpdir(), "sst-hoje-m21-rollback-"));
  const data = join(root, "app", "data");
  const backup = join(root, "backup");
  mkdirSync(data, { recursive: true });
  const state = join(data, "state.json");
  writeFileSync(state, '{"versao":"antes","dadosFicticios":true}\n', { flag: "wx" });
  const before = sha256(state);

  try {
    createBackup(data, backup);
    writeFileSync(state, '{"versao":"depois","dadosFicticios":true}\n');
    const verify = verifyBackup(backup);
    const restored = restoreIsolated(backup);
    const restoredState = join(restored.destination, "data", "state.json");
    const restoredHash = sha256(restoredState);
    return {
      backupValid: verify.valid,
      restoredMatchesBackup: restoredHash === before,
      activeDataPreserved: JSON.parse(readFileSync(state, "utf8")).versao === "depois",
      restoredMarker: readFileSync(join(restored.destination, ".sst-m21-isolated-restore.json"), "utf8").includes('"isolated": true'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname.toLowerCase() === process.argv[1].replaceAll("\\", "/").toLowerCase()) {
  try {
    const result = runRollbackDrill();
    console.log(`Ensaio isolado: backup válido=${result.backupValid}; restauração confere=${result.restoredMatchesBackup}; dados ativos preservados=${result.activeDataPreserved}; marcador isolado=${result.restoredMarker}.`);
    if (Object.values(result).some((value) => value !== true)) process.exitCode = 1;
    console.log("Ensaio não altera o aplicativo e não executa rollback em data/.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
