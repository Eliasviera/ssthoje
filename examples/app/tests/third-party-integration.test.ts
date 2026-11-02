import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getThirdPartyIntegrationState, approveThirdPartyIntegration, scheduleThirdPartyIntegration } from "../src/lib/third-party-store.ts";
import { createCorrectionPeriod } from "../src/lib/correction-period.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";

const original = process.cwd(), admin = "sst-demo-user", sst = "sst-demo-sst", other = "sst-demo-user-b";
const save = (name: string, value: unknown) => writeFileSync(join("data", name), JSON.stringify(value));
const load = (name: string) => JSON.parse(readFileSync(join("data", name), "utf8"));
const today = createCorrectionPeriod().startedOn;
beforeEach(() => {
  mkdirSync(join(original, "data"), { recursive: true });
  process.chdir(mkdtempSync(join(original, "data", "integration-gate-tests-"))); mkdirSync("data");
  save("clients.json", [{ id: "company", tenantId: "tenant-horizonte", status: "active", thirdPartyRequirements: ["PGR"], units: [{ id: "unit", name: "Unidade fictícia" }] }]);
  save("third-party.json", { invitations: [{ id: "invite", tenantId: "tenant-horizonte", companyId: "company", unitId: "unit", companyName: "Empresa fictícia", unitName: "Unidade fictícia", contractorCnpj: "11111111000111", contractorName: "Contratada fictícia", scope: "Montagem fictícia", requested: ["PGR"], createdAt: "2026-01-01T12:00:00Z", expiresAt: "2026-01-02T12:00:00Z", tokenHash: "synthetic", receipts: [{ id: "receipt", kind: "PGR", digest: "synthetic", fileName: "ficticio.pdf", receivedAt: "2026-01-01T12:00:00Z" }], issues: [] }] });
  save("compliance.json", { rules: [{ id: "rule", tenantId: "tenant-horizonte", documentKind: "PGR", title: "Critério fictício", version: 1, status: "active", validFrom: "2026-01-01", validUntil: "2099-12-31" }], evaluations: [{ id: "evaluation", tenantId: "tenant-horizonte", documentSource: "contratada", documentId: "receipt", documentKind: "PGR", companyId: "company", unitId: "unit", ruleId: "rule", ruleVersion: 1, result: "atende", notes: "", evaluatedAt: "2026-01-01T13:00:00Z" }] });
});
afterEach(() => process.chdir(original));
function approve() { const state = getThirdPartyIntegrationState(admin, "invite"); return approveThirdPartyIntegration(admin, { invitationId: "invite", expectedFingerprint: state.fingerprint, notes: "DECISAO_INTERNA_FICTICIA" }); }

test("integração: leitura, decisão e agendamento exigem perfil e tenant no servidor", () => {
  for (const user of [other, "sst-demo-medico", "", "unknown"]) {
    assert.throws(() => getThirdPartyIntegrationState(user, "invite"));
    assert.throws(() => approveThirdPartyIntegration(user, { invitationId: "invite", expectedFingerprint: "forged", notes: "teste" }));
  }
  assert.equal(getThirdPartyIntegrationState(sst, "invite").ready, true);
  const approval = approve();
  assert.throws(() => scheduleThirdPartyIntegration(sst, { invitationId: "invite", approvalId: approval.id, scheduledOn: today }));
  assert.throws(() => scheduleThirdPartyIntegration(other, { invitationId: "invite", approvalId: approval.id, scheduledOn: today }));
});

test("integração: satisfação dos critérios não aprova automaticamente; decisão habilita agendamento", () => {
  const state = getThirdPartyIntegrationState(admin, "invite");
  assert.equal(state.ready, true); assert.equal(state.approved, false);
  assert.throws(() => scheduleThirdPartyIntegration(admin, { invitationId: "invite", approvalId: "forged", scheduledOn: today }), /bloqueado/);
  const approval = approve();
  const schedule = scheduleThirdPartyIntegration(admin, { invitationId: "invite", approvalId: approval.id, scheduledOn: today });
  assert.equal(getThirdPartyIntegrationState(admin, "invite").schedules[0].current, true);
  assert.equal(schedule.approvalId, approval.id);
  assert.throws(() => scheduleThirdPartyIntegration(admin, { invitationId: "invite", approvalId: approval.id, scheduledOn: today }), /Já existe/);
  assert.equal(JSON.stringify(listAuditEventsForTenant("tenant-horizonte")).includes("DECISAO_INTERNA_FICTICIA"), false);
});

