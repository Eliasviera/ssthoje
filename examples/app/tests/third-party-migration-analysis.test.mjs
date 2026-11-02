import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThirdPartyMigration } from "../src/lib/third-party-migration-analysis.mjs";
import { inspectThirdPartySource } from "../scripts/third-party-migration-dry-run.mjs";

const stamp = "2026-10-15T12:00:00.000Z";
function fixture() {
  const receipt = { id: "r1", kind: "PGR", fileName: "private-fictitious.pdf", storageName: "r1.pdf", size: 10, digest: "a".repeat(64), receivedAt: stamp };
  const invite = { id: "i1", tenantId: "tenant", companyId: "company", unitId: "unit", companyName: "Empresa fictícia", unitName: "Unidade fictícia", relatedCnpj: "11111111000111", contractorName: "Contratada fictícia", contractorCnpj: "11111111000111", tokenHash: "b".repeat(64), createdAt: "2026-10-14T12:00:00.000Z", expiresAt: "2026-10-16T12:00:00.000Z", requested: ["PGR"], receipts: [receipt], issues: [] };
  return { source: { invitations: [invite] }, clients: [{ id: "company", tenantId: "tenant", legalName: "Empresa fictícia", tradeName: "", status: "active", units: [{ id: "unit", cnpj: "11111111000111", name: "Unidade fictícia" }] }], audit: [] };
}
const analyze = f => analyzeThirdPartyMigration(f.source, f.clients, f.audit, f.compliance ?? { rules: [], evaluations: [] }, f.documents ?? []);
const has = (report, code) => report.issues.some(issue => issue.code === code);

