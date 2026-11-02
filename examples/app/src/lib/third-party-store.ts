import { evaluateIntegrationGate } from "./third-party-integration-gate.ts";
import { getThirdPartyRigorPolicy, rigorForBlocker } from "./third-party-rigor-policy.ts";
import type { ComplianceRule, ComplianceEvaluation } from "./compliance-store";
import { createCorrectionPeriod, type CorrectionPeriod } from "./correction-period.ts";
// Infraestrutura testável de demonstração local; uso pela aplicação via serviço server-only.
import { isTenantEnabled, assertModuleEnabled } from "./tenant-state.ts";
import { assertStorageCapacity } from "./storage-quota.ts";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEMO_MEMBERSHIPS, hasTenantPermission, requireTenantAccess } from "./tenant-access.ts";
import { appendAuditEvent } from "./audit-log.ts";
import type { ClientCompany } from "./client-store";
import { THIRD_PARTY_DOCUMENT_KINDS, type ThirdPartyDocumentKind } from "./third-party-policy";

export const THIRD_PARTY_KINDS = THIRD_PARTY_DOCUMENT_KINDS;
export type ThirdPartyKind = ThirdPartyDocumentKind;
export type ThirdPartyReceipt = { id: string; kind: ThirdPartyKind; fileName: string; size: number; digest: string; receivedAt: string; validUntil?: string; replacesReceiptId?: string; issueId?: string };
export type ThirdPartyIssueEvent = { id: string; type: "opened" | "assigned" | "commented" | "resent" | "reopened" | "resolved"; occurredAt: string; actorUserId: string; receiptId: string; notes: string; evidence: string; requestedChange?: string; assigneeUserId?: string; correctionPeriod?: CorrectionPeriod };
export type ThirdPartyIssue = { id: string; kind: ThirdPartyKind; originalReceiptId: string; currentReceiptId: string; reason: string; requestedChange: string; assigneeUserId: string; status: "open" | "awaiting_review" | "resolved"; revision: number; correctionPeriod?: CorrectionPeriod; events: ThirdPartyIssueEvent[] };
type StoredReceipt = ThirdPartyReceipt & { storageName: string };
type Invitation = {
  id: string; tenantId: string; companyId: string; unitId: string; companyName: string; unitName: string;
  relatedCnpj: string; contractorName: string; contractorCnpj: string; scope?: string; requested: ThirdPartyKind[];
  medicalAsoRequired?: boolean;
  tokenHash: string; createdAt: string; expiresAt: string; revokedAt?: string; receipts: StoredReceipt[]; issues?: ThirdPartyIssue[];
};
export type InvitationSummary = Omit<Invitation, "tenantId" | "tokenHash" | "receipts"> & { receipts: ThirdPartyReceipt[]; linkStatus: "active" | "expired" | "revoked" };
export type ThirdPartyDocumentSource = Pick<InvitationSummary, "companyId" | "unitId" | "companyName" | "unitName" | "relatedCnpj" | "contractorName" | "receipts">;
export type ReviewedThirdPartyDocument = { id: string; title: string; kind: ThirdPartyKind; version: number; companyId: string; unitId: string; companyName: string; unitName: string; contractorName: string };
export type PublicInvitation = Pick<InvitationSummary, "contractorName" | "contractorCnpj" | "companyName" | "unitName" | "relatedCnpj" | "scope" | "requested" | "expiresAt" | "receipts"> & { corrections: Pick<ThirdPartyIssue, "id" | "kind" | "reason" | "requestedChange" | "status" | "revision" | "correctionPeriod">[] };
type IntegrationApproval = { id: string; tenantId: string; invitationId: string; fingerprint: string; approvedBy: string; approvedAt: string; notes: string; override?: { serviceManager: string; blockers: string[] } };
type IntegrationSchedule = { id: string; tenantId: string; invitationId: string; approvalId: string; scheduledOn: string; createdBy: string; createdAt: string };
type Database = { invitations: Invitation[]; integrationApprovals?: IntegrationApproval[]; integrationSchedules?: IntegrationSchedule[] };
const attempts = new Map<string, { start: number; count: number }>();
function read(): Database {
  try { return JSON.parse(readFileSync(join(process.cwd(), "data", "third-party.json"), "utf8")) as Database; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { invitations: [] }; throw error; }
}
function write(db: Database) {
  const path = join(process.cwd(), "data", "third-party.json"); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(db, null, 2), { flag: "wx", encoding: "utf8" }); renameSync(temp, path);
}
function hash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function rate(key: string) {
  const now = Date.now(); for (const [k, entry] of attempts) if (now - entry.start >= 60000) attempts.delete(k);
  if (!attempts.has(key) && attempts.size >= 5000) throw new Error("Muitas solicitações. Aguarde um minuto.");
  const entry = attempts.get(key) ?? { start: now, count: 0 }; attempts.set(key, entry);
  if (++entry.count > 30) throw new Error("Muitas solicitações. Aguarde um minuto.");
}
function context(userId: string, manage = false) {
  const access = requireTenantAccess(userId, manage ? "thirdparty.manage" : "thirdparty.read");
  if (!access.ok) throw new Error("Acesso a terceiros não autorizado."); return access.context;
}
function currentUnit(tenantId: string, companyId: string, unitId: string) {
  if (!isTenantEnabled(tenantId)) return null;
  let companies: ClientCompany[];
  try { companies = JSON.parse(readFileSync(join(process.cwd(), "data", "clients.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const company = companies.find(c => c.tenantId === tenantId && c.id === companyId && c.status === "active");
  const unit = company?.units.find(u => u.id === unitId); return company && unit ? { company, unit } : null;
}
function summary(invite: Invitation): InvitationSummary {
  return { linkStatus: invite.revokedAt ? "revoked" : Date.parse(invite.expiresAt) <= Date.now() ? "expired" : "active", id: invite.id, companyId: invite.companyId, unitId: invite.unitId, companyName: invite.companyName, unitName: invite.unitName, relatedCnpj: invite.relatedCnpj, contractorName: invite.contractorName, contractorCnpj: invite.contractorCnpj, scope: invite.scope, requested: [...invite.requested], medicalAsoRequired: invite.medicalAsoRequired ?? false, createdAt: invite.createdAt, expiresAt: invite.expiresAt, revokedAt: invite.revokedAt, issues: structuredClone(invite.issues ?? []), receipts: invite.receipts.map(r => ({ id: r.id, kind: r.kind, fileName: r.fileName, size: r.size, digest: r.digest, receivedAt: r.receivedAt, validUntil: r.validUntil, replacesReceiptId: r.replacesReceiptId, issueId: r.issueId })) };
}
function sameScope(a: Invitation, b: Invitation) {
  const scopeA = a.scope?.trim().toLocaleLowerCase("pt-BR");
  const scopeB = b.scope?.trim().toLocaleLowerCase("pt-BR");
  return scopeA && scopeB ? scopeA === scopeB : a.id === b.id;
}
function latestReceipt(db: Database, invite: Invitation, kind: ThirdPartyKind) {
  return db.invitations
    .filter((candidate) => candidate.tenantId === invite.tenantId && candidate.companyId === invite.companyId && candidate.unitId === invite.unitId && candidate.contractorCnpj === invite.contractorCnpj && sameScope(candidate, invite))
    .flatMap((candidate) => candidate.receipts.filter((receipt) => receipt.kind === kind).map((receipt) => ({ invite: candidate, receipt })))
    .sort((a, b) => a.receipt.receivedAt.localeCompare(b.receipt.receivedAt))
    .at(-1);
}
function publicView(invite: Invitation): PublicInvitation {
  const safe = summary(invite);
  return { contractorName: safe.contractorName, contractorCnpj: safe.contractorCnpj, companyName: safe.companyName, unitName: safe.unitName, relatedCnpj: safe.relatedCnpj, scope: safe.scope, requested: safe.requested, expiresAt: safe.expiresAt, receipts: safe.receipts.map(r => ({ ...r })), corrections: (invite.issues ?? []).map(i => ({ id: i.id, kind: i.kind, reason: i.reason, requestedChange: i.requestedChange, status: i.status, revision: i.revision, correctionPeriod: i.correctionPeriod ? { ...i.correctionPeriod } : undefined })) };
}
function resolve(db: Database, token: string): Invitation {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Link indisponível. Solicite um novo convite à consultoria.");
  const digest = hash(token);
  rate(`portal:${digest}`);
  const invite = db.invitations.find(i => i.tokenHash === digest && !i.revokedAt && Date.parse(i.expiresAt) > Date.now());
  if (!invite || !currentUnit(invite.tenantId, invite.companyId, invite.unitId)) throw new Error("Link indisponível ou expirado. Solicite um novo convite à consultoria.");
  return invite;
}
function adminAudit(userId: string, invite: Invitation, action: "thirdparty.created" | "thirdparty.revoked" | "thirdparty.read" | "thirdparty.downloaded") {
  const access = context(userId);
  appendAuditEvent({ tenantId: invite.tenantId, actorUserId: userId, actorRole: access.membership.role, action, targetId: invite.id });
}
function portalAudit(invite: Invitation, action: "thirdparty.portal_opened" | "thirdparty.received", targetId = invite.id) {
  // Posse do convite não comprova a identidade de uma pessoa.
  appendAuditEvent({ tenantId: invite.tenantId, actorUserId: `invite:${invite.id}`, actorRole: "terceiro", action, targetId });
}
export function createThirdPartyInvitation(userId: string, input: { companyId: string; unitId: string; contractorName: string; contractorCnpj: string; scope?: string; requested: string[]; medicalAsoRequired?: boolean; expiresInHours: number }) {
  const access = context(userId, true); rate(`admin:${userId}`);
  const scope = currentUnit(access.tenant.id, input.companyId, input.unitId);
  if (!scope) throw new Error("Selecione uma empresa e unidade ativas desta consultoria.");
  const name = input.contractorName.trim(), cnpj = input.contractorCnpj.replace(/\D/g, "");
  if (!name || name.length > 140 || !/^\d{14}$/.test(cnpj)) throw new Error("Informe o nome fictício e um CNPJ fictício com 14 dígitos.");
  const scopeDescription = input.scope?.trim();
  if (scopeDescription !== undefined && (!scopeDescription || scopeDescription.length > 240)) throw new Error("Informe um escopo de atividade de até 240 caracteres.");
  if (![1, 24, 168].includes(input.expiresInHours)) throw new Error("Selecione a duração técnica do link.");
  if (!input.requested.length || input.requested.length > THIRD_PARTY_KINDS.length || input.requested.some(k => !THIRD_PARTY_KINDS.includes(k as ThirdPartyKind)) || new Set(input.requested).size !== input.requested.length) throw new Error("Selecione ao menos um documento não médico solicitado, sem duplicações.");
  if (input.medicalAsoRequired !== undefined && typeof input.medicalAsoRequired !== "boolean") throw new Error("Confira o requisito de ASO.");
  const token = randomBytes(32).toString("hex"), now = new Date();
  const invite: Invitation = { id: randomUUID(), tenantId: access.tenant.id, companyId: input.companyId, unitId: input.unitId, companyName: scope.company.tradeName || scope.company.legalName, unitName: scope.unit.name, relatedCnpj: scope.unit.cnpj, contractorName: name, contractorCnpj: cnpj, scope: scopeDescription, requested: input.requested as ThirdPartyKind[], medicalAsoRequired: input.medicalAsoRequired ?? false, tokenHash: hash(token), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + input.expiresInHours * 3600000).toISOString(), receipts: [] };
  const db = read(); db.invitations.push(invite); write(db); adminAudit(userId, invite, "thirdparty.created");
  return { invitation: summary(invite), link: `/envio#${token}` };
}
export function listThirdPartyInvitations(userId: string): InvitationSummary[] {
  const access = context(userId);
  return read().invitations.filter(i => i.tenantId === access.tenant.id).map(i => { adminAudit(userId, i, "thirdparty.read"); return summary(i); }).reverse();
}
export function revokeThirdPartyInvitation(userId: string, id: string) {
  const access = context(userId, true); rate(`admin:${userId}`); const db = read();
  const invite = db.invitations.find(i => i.id === id && i.tenantId === access.tenant.id);
  if (!invite || invite.revokedAt) throw new Error("Convite indisponível para revogação.");
  invite.revokedAt = new Date().toISOString(); write(db); adminAudit(userId, invite, "thirdparty.revoked");
}
export function openThirdPartyPortal(token: string): PublicInvitation {
  const invite = resolve(read(), token); portalAudit(invite, "thirdparty.portal_opened"); return publicView(invite);
}
export function receiveThirdPartyPdf(token: string, kind: string, fileName: string, bytes: Uint8Array, correction?: { issueId: string; revision: number; notes: string }, validUntil?: string): PublicInvitation {
  const db = read(), invite = resolve(db, token);
  assertModuleEnabled(invite.tenantId, "thirdparty");
  const issue = correction ? (invite.issues ?? []).find(i => i.id === correction.issueId && i.kind === kind && i.status === "open" && i.revision === correction.revision) : undefined;
  if (correction && !issue) throw new Error("Correção indisponível ou alterada. Atualize o portal.");
  const correctionNotes = correction ? text(correction.notes, "Descreva a correção realizada", 1200) : "";
  const declaredValidity = optionalDate(validUntil);
  if (!invite.requested.includes(kind as ThirdPartyKind) || (!issue && invite.receipts.some(r => r.kind === kind))) throw new Error("Categoria não solicitada ou já recebida neste convite. Para uma nova versão, gere outro convite para a mesma contratada e escopo.");
  if (!bytes.length || bytes.length > 7 * 1024 * 1024 || !fileName.toLowerCase().endsWith(".pdf") || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Selecione um PDF fictício de até 7 MB.");
  const safeName = fileName.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 140) || "documento.pdf";
  const receipt: StoredReceipt = { id: randomUUID(), kind: kind as ThirdPartyKind, fileName: safeName, storageName: `${randomUUID()}.pdf`, size: bytes.length, digest: createHash("sha256").update(bytes).digest("hex"), receivedAt: new Date().toISOString(), validUntil: declaredValidity };
  if (issue) { receipt.replacesReceiptId = issue.currentReceiptId; receipt.issueId = issue.id; }
  else {
    const previous = latestReceipt(db, invite, receipt.kind);
    if (previous) receipt.replacesReceiptId = previous.receipt.id;
  }
  const path = join(process.cwd(), "data", "third-party-files", invite.tenantId, receipt.storageName);
  assertStorageCapacity(invite.tenantId, bytes.byteLength);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes, { flag: "wx" });
  invite.receipts.push(receipt);
  if (issue) { issue.currentReceiptId = receipt.id; issue.status = "awaiting_review"; issue.revision++; issue.events.push(event("resent", `invite:${invite.id}`, receipt.id, correctionNotes, receipt.digest)); }
  write(db); portalAudit(invite, "thirdparty.received", receipt.id); return publicView(invite);
}

function text(value: string, label: string, max = 1200) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label} (até ${max} caracteres).`);
  return value.trim();
}
function optionalDate(value?: string) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Informe uma data de validade válida ou deixe o campo em branco.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Informe uma data de validade válida ou deixe o campo em branco.");
  return value;
}
function reviewer(userId: string, throttle = true) {
  const access = requireTenantAccess(userId, "documents.review");
  if (!access.ok || !hasTenantPermission(access.context.membership.role, "thirdparty.read")) throw new Error("Revisão de terceiros não autorizada.");
  assertModuleEnabled(access.context.tenant.id, "thirdparty");
  if (throttle) rate(`review:${userId}`); return access.context;
}
function assignee(tenantId: string, userId: string) {
  if (!DEMO_MEMBERSHIPS.some(m => m.tenantId === tenantId && m.userId === userId && m.status === "active" && hasTenantPermission(m.role, "documents.review") && hasTenantPermission(m.role, "thirdparty.read"))) throw new Error("Escolha um responsável autorizado desta consultoria.");
  return userId;
}
function event(type: ThirdPartyIssueEvent["type"], actorUserId: string, receiptId: string, notes: string, evidence = ""): ThirdPartyIssueEvent {
  return { id: randomUUID(), type, occurredAt: new Date().toISOString(), actorUserId, receiptId, notes, evidence };
}
function issueAudit(userId: string, tenantId: string, targetId: string, action: "thirdparty.issue_opened" | "thirdparty.issue_updated" | "thirdparty.issue_reviewed") {
  const access = context(userId); appendAuditEvent({ tenantId, actorUserId: userId, actorRole: access.membership.role, action, targetId });
}
export function openThirdPartyIssue(userId: string, input: { invitationId: string; receiptId: string; reason: string; requestedChange: string; evidence: string; assigneeUserId: string }) {
  const access = reviewer(userId), db = read();
  const invite = db.invitations.find(i => i.id === input.invitationId && i.tenantId === access.tenant.id);
  if (!invite || !currentUnit(invite.tenantId, invite.companyId, invite.unitId)) throw new Error("Solicitação indisponível nesta consultoria.");
  const receipt = invite.receipts.find(r => r.id === input.receiptId);
  const latest = receipt && latestReceipt(db, invite, receipt.kind);
  if (!receipt || latest?.receipt.id !== receipt.id) throw new Error("Somente o recebimento mais recente e atual deste escopo pode receber uma nova pendência.");
  invite.issues ??= [];
  if (invite.issues.some(i => i.kind === receipt.kind && i.status !== "resolved")) throw new Error("Já existe pendência ativa para esta categoria.");
  const issue: ThirdPartyIssue = { id: randomUUID(), kind: receipt.kind, originalReceiptId: receipt.id, currentReceiptId: receipt.id, reason: text(input.reason, "Informe o motivo", 600), requestedChange: text(input.requestedChange, "Informe a correção solicitada"), assigneeUserId: assignee(invite.tenantId, input.assigneeUserId), status: "open", revision: 1, correctionPeriod: createCorrectionPeriod(), events: [] };
  issue.events.push({ ...event("opened", userId, receipt.id, issue.reason, text(input.evidence, "Informe a evidência interna")), requestedChange: issue.requestedChange, assigneeUserId: issue.assigneeUserId, correctionPeriod: issue.correctionPeriod });
  invite.issues.push(issue); write(db); issueAudit(userId, invite.tenantId, issue.id, "thirdparty.issue_opened"); return structuredClone(issue);
}
export function updateThirdPartyIssue(userId: string, input: { invitationId: string; issueId: string; revision: number; action: "assign" | "comment" | "resolve" | "reopen"; assigneeUserId?: string; notes: string; evidence?: string; requestedChange?: string }) {
  const access = reviewer(userId), db = read();
  const invite = db.invitations.find(i => i.id === input.invitationId && i.tenantId === access.tenant.id);
  const issue = invite?.issues?.find(i => i.id === input.issueId);
  if (!invite || !issue || issue.status === "resolved" || issue.revision !== input.revision) throw new Error("Pendência indisponível ou alterada. Atualize a tela.");
  if (!["assign", "comment", "resolve", "reopen"].includes(input.action)) throw new Error("Ação inválida.");
  const notes = text(input.notes, "Informe o comentário ou justificativa");
  let type: ThirdPartyIssueEvent["type"] = "commented", evidence = "";
  if (input.action === "assign") { issue.assigneeUserId = assignee(invite.tenantId, input.assigneeUserId ?? ""); type = "assigned"; }
  if (input.action === "resolve" || input.action === "reopen") {
    if (issue.status !== "awaiting_review") throw new Error("Aguarde o reenvio antes de reavaliar.");
    if (issue.assigneeUserId !== userId) throw new Error("Somente o responsável atribuído pode reavaliar esta pendência.");
    evidence = text(input.evidence ?? "", "Informe a evidência da reavaliação");
    issue.status = input.action === "resolve" ? "resolved" : "open";
    type = input.action === "resolve" ? "resolved" : "reopened";
    // Justificativa de nova correção é pública; comentários e evidências internas permanecem restritos.
    if (input.action === "reopen") { issue.reason = text(notes, "Informe o motivo", 600); issue.requestedChange = text(input.requestedChange ?? "", "Descreva a nova correção"); issue.correctionPeriod = createCorrectionPeriod(); }
  }
  issue.revision++; issue.events.push({ ...event(type, userId, issue.currentReceiptId, notes, evidence), requestedChange: type === "reopened" ? issue.requestedChange : undefined, assigneeUserId: type === "assigned" ? issue.assigneeUserId : undefined, correctionPeriod: type === "reopened" ? issue.correctionPeriod : undefined });
  write(db); issueAudit(userId, invite.tenantId, issue.id, input.action === "resolve" || input.action === "reopen" ? "thirdparty.issue_reviewed" : "thirdparty.issue_updated"); return structuredClone(issue);
}
export function renewThirdPartyInvitation(userId: string, id: string) {
  const access = context(userId, true); rate(`admin:${userId}`); const db = read();
  const invite = db.invitations.find(i => i.id === id && i.tenantId === access.tenant.id && !i.revokedAt);
  if (!invite || !currentUnit(invite.tenantId, invite.companyId, invite.unitId)) throw new Error("Convite indisponível para renovar.");
  const token = randomBytes(32).toString("hex"); invite.tokenHash = hash(token); invite.expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
  write(db); issueAudit(userId, invite.tenantId, invite.id, "thirdparty.issue_updated"); return { link: `/envio#${token}` };
}
export function readThirdPartyPdf(userId: string, receiptId: string) {
  const access = context(userId);
  const invite = read().invitations.find(i => i.tenantId === access.tenant.id && i.receipts.some(r => r.id === receiptId));
  const receipt = invite?.receipts.find(r => r.id === receiptId);
  if (!invite || !receipt) return null;
  const bytes = readFileSync(join(process.cwd(), "data", "third-party-files", invite.tenantId, receipt.storageName));
  adminAudit(userId, invite, "thirdparty.downloaded"); return { bytes, fileName: receipt.fileName };
}
export function getThirdPartyDocumentForReview(userId: string, receiptId: string): ReviewedThirdPartyDocument | null {
  const access = reviewer(userId);
  const invite = read().invitations.find((entry) => entry.tenantId === access.tenant.id && entry.receipts.some((receipt) => receipt.id === receiptId));
  const receipt = invite?.receipts.find((entry) => entry.id === receiptId);
  const scope = invite && currentUnit(invite.tenantId, invite.companyId, invite.unitId);
  if (!invite || !receipt || !scope) return null;
  const db = read();
  const latest = latestReceipt(db, invite, receipt.kind);
  if (latest?.receipt.id !== receipt.id) throw new Error("Somente a versão atual do documento pode ser avaliada.");
  const sameKind = db.invitations
    .filter((candidate) => candidate.tenantId === invite.tenantId && candidate.companyId === invite.companyId && candidate.unitId === invite.unitId && candidate.contractorCnpj === invite.contractorCnpj && sameScope(candidate, invite))
    .flatMap((candidate) => candidate.receipts.filter((entry) => entry.kind === receipt.kind));
  return {
    id: receipt.id,
    title: `${receipt.kind} da contratada ${invite.contractorName}`,
    kind: receipt.kind,
    version: sameKind.length,
    companyId: invite.companyId,
    unitId: invite.unitId,
    companyName: scope.company.tradeName || scope.company.legalName,
    unitName: scope.unit.name,
    contractorName: invite.contractorName,
  };
}

