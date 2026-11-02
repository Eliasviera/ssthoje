import test from "node:test";
import assert from "node:assert/strict";
import { validateThirdPartySource } from "../src/lib/third-party-source-contract.mjs";

const stamp = "2026-10-15T12:00:00.000Z";
function fixture() {
  return { invitations: [{ id: "invite", tenantId: "tenant", companyId: "company", unitId: "unit", companyName: "Empresa fictícia", unitName: "Unidade fictícia", relatedCnpj: "11111111000111", contractorName: "Contratada fictícia", contractorCnpj: "11111111000111", requested: ["PGR"], tokenHash: "a".repeat(64), createdAt: stamp, expiresAt: "2026-10-16T12:00:00.000Z", receipts: [{ id: "receipt", kind: "PGR", fileName: "ficticio.pdf", storageName: "receipt.pdf", size: 10, digest: "b".repeat(64), receivedAt: stamp }], issues: [{ id: "issue", kind: "PGR", originalReceiptId: "receipt", currentReceiptId: "receipt", reason: "Motivo fictício", requestedChange: "Correção fictícia", assigneeUserId: "reviewer", status: "open", revision: 1, events: [{ id: "event", type: "opened", occurredAt: stamp, actorUserId: "reviewer", receiptId: "receipt", notes: "Motivo fictício", evidence: "Evidência fictícia" }] }] }] };
}
const has = (report, code) => report.issues.some(issue => issue.code === code);
test("contrato aceita legado opcional ausente sem alterar origem", () => {
  const source = fixture(), before = JSON.stringify(source);
  assert.equal(validateThirdPartySource(source).blockers, 0);
  assert.equal(JSON.stringify(source), before);
});
test("campos desconhecidos bloqueiam em cada nível sem expor nome ou conteúdo", () => {
  for (const level of [source => source, source => source.invitations[0], source => source.invitations[0].receipts[0], source => source.invitations[0].issues[0], source => source.invitations[0].issues[0].events[0]]) {
    const source = fixture(); level(source).private_unknown_field = "private-content";
    const report = validateThirdPartySource(source);
    assert.ok(report.blockers > 0);
    assert.equal(JSON.stringify(report).includes("private_unknown_field"), false); assert.equal(JSON.stringify(report).includes("private-content"), false);
  }
});
test("campos ausentes, tipos falsos e valores acima do limite bloqueiam", () => {
  for (const patch of [{ companyName: undefined }, { medicalAsoRequired: "false" }, { contractorName: "x".repeat(141) }, { requested: ["PGR", "PGR"] }, { scope: null }, { tokenHash: "invalid" }]) {
    const source = fixture(); Object.assign(source.invitations[0], patch);
    assert.ok(validateThirdPartySource(source).blockers > 0);
  }
});
test("rejeita datas normalizadas pelo JavaScript e horários impossíveis", () => {
  for (const value of ["2026-02-30T12:00:00.000Z", "2026-10-15T24:00:00Z", "2026-10-15", "invalid"]) {
    const source = fixture(); source.invitations[0].createdAt = value;
    assert.ok(validateThirdPartySource(source).blockers > 0);
  }
});
test("não trunca notas e não aceita conteúdo inesperado no período", () => {
  const source = fixture(), issue = source.invitations[0].issues[0];
  issue.events[0].notes = "x".repeat(1201);
  assert.ok(has(validateThirdPartySource(source), "CONTRACT_EVENT_FIELD"));
  issue.events[0].notes = "Fictício";
  issue.correctionPeriod = { startedOn: "2026-10-15", dueOn: "2026-10-18", calendarDays: 3, timeZone: "America/Sao_Paulo", extra: true };
  assert.ok(has(validateThirdPartySource(source), "CONTRACT_PERIOD_UNKNOWN_FIELD"));
});
test("aprovações e agendas validadas sem inventar decisão", () => {
  const source = fixture();
  source.integrationApprovals = [{ id: "approval", tenantId: "tenant", invitationId: "invite", fingerprint: "c".repeat(64), approvedBy: "reviewer", approvedAt: stamp, notes: "Decisão fictícia" }];
  source.integrationSchedules = [{ id: "schedule", tenantId: "tenant", invitationId: "invite", approvalId: "approval", scheduledOn: "2026-10-16", createdBy: "admin", createdAt: stamp }];
  assert.equal(validateThirdPartySource(source).blockers, 0);
  source.integrationSchedules[0].scheduledOn = "2026-02-30";
  assert.ok(has(validateThirdPartySource(source), "CONTRACT_SCHEDULE_FIELD"));
});
