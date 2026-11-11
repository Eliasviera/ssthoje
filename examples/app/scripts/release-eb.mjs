// Ciclo completo de atualização local → AWS (Elastic Beanstalk).
// Uso, dentro de examples/app: node scripts/release-eb.mjs
// Faz: build de produção (sem standalone) → empacota só examples/app → mostra
// tamanho e SHA-256 do zip gerado em examples/sst-hoje-eb.zip.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const zip = join(root, "..", "sst-hoje-eb.zip");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");

function run(label, args) {
  console.log(`\n=== ${label}`);
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`\nFALHOU: ${label}. O pacote NÃO foi atualizado.`);
    process.exit(1);
  }
}

run("1/3 Build de produção", [nextCli, "build"]);
run("2/3 Empacotando examples/app", [join(root, "scripts", "make-eb-bundle.mjs")]);

console.log("\n=== 3/3 Conferindo pacote");
const bytes = statSync(zip).size;
const hash = createHash("sha256").update(readFileSync(zip)).digest("hex");
const sizeMb = (bytes / 1024 / 1024).toFixed(1);

console.log(`Pacote:  examples/sst-hoje-eb.zip`);
console.log(`Tamanho: ${sizeMb} MB`);
console.log(`SHA-256: ${hash}`);
console.log(`Gerado:  ${new Date().toLocaleString("pt-BR")}`);
console.log(`
Próximos passos:
  1. Console do EB → seu ambiente → "Carregar e implantar" → escolha o zip acima.
     (Ou, com EB CLI configurada: eb deploy)
  2. Espere a Health ficar "Ok".
  3. Valide /api/health, a tela de login e um dado antigo (prova de que o volume sobreviveu).
  4. Se algo quebrar: Console → "Versões da aplicação" → reimplante a versão anterior.
`);
