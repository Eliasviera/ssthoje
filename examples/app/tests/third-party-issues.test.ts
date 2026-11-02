import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createThirdPartyInvitation, receiveThirdPartyPdf, openThirdPartyIssue, updateThirdPartyIssue, listThirdPartyInvitations, openThirdPartyPortal, readThirdPartyPdf, renewThirdPartyInvitation, revokeThirdPartyInvitation } from "../src/lib/third-party-store.ts";
import { listAuditEventsForTenant } from "../src/lib/audit-log.ts";

const original = process.cwd(), admin = "sst-demo-user", sst = "sst-demo-sst", other = "sst-demo-user-b";
const pdf = new TextEncoder().encode("%PDF-1.4\nfixture fictícia de armazenamento\n%%EOF");
const corrected = new TextEncoder().encode("%PDF-1.4\nnova fixture fictícia\n%%EOF");
before(() => {
  mkdirSync(join(original, "data"), { recursive: true }); process.chdir(mkdtempSync(join(original, "data", "issues-tests-"))); mkdirSync("data");
  writeFileSync(join("data", "clients.json"), JSON.stringify([{ id: "company", tenantId: "tenant-horizonte", tradeName: "Cliente fictício", status: "active", units: [{ id: "unit", name: "Unidade fictícia", cnpj: "12345678000195" }] }]));
});
after(() => process.chdir(original));
function fixture() {
  const created = createThirdPartyInvitation(admin, { companyId: "company", unitId: "unit", contractorName: "Contratada fictícia M12", contractorCnpj: "11111111000111", scope: randomUUID(), requested: ["PGR"], expiresInHours: 24 });
  const token = created.link.split("#")[1];
  const receipt = receiveThirdPartyPdf(token, "PGR", "original.pdf", pdf, undefined, "2026-12-31").receipts[0];
  const input = { invitationId: created.invitation.id, receiptId: receipt.id, reason: "Motivo público fictício", requestedChange: "Correção pública fictícia", evidence: "EVIDENCIA_INTERNA_RESTRITA", assigneeUserId: sst };
  return { token, receipt, input };
}
test("pendências: abertura e atribuição exigem consultoria e perfil autorizado", () => {
  const f = fixture();
  for (const user of ["", "desconhecido", "sst-demo-medico", other]) assert.throws(() => openThirdPartyIssue(user, f.input));
  assert.throws(() => openThirdPartyIssue(admin, { ...f.input, assigneeUserId: other }), /responsável/);
  assert.throws(() => openThirdPartyIssue(admin, { ...f.input, assigneeUserId: "sst-demo-medico" }), /responsável/);
  assert.throws(() => openThirdPartyIssue(admin, { ...f.input, evidence: "" }), /evidência/);
  const issue = openThirdPartyIssue(admin, f.input);
  assert.equal(issue.events.length, 1);
  assert.equal(issue.correctionPeriod?.calendarDays, 3);
  assert.deepEqual(issue.events[0].correctionPeriod, issue.correctionPeriod);
  assert.deepEqual(openThirdPartyPortal(f.token).corrections[0].correctionPeriod, issue.correctionPeriod);
  assert.throws(() => openThirdPartyIssue(sst, f.input), /Já existe/);
  assert.deepEqual(listThirdPartyInvitations(other), []);
});
test("pendências: ciclo preserva original, comentários internos e reavaliação atribuída", () => {
  const f = fixture(); let issue = openThirdPartyIssue(admin, f.input);
  issue = updateThirdPartyIssue(admin, { invitationId: f.input.invitationId, issueId: issue.id, revision: issue.revision, action: "comment", notes: "COMENTARIO_INTERNO_RESTRITO" });
  const publicBefore = openThirdPartyPortal(f.token);
  assert.equal(publicBefore.corrections[0].requestedChange, f.input.requestedChange);
  assert.equal(JSON.stringify(publicBefore).includes("EVIDENCIA_INTERNA_RESTRITA"), false);
  assert.equal(JSON.stringify(publicBefore).includes("COMENTARIO_INTERNO_RESTRITO"), false);
  assert.equal(JSON.stringify(publicBefore).includes(sst), false);
  assert.throws(() => updateThirdPartyIssue(sst, { invitationId: f.input.invitationId, issueId: issue.id, revision: issue.revision, action: "resolve", notes: "revisão", evidence: "página 1" }), /Aguarde/);
  const publicAfter = receiveThirdPartyPdf(f.token, "PGR", "corrigido.pdf", corrected, { issueId: issue.id, revision: issue.revision, notes: "Correção realizada fictícia" }, "2027-01-31");
  assert.equal(publicAfter.receipts.length, 2);
  const current = publicAfter.receipts[1]; assert.equal(current.replacesReceiptId, f.receipt.id);
  assert.equal(f.receipt.validUntil, "2026-12-31"); assert.equal(current.validUntil, "2027-01-31");
  assert.deepEqual(new Uint8Array(readThirdPartyPdf(admin, f.receipt.id)!.bytes), pdf);
  assert.deepEqual(new Uint8Array(readThirdPartyPdf(sst, current.id)!.bytes), corrected);
  const awaiting = listThirdPartyInvitations(admin).find(i => i.id === f.input.invitationId)!.issues![0];
  assert.equal(awaiting.status, "awaiting_review");
  assert.throws(() => receiveThirdPartyPdf(f.token, "PGR", "replay.pdf", corrected, { issueId: issue.id, revision: issue.revision, notes: "replay" }));
  assert.throws(() => updateThirdPartyIssue(admin, { invitationId: f.input.invitationId, issueId: issue.id, revision: awaiting.revision, action: "resolve", notes: "admin sem atribuição", evidence: "página 1" }), /responsável atribuído/);
  issue = updateThirdPartyIssue(sst, { invitationId: f.input.invitationId, issueId: issue.id, revision: awaiting.revision, action: "resolve", notes: "Correção fictícia conferida", evidence: "PDF corrigido, página 1" });
  assert.equal(issue.status, "resolved"); assert.equal(issue.currentReceiptId, current.id);
  assert.deepEqual(issue.events.map(e => e.type), ["opened", "commented", "resent", "resolved"]);
  assert.equal(issue.events.at(-1)!.receiptId, current.id);
  assert.equal(openThirdPartyPortal(f.token).corrections[0].status, "resolved");
  assert.throws(() => updateThirdPartyIssue(sst, { invitationId: f.input.invitationId, issueId: issue.id, revision: issue.revision, action: "comment", notes: "alteração após encerramento" }));
});
test("pendências: atribuição e revisões antigas não podem sobrescrever histórico", () => {
  const f = fixture(); let issue = openThirdPartyIssue(admin, f.input);
  const base = { invitationId: f.input.invitationId, issueId: issue.id, revision: issue.revision, notes: "Troca fictícia de responsável" };
  assert.throws(() => updateThirdPartyIssue(other, { ...base, action: "comment" }));
  assert.throws(() => updateThirdPartyIssue(admin, { ...base, action: "assign", assigneeUserId: other }));
  issue = updateThirdPartyIssue(admin, { ...base, action: "assign", assigneeUserId: admin });
  assert.equal(issue.assigneeUserId, admin);
  assert.throws(() => updateThirdPartyIssue(admin, { ...base, action: "comment" }), /alterada/);
  assert.throws(() => receiveThirdPartyPdf(f.token, "PGR", "corrigido.pdf", corrected, { issueId: issue.id, revision: base.revision, notes: "versão antiga" }), /alterada/);
});
test("pendências: nova correção mantém evidência interna restrita e permite outra versão", () => {
  const f = fixture(); const issue = openThirdPartyIssue(sst, f.input);
  const response = receiveThirdPartyPdf(f.token, "PGR", "segunda.pdf", corrected, { issueId: issue.id, revision: issue.revision, notes: "Primeira correção fictícia" });
  const revision = response.corrections[0].revision;
  const reopened = updateThirdPartyIssue(sst, { invitationId: f.input.invitationId, issueId: issue.id, revision, action: "reopen", notes: "Ainda precisa corrigir", requestedChange: "Reenviar página fictícia corrigida", evidence: "SEGUNDA_EVIDENCIA_INTERNA" });
  const publicView = openThirdPartyPortal(f.token);
  assert.equal(publicView.corrections[0].reason, "Ainda precisa corrigir");
  assert.equal(JSON.stringify(publicView).includes("SEGUNDA_EVIDENCIA_INTERNA"), false);
  assert.equal(reopened.events[0].requestedChange, f.input.requestedChange);
  assert.deepEqual(reopened.events[0].correctionPeriod, issue.correctionPeriod);
  assert.deepEqual(reopened.events.at(-1)!.correctionPeriod, reopened.correctionPeriod);
  assert.equal(reopened.correctionPeriod?.calendarDays, 3);
  assert.equal(reopened.events.at(-1)!.requestedChange, "Reenviar página fictícia corrigida");
  assert.throws(() => openThirdPartyIssue(admin, f.input), /mais recente/);
  const third = receiveThirdPartyPdf(f.token, "PGR", "terceira.pdf", corrected, { issueId: issue.id, revision: reopened.revision, notes: "Segunda correção fictícia" });
  assert.equal(third.receipts.length, 3); assert.equal(third.receipts[2].replacesReceiptId, third.receipts[1].id);
});
test("pendências: correção não aceita convite ou categoria alheios nem PDF inválido", () => {
  const f = fixture(), otherFixture = fixture(); const issue = openThirdPartyIssue(admin, f.input);
  const correction = { issueId: issue.id, revision: issue.revision, notes: "Correção fictícia" };
  assert.throws(() => receiveThirdPartyPdf(otherFixture.token, "PGR", "corrigido.pdf", pdf, correction), /Correção indisponível/);
  assert.throws(() => receiveThirdPartyPdf(f.token, "ASO", "corrigido.pdf", pdf, correction));
  assert.throws(() => receiveThirdPartyPdf(f.token, "PGR", "corrigido.pdf", new Uint8Array(1), correction), /PDF/);
  assert.throws(() => receiveThirdPartyPdf(f.token, "PGR", "corrigido.pdf", pdf, { ...correction, notes: "" }), /Descreva/);
  assert.equal(openThirdPartyPortal(f.token).receipts.length, 1);
});
test("pendências: renovação invalida token anterior e preserva PDFs e histórico", () => {
  const f = fixture(); const issue = openThirdPartyIssue(admin, f.input);
  assert.throws(() => renewThirdPartyInvitation(sst, f.input.invitationId));
  assert.throws(() => renewThirdPartyInvitation(other, f.input.invitationId));
  const renewed = renewThirdPartyInvitation(admin, f.input.invitationId), newToken = renewed.link.split("#")[1];
  assert.throws(() => openThirdPartyPortal(f.token));
  assert.equal(openThirdPartyPortal(newToken).corrections[0].id, issue.id);
  assert.equal(readFileSync(join("data", "third-party.json"), "utf8").includes(newToken), false);
  revokeThirdPartyInvitation(admin, f.input.invitationId);
  assert.throws(() => renewThirdPartyInvitation(admin, f.input.invitationId));
  assert.throws(() => receiveThirdPartyPdf(newToken, "PGR", "corrigido.pdf", pdf, { issueId: issue.id, revision: issue.revision, notes: "correção fictícia" }));
  assert.equal(readThirdPartyPdf(sst, f.receipt.id)!.bytes.length, pdf.length);
});
test("pendências: auditoria registra eventos sem motivos, evidências ou tokens", () => {
  const events = listAuditEventsForTenant("tenant-horizonte");
  for (const action of ["thirdparty.issue_opened", "thirdparty.issue_updated", "thirdparty.issue_reviewed"]) assert.equal(events.some(e => e.action === action), true);
  assert.equal(JSON.stringify(events).includes("EVIDENCIA_INTERNA_RESTRITA"), false);
  assert.equal(JSON.stringify(events).includes("Motivo público fictício"), false);
  assert.deepEqual(listAuditEventsForTenant("tenant-aurora"), []);
});
