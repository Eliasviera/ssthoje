// Gera o pacote de deploy do Elastic Beanstalk contendo SOMENTE o conteúdo de
// examples/app — nunca a raiz do repositório (que tem atalhos .cmd/.mjs e foi o
// motivo de o EB tentar executar abrir-sst-hoje.mjs no lugar do Next.js).
// Uso, dentro de examples/app: node scripts/make-eb-bundle.mjs
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const stage = join(root, ".eb-stage");
const output = join(root, "..", "sst-hoje-eb.zip");

// Mantém exatamente os catálogos-base que o app precisa no primeiro boot.
const SEEDS = new Set([
  "field-vocabulary.json",
  "apr-catalog.json",
  "equipment-checklists.json",
  "dds-topics.json",
  "safety-operations.json",
]);

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "output", "tmp", "uploads", ".eb-stage"]);
// Cache de build do Next só serve para rebuild local; não é necessário em runtime.
const EXCLUDED_PATHS = new Set(["data/asaas-inbox"]);
const EXCLUDED_DIR_PREFIXES = [".next-verify-", "sst-tenant-tests-"];
const EXCLUDED_FILES = new Set(["Dockerfile", ".dockerignore", "compose.yaml", "sst-hoje-eb.zip"]);

// Caminhos relativos sempre em barras normais: no Windows o join gera "\\",
// o que quebrava as comparações e deixava passar as subpastas de data/.
const toPosix = (value) => value.split(/[\\/]/).join("/");

function skipDir(name, relativePath) {
  const path = toPosix(relativePath);
  // cache e artefatos do `next dev` não são usados por `next start` e somam ~800 MB.
  if (path === ".next/cache" || path === ".next/dev") return true;
  if (EXCLUDED_PATHS.has(path)) return true;
  // data/ só contribui com arquivos da lista de sementes: nenhuma subpasta entra.
  if (path.startsWith("data/")) return true;
  return EXCLUDED_DIRS.has(name) || EXCLUDED_DIR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

async function copy(from, to, relativePath = "") {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const childRelative = relativePath ? join(relativePath, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (skipDir(entry.name, childRelative)) continue;
      await copy(join(from, entry.name), join(to, entry.name), childRelative);
      continue;
    }
    if (EXCLUDED_FILES.has(entry.name)) continue;
    if (/\.(log|tsbuildinfo)$/.test(entry.name)) continue;
    if (entry.name.startsWith(".env") && entry.name !== ".env.example" && entry.name !== ".env.aws.example" && entry.name !== ".env.pg.example") continue;
    if (from === join(root, "data") && !SEEDS.has(entry.name)) continue;
    await cp(join(from, entry.name), join(to, entry.name));
  }
}

await rm(stage, { recursive: true, force: true });
await copy(root, stage);

const tar = process.platform === "win32" && existsSync("C:\\Windows\\System32\\tar.exe")
  ? "C:\\Windows\\System32\\tar.exe"
  : "tar";
await rm(output, { force: true });
execFileSync(tar, ["-a", "-c", "-f", output, "-C", stage, "."], { stdio: "inherit" });
await rm(stage, { recursive: true, force: true });

console.log(`Pacote gerado: ${output}`);