test("integração: nova versão invalida decisão e agendamento, preservando histórico", () => {
  const approval = approve(); scheduleThirdPartyIntegration(admin, { invitationId: "invite", approvalId: approval.id, scheduledOn: today });
  const db = load("third-party.json");
  db.invitations[0].receipts.push({ ...db.invitations[0].receipts[0], id: "new", replacesReceiptId: "receipt", receivedAt: "2026-01-02T12:00:00Z" }); save("third-party.json", db);
  const state = getThirdPartyIntegrationState(admin, "invite");
  assert.equal(state.approved, false); assert.equal(state.ready, false); assert.equal(state.approvals.length, 1); assert.equal(state.schedules[0].current, false);
  assert.throws(() => scheduleThirdPartyIntegration(admin, { invitationId: "invite", approvalId: approval.id, scheduledOn: today }), /bloqueado/);
});

test("integração: resultado pendente, ausência de critério e revisão antiga bloqueiam", () => {
  const db = load("compliance.json"); db.evaluations[0].result = "pendente"; save("compliance.json", db);
  assert.equal(getThirdPartyIntegrationState(admin, "invite").ready, false);
  db.evaluations[0].result = "atende"; db.rules[0].version = 2; save("compliance.json", db);
  assert.equal(getThirdPartyIntegrationState(admin, "invite").ready, false);
  db.rules = []; save("compliance.json", db);
  assert.equal(getThirdPartyIntegrationState(admin, "invite").ready, false);
});

test("integração: ASO exigido, requisito não solicitado e escopo ausente não são dispensados", () => {
  const clients = load("clients.json"); clients[0].thirdPartyRequirements.push("ASO", "PCMSO"); save("clients.json", clients);
  const db = load("third-party.json"); delete db.invitations[0].scope; save("third-party.json", db);
  const state = getThirdPartyIntegrationState(admin, "invite");
  assert.equal(state.ready, false); assert.ok(state.blockers.some((b) => b.includes("ASO"))); assert.ok(state.blockers.some((b) => b.includes("PCMSO"))); assert.ok(state.blockers.some((b) => b.includes("escopo explícito")));
  assert.throws(() => approveThirdPartyIntegration(admin, { invitationId: "invite", expectedFingerprint: state.fingerprint, notes: "não dispensar" }), /bloqueada/);
});

test("integração: formulário antigo, pendência aberta e data inválida são rejeitados", () => {
  const initial = getThirdPartyIntegrationState(admin, "invite");
  const compliance = load("compliance.json"); compliance.evaluations[0].evaluatedAt = "2026-01-02T13:00:00Z"; save("compliance.json", compliance);
  assert.throws(() => approveThirdPartyIntegration(admin, { invitationId: "invite", expectedFingerprint: initial.fingerprint, notes: "revisão antiga" }), /alterados/);
  const approval = approve();
  for (const scheduledOn of ["2026-02-30", "2000-01-01", "bad"]) assert.throws(() => scheduleThirdPartyIntegration(admin, { invitationId: "invite", approvalId: approval.id, scheduledOn }), /data válida/);
  const db = load("third-party.json"); db.invitations[0].issues.push({ id: "issue", kind: "PGR", status: "open", currentReceiptId: "receipt" }); save("third-party.json", db);
  assert.equal(getThirdPartyIntegrationState(admin, "invite").approved, false);
});

test("integração: critério vencido na data futura escolhida bloqueia agendamento", () => {
  const db = load("compliance.json"); db.rules[0].validUntil = today; save("compliance.json", db);
  const approval = approve();
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.throws(() => scheduleThirdPartyIntegration(admin, { invitationId: "invite", approvalId: approval.id, scheduledOn: tomorrow.toISOString().slice(0, 10) }), /data escolhida/);
  assert.equal(getThirdPartyIntegrationState(admin, "invite").schedules.length, 0);
});
