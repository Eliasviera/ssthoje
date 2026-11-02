import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_WRITERS = 8;

export function runControlledLostUpdateProbe(writers = DEFAULT_WRITERS) {
  if (!Number.isInteger(writers) || writers < 2 || writers > 64) {
    throw new Error("Informe entre 2 e 64 escritores.");
  }

  const root = mkdtempSync(join(tmpdir(), "sst-hoje-m21-concurrency-"));
  const dataPath = join(root, "records.json");
  const stagesPath = join(root, "staged");
  mkdirSync(stagesPath);
  writeFileSync(dataPath, '{"records":[]}\n', { flag: "wx" });

  try {
    // Each writer captures the same snapshot before any staged update is published.
    for (let index = 0; index < writers; index += 1) {
      const snapshot = JSON.parse(readFileSync(dataPath, "utf8"));
      snapshot.records.push(`registro-ficticio-${index}`);
      writeFileSync(join(stagesPath, `${index}.json`), `${JSON.stringify(snapshot)}\n`, { flag: "wx" });
    }

    const staged = readdirSync(stagesPath).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
    for (const name of staged) writeFileSync(dataPath, readFileSync(join(stagesPath, name)), "utf8");

    const persisted = JSON.parse(readFileSync(dataPath, "utf8")).records.length;
    return { writers, persisted, lost: writers - persisted };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname.toLowerCase() === process.argv[1].replaceAll("\\", "/").toLowerCase()) {
  try {
    const result = runControlledLostUpdateProbe(Number(process.argv[2] ?? DEFAULT_WRITERS));
    console.log(`Ensaio isolado: ${result.writers} snapshots de escrita; ${result.persisted} persistida(s); ${result.lost} atualização(ões) perdida(s).`);
    console.log("Isto reproduz o padrão leitura-modificação-gravação em JSON; não é benchmark nem carga contra a aplicação.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
