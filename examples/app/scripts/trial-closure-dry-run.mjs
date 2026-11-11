import { inspectTrialClosure, TrialClosurePreflightError } from "../src/lib/trial-closure-preflight.ts";

const args = process.argv.slice(2);
// Rejeita flags de aplicação antes de ler qualquer cadastro.
if (args.length !== 2 || !args.includes("--dry-run") || args.filter((arg) => arg.startsWith("--user-id=")).length !== 1) {
  console.error("Uso: node --experimental-strip-types scripts/trial-closure-dry-run.mjs --dry-run --user-id=trial-user-UUID. Somente leitura; --apply não existe.");
  process.exitCode = 1;
} else {
  try {
    const userId = args.find((arg) => arg.startsWith("--user-id=")).slice("--user-id=".length);
    console.log(JSON.stringify(inspectTrialClosure(userId), null, 2));
    process.exitCode = 2; // Inspeção concluída, exclusão bloqueada.
  } catch (error) {
    // Nunca imprime mensagem bruta de parser/FS que possa conter dados privados.
    console.error(JSON.stringify({ error: error instanceof TrialClosurePreflightError ? error.code : "inspection_failed", deletionAllowed: false }));
    process.exitCode = 1;
  }
}
