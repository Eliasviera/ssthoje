import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const source = async name => {
  const bytes = await readFile(join(process.cwd(), "data", name));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
};
const allowed = new Set(["PGR", "PCMSO", "LTCAT", "Ficha de EPI", "Treinamento", "Outro", "ASO"]);

try {
  const [clients, compliance] = await Promise.all([source("clients.json"), source("compliance.json")]);
  if (!Array.isArray(clients.value) || !compliance.value || !Array.isArray(compliance.value.rules) || !Array.isArray(compliance.value.evaluations)) throw new Error("Formato de origem inválido.");
  const scopes = [];
  const blockers = [];
  for (const company of clients.value) {
    if (!company || company.status !== "active" || !Array.isArray(company.units)) continue;
    const requirements = Array.isArray(company.thirdPartyRequirements) ? company.thirdPartyRequirements : [];
    if (requirements.some(kind => typeof kind !== "string" || !allowed.has(kind))) blockers.push("REQUIREMENT_KIND_INVALID");
    for (const unit of company.units) {
      if (!unit?.id || !company.id || !company.tenantId) { blockers.push("COMPANY_SCOPE_INVALID"); continue; }
      scopes.push({ tenantId: company.tenantId, companyId: company.id, unitId: unit.id, requirementCount: requirements.length, medicalRestricted: requirements.includes("ASO") });
    }
  }
  const rules = compliance.value.rules.filter(rule => rule && rule.status === "active");
  const evaluations = compliance.value.evaluations.filter(evaluation => evaluation && evaluation.documentSource === "contratada");
  for (const rule of rules) if (!rule.tenantId || !rule.id || !allowed.has(rule.documentKind) || rule.documentKind === "ASO") blockers.push("RULE_NOT_COMPATIBLE_WITH_GATE");
  console.log(JSON.stringify({
    mode: "read_only_dry_run",
    candidateSchema: "not_applied",
    sources: { clients: hash(clients.bytes), compliance: hash(compliance.bytes) },
    activeScopes: scopes.length,
    scopesWithRequirements: scopes.filter(scope => scope.requirementCount > 0).length,
    proposedRequirementSets: scopes.filter(scope => scope.requirementCount > 0).length,
    proposedRequirementItems: scopes.reduce((total, scope) => total + scope.requirementCount, 0),
    medicalRestrictedScopes: scopes.filter(scope => scope.medicalRestricted).length,
    activeRules: rules.length,
    contractorEvaluations: evaluations.length,
    blockers: [...new Set(blockers)].sort(),
    readyForImport: false,
  }));
} catch (error) {
  console.error(`Reconciliação do gate interrompida (${error instanceof Error ? error.message : "erro"}). Nenhuma gravação foi realizada.`);
  process.exitCode = 1;
}