function integrationState(userId: string, invitationId: string, db: Database, assessmentDay = createCorrectionPeriod().startedOn) {
  const access = reviewer(userId, false);
  const invite = db.invitations.find((entry) => entry.id === invitationId && entry.tenantId === access.tenant.id);
  const unit = invite && currentUnit(access.tenant.id, invite.companyId, invite.unitId);
  if (!invite || !unit) throw new Error("Escopo indisponível nesta consultoria.");
  const scoped = db.invitations.filter((entry) => entry.tenantId === access.tenant.id && entry.companyId === invite.companyId && entry.unitId === invite.unitId && entry.contractorCnpj === invite.contractorCnpj && sameScope(entry, invite));
  let compliance: { rules: ComplianceRule[]; evaluations: ComplianceEvaluation[] };
  try { compliance = JSON.parse(readFileSync(join(process.cwd(), "data", "compliance.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; compliance = { rules: [], evaluations: [] }; }
  const rules = compliance.rules.filter((rule) => rule.tenantId === access.tenant.id && scoped.some((entry) => entry.requested.includes(rule.documentKind as ThirdPartyKind)));
  const receiptIds = new Set(scoped.flatMap((entry) => entry.receipts.map((receipt) => receipt.id)));
  const evaluations = compliance.evaluations.filter((evaluation) => evaluation.tenantId === access.tenant.id && evaluation.documentSource === "contratada" && receiptIds.has(evaluation.documentId));
  const today = createCorrectionPeriod().startedOn;
  const gate = evaluateIntegrationGate(access.tenant.id, scoped.map(summary), rules, evaluations, assessmentDay, unit.company.thirdPartyRequirements ?? []);
  const rigorPolicy = getThirdPartyRigorPolicy(access.tenant.id, invite.companyId, invite.unitId);
  const hardBlockers = gate.blockers.filter((blocker) => rigorForBlocker(rigorPolicy, blocker) === "block");
  // Conservative snapshot: any change to scope documents, criteria, evaluations or issues requires new approval.
  const fingerprint = createHash("sha256").update(JSON.stringify({ scoped: scoped.map((entry) => ({ id: entry.id, companyId: entry.companyId, unitId: entry.unitId, contractorCnpj: entry.contractorCnpj, scope: entry.scope, requested: entry.requested, medicalAsoRequired: entry.medicalAsoRequired, revokedAt: entry.revokedAt, receipts: entry.receipts, issues: entry.issues })), rules, evaluations, requirements: unit.company.thirdPartyRequirements ?? [], rigorPolicy })).digest("hex");
  const scopeIds = new Set(scoped.map((entry) => entry.id));
  const approvals = (db.integrationApprovals ?? []).filter((approval) => approval.tenantId === access.tenant.id && scopeIds.has(approval.invitationId));
  const approval = approvals.at(-1);
  const approved = Boolean(approval?.fingerprint === fingerprint && gate.ready && !approval.override);
  const schedules = (db.integrationSchedules ?? []).filter((schedule) => schedule.tenantId === access.tenant.id && scopeIds.has(schedule.invitationId)).map((schedule) => ({ ...schedule, current: Boolean(approved && schedule.approvalId === approval?.id) }));
  return { access, invite, fingerprint, blockers: gate.blockers, hardBlockers, rigorPolicy, ready: gate.ready, approved: Boolean(approved), approval, approvals, schedules, today };
}

export function getThirdPartyIntegrationState(userId: string, invitationId: string) {
  const state = integrationState(userId, invitationId, read());
  return { fingerprint: state.fingerprint, blockers: state.blockers, hardBlockers: state.hardBlockers, rigorPolicy: state.rigorPolicy, ready: state.ready, approved: state.approved, approval: state.approval, approvals: structuredClone(state.approvals), schedules: structuredClone(state.schedules) };
}

export function approveThirdPartyIntegration(userId: string, input: { invitationId: string; expectedFingerprint: string; notes: string; serviceManager?: string; allowPendingOverride?: boolean }) {
  rate(`review:${userId}`);
  const db = read(), state = integrationState(userId, input.invitationId, db);
  if (input.expectedFingerprint !== state.fingerprint) throw new Error("Documentos ou avaliações foram alterados. Atualize a página antes de aprovar.");
  if (input.allowPendingOverride) throw new Error("A liberação com pendências depende de um decisor do cliente previamente cadastrado e autorizado. A consultoria não pode registrar essa decisão em nome do cliente.");
  if (!state.ready) throw new Error("Aprovação bloqueada. Resolva os requisitos apresentados para este escopo ou aguarde o cadastro do decisor autorizado do cliente.");
  if (state.approved) throw new Error("Este conjunto já tem aprovação registrada.");
  const approval: IntegrationApproval = { id: randomUUID(), tenantId: state.access.tenant.id, invitationId: state.invite.id, fingerprint: state.fingerprint, approvedBy: userId, approvedAt: new Date().toISOString(), notes: text(input.notes, "Registre a justificativa da decisão humana") };
  db.integrationApprovals ??= []; db.integrationApprovals.push(approval); write(db);
  appendAuditEvent({ tenantId: approval.tenantId, actorUserId: userId, actorRole: state.access.membership.role, action: "thirdparty.integration_approved", targetId: approval.id });
  return structuredClone(approval);
}

export function scheduleThirdPartyIntegration(userId: string, input: { invitationId: string; approvalId: string; scheduledOn: string }) {
  context(userId, true); rate(`review:${userId}`);
  const db = read(), state = integrationState(userId, input.invitationId, db);
  if (!state.approved || state.approval?.id !== input.approvalId) throw new Error("Agendamento bloqueado: aprovação atual do escopo é obrigatória.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledOn) || !Number.isFinite(Date.parse(`${input.scheduledOn}T12:00:00Z`)) || new Date(`${input.scheduledOn}T12:00:00Z`).toISOString().slice(0, 10) !== input.scheduledOn || input.scheduledOn < state.today) throw new Error("Selecione uma data válida de hoje ou futura, em Brasília.");
  if (!integrationState(userId, input.invitationId, db, input.scheduledOn).ready) throw new Error("Os critérios vigentes na data escolhida exigem nova conferência. Escolha outra data ou atualize as avaliações.");
  if (state.schedules.some((schedule) => schedule.current)) throw new Error("Já existe agendamento para esta aprovação.");
  const schedule: IntegrationSchedule = { id: randomUUID(), tenantId: state.access.tenant.id, invitationId: state.invite.id, approvalId: state.approval.id, scheduledOn: input.scheduledOn, createdBy: userId, createdAt: new Date().toISOString() };
  db.integrationSchedules ??= []; db.integrationSchedules.push(schedule); write(db);
  appendAuditEvent({ tenantId: schedule.tenantId, actorUserId: userId, actorRole: state.access.membership.role, action: "thirdparty.integration_scheduled", targetId: schedule.id });
  return structuredClone(schedule);
}
