import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

try {
  const bytes = await readFile(join(process.cwd(), "data", "third-party-gate-rules.json"));
  const input = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(input?.rules) || !input.rules.length) throw new Error("Nenhum critério informado.");
  const kinds = new Set(["PGR", "PCMSO", "LTCAT", "Ficha de EPI", "Treinamento", "Outro"]);
  for (const rule of input.rules) {
    if (!rule?.tenantId || !kinds.has(rule.documentKind) || !rule.title || !rule.criteria || !rule.sourceTitle || !rule.sourceVersion || !rule.jurisdiction || !/^\d{4}-\d{2}-\d{2}$/.test(rule.validFrom) || !rule.reviewer) throw new Error("Critério inválido.");
  }
  console.log(JSON.stringify({ mode: "dry_run", sourceHash: createHash("sha256").update(bytes).digest("hex"), rules: input.rules.length, writes: 0 }));
} catch (error) { console.error(`Prévia de critérios interrompida (${error instanceof Error ? error.message : "erro"}). Nenhuma gravação foi realizada.`); process.exitCode = 1; }
