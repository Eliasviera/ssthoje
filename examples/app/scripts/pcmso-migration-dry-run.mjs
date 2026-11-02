import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzePcmsoMigration } from "../src/lib/pcmso-migration.ts";

if (process.argv.includes("--apply")) {
  console.error("Este comando é somente leitura; não existe modo de importação.");
  process.exit(2);
}

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function scopesFrom(companies) {
  if (!Array.isArray(companies)) throw new Error("invalid scopes");
  const scopes = new Set();
  for (const company of companies) {
    if (!company || typeof company.tenantId !== "string" || typeof company.id !== "string" || !Array.isArray(company.units)) throw new Error("invalid company");
    for (const unit of company.units) {
      if (!unit || typeof unit.id !== "string") throw new Error("invalid unit");
      scopes.add(`${company.tenantId}\u0000${company.id}\u0000${unit.id}`);
    }
  }
  return scopes;
}

try {
  const dataDir = join(process.cwd(), "data");
  const [pcmsoBytes, companyBytes] = await Promise.all([
    readFile(join(dataDir, "pcmso.json")),
    readFile(join(dataDir, "clients.json")),
  ]);
  const source = JSON.parse(pcmsoBytes.toString("utf8"));
  const companies = JSON.parse(companyBytes.toString("utf8"));
  const report = analyzePcmsoMigration(source, scopesFrom(companies));
  const tenantCount = new Set(Array.isArray(source.records) ? source.records.map((record) => record?.tenantId).filter((tenantId) => typeof tenantId === "string") : []).size;
  console.log(JSON.stringify({
    mode: "read-only-dry-run",
    hashes: { pcmso: hash(pcmsoBytes), clientScopes: hash(companyBytes) },
    tenantCount,
    ...report,
  }));
  if (report.blocked) process.exitCode = 1;
} catch {
  console.error("Pré-check PCMSO não concluído: origem ausente ou inválida; nenhum conteúdo foi exibido.");
  process.exitCode = 1;
}