test("origem legada preservada, saída restrita e nenhuma prontidão de importação inferida", () => {
  const f = fixture(), before = JSON.stringify(f), report = analyze(f);
  assert.equal(report.blockers, 0);
  assert.equal(report.importReady, false);
  assert.ok(has(report, "LEGACY_SCOPE_ABSENT"));
  assert.ok(has(report, "LEGACY_VALIDITY_ABSENT"));
  assert.equal(JSON.stringify(f), before);
  for (const secret of ["private-fictitious.pdf", "11111111000111", "b".repeat(64)]) assert.equal(JSON.stringify(report).includes(secret), false);
});
test("referências de outra consultoria e IDs duplicados bloqueiam", () => {
  const f = fixture(); f.clients[0].tenantId = "other"; f.source.invitations.push(structuredClone(f.source.invitations[0]));
  const report = analyze(f);
  assert.ok(has(report, "INVALID_COMPANY_UNIT")); assert.ok(has(report, "DUPLICATE_INVITATION")); assert.ok(has(report, "DUPLICATE_RECEIPT"));
});
test("substituição entre convites exige mesmo tenant e escopo explícito; ciclos bloqueiam", () => {
  const f = fixture(), first = f.source.invitations[0]; first.scope = "Montagem";
  const second = structuredClone(first); second.id = "i2"; second.scope = " montagem "; second.receipts[0].id = "r2"; second.receipts[0].replacesReceiptId = "r1";
  f.source.invitations.push(second);
  assert.equal(analyze(f).blockers, 0);
  second.unitId = "other"; assert.ok(has(analyze(f), "INVALID_REPLACEMENT")); second.unitId = "unit";
  first.receipts[0].replacesReceiptId = "r2"; assert.ok(has(analyze(f), "REPLACEMENT_CYCLE"));
});
test("datas impossíveis, revisão e referência de evento inválidas bloqueiam", () => {
  const f = fixture(), invite = f.source.invitations[0]; invite.receipts[0].validUntil = "2026-02-30";
  invite.issues.push({ id: "issue", kind: "PGR", originalReceiptId: "r1", currentReceiptId: "r1", revision: 2, status: "open", events: [{ id: "event", type: "opened", actorUserId: "reviewer", occurredAt: stamp, receiptId: "foreign" }] });
  const report = analyze(f);
  assert.ok(has(report, "INVALID_VALIDITY")); assert.ok(has(report, "INVALID_ISSUE_REVISION")); assert.ok(has(report, "INVALID_ISSUE_EVENT"));
});
test("agenda não pode apontar aprovação de outra consultoria", () => {
  const f = fixture(); f.source.integrationApprovals = [{ id: "approval", tenantId: "other", invitationId: "i1", approvedAt: stamp, approvedBy: "reviewer", notes: "fictitious", fingerprint: "c".repeat(64) }];
  f.source.integrationSchedules = [{ id: "schedule", tenantId: "tenant", invitationId: "i1", approvalId: "approval", scheduledOn: "2026-10-16", createdAt: stamp, createdBy: "admin" }];
  assert.ok(has(analyze(f), "INVALID_SCHEDULE_APPROVAL"));
});
test("entrada malformada retorna códigos sem expor conteúdo", () => {
  assert.ok(analyzeThirdPartyMigration({ invitations: [null, "sensitive"] }, null, null).blockers > 0);
});
test("leitura estável, alteração concorrente e JSON inválido", async () => {
  const f = fixture();
  const bytes = { "third-party.json": Buffer.from(JSON.stringify(f.source)), "clients.json": Buffer.from(JSON.stringify(f.clients)), "compliance.json": Buffer.from('{"rules":[],"evaluations":[]}'), "documents.json": Buffer.from("[]"), "audit-log.jsonl": Buffer.from("") };
  const files = async () => ({ counts: { checked: 0, verified: 0, verifiedBytes: 0 }, blockers: 0, issues: [] });
  const stable = await inspectThirdPartySource(async name => bytes[name], files);
  assert.equal(stable.sourceStable, true); assert.equal(stable.blockers, 0);
  assert.equal(stable.sourceManifest.version, 1);
  assert.equal(stable.sourceManifest.totals.tenants, 1);
  assert.equal(stable.sourceManifest.totals.invitations, 1);
  assert.equal(stable.sourceManifest.files.find(file => file.name === "documents.json").present, true);
  assert.equal(JSON.stringify(stable.sourceManifest).includes("Empresa fictícia"), false);
  let calls = 0;
  const changed = await inspectThirdPartySource(async name => { calls++; return calls > 5 && name === "audit-log.jsonl" ? Buffer.from("\n") : bytes[name]; }, files);
  assert.equal(changed.sourceStable, false); assert.ok(has(changed, "SOURCE_CHANGED_DURING_READ"));
  await assert.rejects(inspectThirdPartySource(async () => Buffer.from("invalid"), files));
  const failedFiles = await inspectThirdPartySource(async name => bytes[name], async () => ({ counts: { checked: 1, verified: 0, verifiedBytes: 0 }, blockers: 1, issues: [{ severity: "blocker", code: "PDF_FILE_MISSING", count: 1 }] }));
  assert.equal(failedFiles.blockers, 1); assert.ok(has(failedFiles, "PDF_FILE_MISSING"));
  bytes["documents.json"] = null;
  const absent = await inspectThirdPartySource(async name => bytes[name], files);
  assert.equal(absent.sourceHashes["documents.json"], null); assert.equal(absent.blockers, 0); assert.ok(has(absent, "INTERNAL_DOCUMENT_SOURCE_ABSENT"));
  assert.equal(absent.sourceManifest.files.find(file => file.name === "documents.json").present, false);
  let documentReads = 0;
  const appeared = await inspectThirdPartySource(async name => name === "documents.json" ? (++documentReads === 1 ? null : Buffer.from("[]")) : bytes[name], files);
  assert.ok(has(appeared, "SOURCE_CHANGED_DURING_READ"));
  const originalSource = bytes["third-party.json"];
  bytes["third-party.json"] = Buffer.from(JSON.stringify({ ...f.source, private_unknown_field: "private-content" }));
  const unknown = await inspectThirdPartySource(async name => bytes[name], files);
  assert.ok(has(unknown, "CONTRACT_SOURCE_UNKNOWN_FIELD")); assert.ok(unknown.blockers > 0);
  assert.equal(JSON.stringify(unknown).includes("private-content"), false);
  bytes["third-party.json"] = originalSource;
});

