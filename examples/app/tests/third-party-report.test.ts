import assert from "node:assert/strict";
import test from "node:test";
import { buildThirdPartyReport } from "../src/lib/third-party-report.ts";
import type { InvitationSummary } from "../src/lib/third-party-store";
import type { ComplianceEvaluation } from "../src/lib/compliance-store";

const invite = (patch: Partial<InvitationSummary> = {}): InvitationSummary => ({ id: "invite", companyId: "company", unitId: "unit", companyName: "Cliente fictício", unitName: "Unidade fictícia", relatedCnpj: "11111111000111", contractorName: "Contratada fictícia", contractorCnpj: "22222222000122", scope: "Montagem", requested: ["PGR"], createdAt: "2026-10-10T12:00:00Z", expiresAt: "2026-10-11T12:00:00Z", linkStatus: "expired", receipts: [], ...patch });
const receipt = (id: string, receivedAt: string, replacesReceiptId?: string, validUntil?: string) => ({ id, kind: "PGR" as const, fileName: "ficticio.pdf", size: 10, digest: "synthetic", receivedAt, replacesReceiptId, validUntil });
const evaluation = (patch: Partial<ComplianceEvaluation> = {}) => ({ id: "evaluation", tenantId: "tenant", documentSource: "contratada", documentId: "new", companyId: "company", unitId: "unit", documentKind: "PGR", ruleId: "rule", ruleTitle: "Critério fictício", ruleVersion: 1, result: "atende", responsible: "Revisor fictício", nextStep: "Conferir", evaluatedAt: "2026-10-12T12:00:00Z", ...patch }) as ComplianceEvaluation;

test("relatório usa versão atual e exclui avaliação de outro tenant, unidade e origem", () => {
  const invitations = [invite({ receipts: [receipt("old", "2026-10-10T12:00:00Z"), receipt("new", "2026-10-11T12:00:00Z", "old")] })];
  const report = buildThirdPartyReport("tenant", invitations, [evaluation({ documentId: "old", id: "old-review" }), evaluation({ tenantId: "other", id: "foreign" }), evaluation({ unitId: "other", id: "unit-review" }), evaluation({ documentSource: "consultoria", id: "internal" }), evaluation()]);
  assert.equal(report[0].rows[0].current?.id, "new");
  assert.equal(report[0].rows[0].versions, 2);
  assert.deepEqual(report[0].rows[0].reviews.map((review) => review.id), ["evaluation"]);
});

test("relatório preserva critérios independentes e última avaliação de cada critério", () => {
  const report = buildThirdPartyReport("tenant", [invite({ receipts: [receipt("new", "2026-10-11T12:00:00Z")] })], [evaluation({ id: "earlier", evaluatedAt: "2026-10-11T12:00:00Z" }), evaluation(), evaluation({ id: "second", ruleId: "second-rule", result: "pendente" })]);
  assert.deepEqual(report[0].rows[0].reviews.map((review) => review.id), ["evaluation", "second"]);
});

test("relatório separa unidade, escopo e convites legados, sem inferir recebimento ou ASO", () => {
  const report = buildThirdPartyReport("tenant", [invite(), invite({ id: "other-unit", unitId: "other" }), invite({ id: "other-scope", scope: "Pintura" }), invite({ id: "legacy-a", scope: undefined }), invite({ id: "legacy-b", scope: undefined, medicalAsoRequired: true })], []);
  assert.equal(report.length, 5);
  assert.equal(report[0].rows[0].current, null);
  assert.equal(report[0].rows[0].reviews.length, 0);
  assert.equal(report[4].medicalAsoRequired, true);
});

test("validade declarada é calculada na data de referência sem inferência", () => {
  const invitations = [
    invite({ receipts: [receipt("same-day", "2026-10-10T12:00:00Z", undefined, "2026-10-12")] }),
    invite({ id: "expired", contractorCnpj: "33333333000133", receipts: [receipt("past", "2026-10-10T12:00:00Z", undefined, "2026-10-11")] }),
    invite({ id: "uninformed", contractorCnpj: "44444444000144", receipts: [receipt("blank", "2026-10-10T12:00:00Z")] }),
    invite({ id: "missing", contractorCnpj: "55555555000155" }),
  ];
  const report = buildThirdPartyReport("tenant", invitations, [], "2026-10-12");
  assert.deepEqual(report.map((group) => group.rows[0].validityStatus), ["current", "expired", "not_informed", "not_received"]);
  assert.equal(report[0].rows[0].current?.validUntil, "2026-10-12");
});
