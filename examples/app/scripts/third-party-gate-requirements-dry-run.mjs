import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const source = join(process.cwd(), "data", "third-party-gate-requirements.json");
try {
  const bytes = await readFile(source);
  const input = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(input?.requirementSets)) throw new Error("Formato inválido.");
  const allowed = new Set(["PGR", "PCMSO", "LTCAT", "Ficha de EPI", "Treinamento", "O.S.", "Outro", "ASO"]);
  const scopes = new Set(); let items = 0;
  for (const set of input.requirementSets) {
    if (!set?.tenantId || !set.companyId || !set.unitId || !Number.isInteger(set.revision) || set.revision < 1 || !Array.isArray(set.requirements) || !set.requirements.length) throw new Error("Conjunto de requisitos inválido.");
    const key = `${set.tenantId}\0${set.companyId}\0${set.unitId}`;
    if (scopes.has(key)) throw new Error("Escopo duplicado.");
    scopes.add(key);
    const kinds = new Set();
    for (const item of set.requirements) {
      if (!item || !allowed.has(item.documentKind) || kinds.has(item.documentKind) || Boolean(item.medicalRestricted) !== (item.documentKind === "ASO") || (item.documentKind !== "ASO" && item.restrictedNote)) throw new Error("Item de requisito inválido.");
      if (item.documentKind === "ASO" && (typeof item.restrictedNote !== "string" || !item.restrictedNote.trim() || item.restrictedNote.length > 600)) throw new Error("Sinalização restrita do ASO inválida.");
      kinds.add(item.documentKind); items++;
    }
  }
  console.log(JSON.stringify({ mode: "dry_run", sourceHash: createHash("sha256").update(bytes).digest("hex"), requirementSets: input.requirementSets.length, requirementItems: items, writes: 0 }));
} catch (error) {
  console.error(`Prévia de requisitos interrompida (${error instanceof Error ? error.message : "erro"}). Nenhuma gravação foi realizada.`);
  process.exitCode = 1;
}