function historyFixture() {
  const f = fixture(), invite = f.source.invitations[0];
  const original = invite.receipts[0];
  const correction = { ...original, id: "r2", issueId: "issue", replacesReceiptId: "r1" };
  invite.receipts.push(correction);
  const opened = { id: "opened", type: "opened", actorUserId: "reviewer", receiptId: "r1", occurredAt: stamp, assigneeUserId: "reviewer" };
  const resent = { id: "resent", type: "resent", actorUserId: "invite:i1", receiptId: "r2", occurredAt: stamp, evidence: correction.digest };
  const resolved = { id: "resolved", type: "resolved", actorUserId: "reviewer", receiptId: "r2", occurredAt: stamp };
  invite.issues.push({ id: "issue", kind: "PGR", originalReceiptId: "r1", currentReceiptId: "r2", assigneeUserId: "reviewer", revision: 3, status: "resolved", events: [opened, resent, resolved] });
  return f;
}
test("histórico válido reconstrói estado sem modificar os dados legados", () => {
  const f = historyFixture(), before = JSON.stringify(f);
  assert.equal(analyze(f).blockers, 0);
  assert.equal(JSON.stringify(f), before);
});
test("resolver antes de reenvio e estado atual divergente são bloqueados", () => {
  const f = historyFixture(), issue = f.source.invitations[0].issues[0];
  issue.events.splice(1, 1); issue.revision = 2;
  assert.ok(has(analyze(f), "INVALID_ISSUE_TRANSITION"));
  const other = historyFixture(); other.source.invitations[0].issues[0].status = "open";
  assert.ok(has(analyze(other), "ISSUE_PROJECTION_MISMATCH"));
});
test("recibo corrigido deve apontar a pendência e substituição corretas em ambos os sentidos", () => {
  const f = historyFixture(), correction = f.source.invitations[0].receipts[1];
  correction.issueId = "unknown";
  assert.ok(has(analyze(f), "INVALID_CORRECTION_RECEIPT"));
  assert.ok(has(analyze(f), "ORPHAN_CORRECTION_RECEIPT"));
  correction.issueId = "issue"; correction.replacesReceiptId = undefined;
  assert.ok(has(analyze(f), "INVALID_CORRECTION_RECEIPT"));
});
test("histórico da pendência não aceita recibo de outro convite mesmo com escopo igual", () => {
  const f = historyFixture(), invite = f.source.invitations[0]; invite.scope = "Montagem";
  const other = { ...structuredClone(invite), id: "i2", issues: [], receipts: [invite.receipts.pop()] };
  f.source.invitations.push(other);
  assert.ok(has(analyze(f), "INVALID_ISSUE_RECEIPT_OWNER"));
  assert.ok(has(analyze(f), "INVALID_ISSUE_EVENT_RECEIPT"));
});
test("atribuição e comentário preservam estado; revisão exige responsável atribuído", () => {
  const f = historyFixture(), issue = f.source.invitations[0].issues[0];
  issue.events.splice(2, 0, { id: "assigned", type: "assigned", receiptId: "r2", occurredAt: stamp, actorUserId: "admin", assigneeUserId: "second-reviewer" });
  issue.events.push({ id: "comment", type: "commented", receiptId: "r2", occurredAt: stamp, actorUserId: "admin" });
  issue.revision = 5; issue.assigneeUserId = "second-reviewer";
  assert.ok(has(analyze(f), "INVALID_REVIEW_ACTOR"));
  issue.events[3].actorUserId = "second-reviewer";
  assert.equal(analyze(f).blockers, 0);
});
test("reabertura preserva dois ciclos de correção e compara o snapshot final", () => {
  const f = historyFixture(), invite = f.source.invitations[0], issue = invite.issues[0];
  const first = { startedOn: "2026-10-15", dueOn: "2026-10-18", calendarDays: 3, timeZone: "America/Sao_Paulo" };
  const second = { ...first, startedOn: "2026-10-16", dueOn: "2026-10-19" };
  issue.events[0].correctionPeriod = first;
  issue.events[2].type = "reopened"; issue.events[2].correctionPeriod = second;
  issue.status = "open"; issue.correctionPeriod = second;
  assert.equal(analyze(f).blockers, 0);
  issue.correctionPeriod = first;
  assert.ok(has(analyze(f), "ISSUE_PROJECTION_MISMATCH"));
});

