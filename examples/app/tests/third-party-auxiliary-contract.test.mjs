import test from "node:test";
import assert from "node:assert/strict";
import { validateThirdPartyAuxiliarySources as validate } from "../src/lib/third-party-auxiliary-contract.mjs";

const stamp = "2026-10-15T12:00:00.000Z";
function fixture() {
  return {
    source: { invitations: [{ tenantId: "tenant", companyId: "company" }] },
    clients: [{ id: "company", tenantId: "tenant", legalName: "Fictícia", tradeName: "", status: "archived", thirdPartyRequirements: ["PGR", "ASO"], units: [{ id: "unit", cnpj: "11111111000111", name: "Fictícia" }] }],
    compliance: { rules: [{ id: "rule", tenantId: "tenant", title: "Fictício", documentKind: "PGR", criteria: "Critério fictício", sourceTitle: "Fonte fictícia", sourceVersion: "v1", jurisdiction: "Demonstração", validFrom: "2026-01-01", validUntil: "", reviewer: "Fictício", version: 1, status: "superseded", previousRuleId: "", createdAt: stamp, createdBy: "reviewer" }], evaluations: [{ id: "evaluation", tenantId: "tenant", documentSource: "contratada", ruleId: "rule", ruleVersion: 1, ruleTitle: "Fictício", sourceTitle: "Fonte fictícia", sourceVersion: "v1", documentId: "receipt", documentTitle: "Fictício", documentKind: "PGR", documentVersion: 1, companyId: "company", unitId: "unit", result: "nao_aplicavel", notes: "Justificativa fictícia", evidence: "", evidenceDocumentId: "document", responsible: "", nextStep: "", evaluatedAt: stamp, evaluatedBy: "reviewer", evaluatorRole: "sst_tst" }] },
    documents: [{ id: "document", tenantId: "tenant", groupId: "group", companyId: "company", unitId: "unit", title: "Fictício", kind: "PGR", storageName: "file.pdf", size: 10, version: 1, status: "archived", validUntil: "", uploadedAt: stamp, uploadedBy: "reviewer" }],
    audit: [{ id: "audit", tenantId: "tenant", actorUserId: "reviewer", actorRole: "sst_tst", action: "thirdparty.read", targetId: "invite", occurredAt: stamp }],
  };
}
const has = (report, code) => report.issues.some(issue => issue.code === code);
test("recortes válidos preservam empresa arquivada, regra substituída e evidência histórica", () => {
  const input = fixture(), before = JSON.stringify(input);
  assert.equal(validate(input).blockers, 0); assert.equal(JSON.stringify(input), before);
});
test("requisitos inválidos, unidade duplicada e campos de empresa usados pelo fluxo bloqueiam", () => {
  const input = fixture(), company = input.clients[0];
  company.thirdPartyRequirements.push("invalid"); company.units.push(structuredClone(company.units[0])); company.status = "unknown";
  const report = validate(input);
  assert.ok(has(report, "AUX_INVALID_COMPANY")); assert.ok(has(report, "AUX_DUPLICATE_UNIT"));
});
test("período inválido e vínculo de critério anterior de outro tenant bloqueiam", () => {
  const input = fixture(), rule = input.compliance.rules[0];
  rule.validUntil = "2025-12-31"; rule.previousRuleId = "prior"; rule.version = 2;
  input.compliance.rules.push({ ...rule, id: "prior", tenantId: "other", version: 1, previousRuleId: "" });
  const report = validate(input);
  assert.ok(has(report, "AUX_INVALID_RULE_PERIOD")); assert.ok(has(report, "AUX_INVALID_PREVIOUS_RULE"));
});
test("não valida conteúdo irrelevante de outro domínio como se fosse de Terceiros", () => {
  const input = fixture();
  input.clients.push({ id: "other-company", tenantId: "other", private_unknown: "hidden" });
  input.compliance.rules.push({ id: "other-rule", tenantId: "other", private_unknown: "hidden" });
  input.audit.push({ action: "auth.login_succeeded", private_unknown: "hidden" });
  input.clients[0].contactPhone = "fictitious";
  assert.equal(validate(input).blockers, 0);
});
test("avaliação e documento de evidência precisam ter os campos consumidos válidos", () => {
  const input = fixture(); input.compliance.evaluations[0].evaluatedAt = "2026-02-30T12:00:00Z"; input.documents[0].size = -1;
  const report = validate(input);
  assert.ok(has(report, "AUX_INVALID_CONTRACTOR_EVALUATION")); assert.ok(has(report, "AUX_INVALID_EVIDENCE_DOCUMENT"));
});
test("auditoria do domínio rejeita papel e campo desconhecidos sem revelar conteúdo", () => {
  const input = fixture(); input.audit[0].actorRole = "unknown"; input.audit[0].private_unknown = "private-content";
  const report = validate(input);
  assert.ok(has(report, "AUX_INVALID_THIRDPARTY_AUDIT")); assert.ok(has(report, "AUX_UNKNOWN_THIRDPARTY_AUDIT_FIELD"));
  assert.equal(JSON.stringify(report).includes("private_unknown"), false); assert.equal(JSON.stringify(report).includes("private-content"), false);
});
test("coleções ausentes ou inválidas não viram origem aprovada", () => {
  const input = fixture(); input.clients = {}; input.audit = [null];
  assert.ok(has(validate(input), "AUX_INVALID_COLLECTION")); assert.ok(has(validate(input), "AUX_INVALID_AUDIT_ENVELOPE"));
});