function evaluatedFixture() {
  const f = fixture();
  f.compliance = { rules: [{ id: "rule", tenantId: "tenant", documentKind: "PGR", version: 1, status: "superseded" }], evaluations: [{ id: "evaluation", tenantId: "tenant", documentSource: "contratada", documentId: "r1", companyId: "company", unitId: "unit", documentKind: "PGR", ruleId: "rule", ruleVersion: 1, documentVersion: 1, result: "atende", evaluatedAt: stamp }] };
  return f;
}
test("avaliação histórica mantém vínculo com versão do critério substituído", () => {
  const f = evaluatedFixture(), report = analyze(f);
  assert.equal(report.blockers, 0); assert.equal(report.counts.contractorEvaluations, 1); assert.equal(report.importReady, false);
});
test("avaliação não atravessa tenant, unidade, tipo ou versão do critério", () => {
  for (const patch of [{ tenantId: "other" }, { unitId: "other" }, { documentKind: "LTCAT" }, { ruleVersion: 2 }, { documentId: "unknown" }]) {
    const f = evaluatedFixture(); Object.assign(f.compliance.evaluations[0], patch);
    assert.ok(analyze(f).blockers > 0);
  }
});
test("não atribui avaliação interna ou legado de origem ausente à contratada", () => {
  const f = evaluatedFixture(); f.compliance.evaluations[0].documentSource = "consultoria";
  assert.equal(analyze(f).counts.contractorEvaluations, 0);
  delete f.compliance.evaluations[0].documentSource;
  assert.equal(analyze(f).counts.contractorEvaluations, 0);
  assert.ok(has(analyze(f), "AMBIGUOUS_LEGACY_EVALUATION_SOURCE"));
});
test("avaliação anterior ao recibo bloqueia; evidência interna ausente bloqueia sem vínculo inferido", () => {
  const f = evaluatedFixture(), evaluation = f.compliance.evaluations[0];
  evaluation.evaluatedAt = "2026-10-14T12:00:00.000Z";
  assert.ok(has(analyze(f), "EVALUATION_BEFORE_RECEIPT"));
  evaluation.evaluatedAt = stamp; evaluation.evidenceDocumentId = "private-internal-id";
  const report = analyze(f);
  assert.ok(report.blockers > 0); assert.ok(has(report, "INVALID_EVIDENCE_REFERENCE"));
  assert.equal(JSON.stringify(report).includes(evaluation.evidenceDocumentId), false);
});
test("auditoria resolve alvo conforme ação, incluindo renovação no convite", () => {
  const f = historyFixture();
  f.source.integrationApprovals = [{ id: "approval", tenantId: "tenant", invitationId: "i1", approvedAt: stamp, approvedBy: "reviewer", notes: "fictitious", fingerprint: "c".repeat(64) }];
  f.source.integrationSchedules = [{ id: "schedule", tenantId: "tenant", invitationId: "i1", approvalId: "approval", scheduledOn: "2026-10-16", createdAt: stamp, createdBy: "admin" }];
  const pairs = [["created", "i1"], ["revoked", "i1"], ["read", "i1"], ["downloaded", "i1"], ["portal_opened", "i1"], ["received", "r2"], ["issue_opened", "issue"], ["issue_reviewed", "issue"], ["issue_updated", "issue"], ["issue_updated", "i1"], ["integration_approved", "approval"], ["integration_scheduled", "schedule"]];
  f.audit = pairs.map(([action, targetId], index) => ({ id: `audit-${index}`, tenantId: "tenant", action: `thirdparty.${action}`, targetId, actorUserId: "actor", occurredAt: stamp }));
  assert.equal(analyze(f).blockers, 0);
  f.audit[0].tenantId = "other"; assert.ok(has(analyze(f), "INVALID_AUDIT_TARGET"));
  f.audit[0].tenantId = "tenant"; f.audit[0].targetId = "r1";
  assert.ok(has(analyze(f), "INVALID_AUDIT_TARGET"));
});
test("auditoria sem alvo preserva aviso; ação desconhecida não é descartada", () => {
  const f = fixture(); f.audit = [{ id: "audit", tenantId: "tenant", action: "thirdparty.read", actorUserId: "actor", occurredAt: stamp }];
  assert.ok(has(analyze(f), "LEGACY_AUDIT_TARGET_ABSENT"));
  f.audit[0].targetId = "i1"; f.audit[0].action = "thirdparty.unknown";
  assert.ok(has(analyze(f), "UNKNOWN_THIRDPARTY_AUDIT_ACTION"));
  delete f.audit[0].targetId;
  assert.ok(has(analyze(f), "UNKNOWN_THIRDPARTY_AUDIT_ACTION"));
});

function evidenceFixture() {
  const f = evaluatedFixture();
  f.compliance.evaluations[0].evidenceDocumentId = "internal-evidence";
  f.documents = [{ id: "internal-evidence", tenantId: "tenant", companyId: "different-company", unitId: "different-unit", version: 2, status: "archived", uploadedAt: "2026-10-14T12:00:00.000Z" }];
  return f;
}
test("evidência interna histórica é preservada no mesmo tenant sem exigir mesma empresa", () => {
  const f = evidenceFixture(), before = JSON.stringify(f), report = analyze(f);
  assert.equal(report.blockers, 0); assert.equal(report.counts.internalEvidenceReferences, 1);
  assert.equal(JSON.stringify(f), before); assert.equal(JSON.stringify(report).includes("internal-evidence"), false);
});
test("evidência interna não atravessa consultoria nem resolve contra recibo de terceiro", () => {
  const f = evidenceFixture(); f.documents[0].tenantId = "other";
  assert.ok(has(analyze(f), "INVALID_EVIDENCE_REFERENCE"));
  f.compliance.evaluations[0].evidenceDocumentId = "r1";
  assert.ok(has(analyze(f), "INVALID_EVIDENCE_REFERENCE"));
});
test("evidência futura ou metadados inconsistentes bloqueiam sem apagar histórico", () => {
  const f = evidenceFixture(); f.documents[0].uploadedAt = "2026-10-16T12:00:00.000Z";
  assert.ok(has(analyze(f), "EVIDENCE_AFTER_EVALUATION"));
  f.documents[0].uploadedAt = stamp; f.documents[0].version = 0;
  assert.ok(has(analyze(f), "INVALID_EVIDENCE_DOCUMENT"));
  f.documents[0].version = 1; f.documents[0].status = "unknown";
  assert.ok(has(analyze(f), "INVALID_EVIDENCE_DOCUMENT"));
});
test("documentos duplicados e coleção inválida não são tratados como evidência válida", () => {
  const f = evidenceFixture(); f.documents.push(structuredClone(f.documents[0]));
  assert.ok(has(analyze(f), "DUPLICATE_INTERNAL_DOCUMENT"));
  f.documents = {};
  assert.ok(has(analyze(f), "INVALID_COLLECTION"));
});
