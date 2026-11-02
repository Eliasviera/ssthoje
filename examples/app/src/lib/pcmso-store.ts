// Infraestrutura local de demonstração. Importada pela aplicação apenas no servidor.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendAuditEvent } from "./audit-log.ts";
import { DEMO_MEMBERSHIPS, requireTenantAccess } from "./tenant-access.ts";

export type PcmsoScope = { companyId: string; unitId: string; companyName: string; unitName: string };
export type PcmsoStatus = "draft" | "in_review" | "reviewed";
export type PcmsoRevision = { version: number; content: string; savedAt: string; actorUserId: string };
export type PcmsoRecord = PcmsoScope & {
  id: string; tenantId: string; coordinatorId: string; status: PcmsoStatus; version: number;
  content: string; revisions: PcmsoRevision[]; createdAt: string; updatedAt: string;
  history: { action: string; actorUserId: string; occurredAt: string }[];
  pgrRiskLink?: { inventoryId: string; inventoryRevision: number; version: number; status: "pending" | "reviewed"; riskItemIds: string[] };
};
export type PcmsoSummary = Omit<PcmsoRecord, "tenantId" | "content" | "revisions" | "history">;
type Database = { records: PcmsoRecord[] };

function read(): Database {
  try { return JSON.parse(readFileSync(join(process.cwd(), "data", "pcmso.json"), "utf8")) as Database; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [] }; throw error; }
}
function write(db: Database) {
  const path = join(process.cwd(), "data", "pcmso.json");
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(db, null, 2), { flag: "wx", encoding: "utf8" });
  renameSync(temp, path);
}
function context(userId: string, permission: "pcmso.assign" | "pcmso.manage" | "pcmso.status.read") {
  const access = requireTenantAccess(userId, permission);
  if (!access.ok) throw new Error("Acesso ao PCMSO não autorizado.");
  return access.context;
}
function audit(userId: string, record: PcmsoRecord, action: "pcmso.read" | "pcmso.status_read" | "pcmso.assigned" | "pcmso.saved" | "pcmso.submitted" | "pcmso.reviewed") {
  const access = requireTenantAccess(userId, "tenant.dashboard.read");
  if (!access.ok || access.context.tenant.id !== record.tenantId) throw new Error("Acesso não autorizado.");
  appendAuditEvent({ tenantId: record.tenantId, actorUserId: userId, actorRole: access.context.membership.role, action, targetId: record.id });
}
function summary(record: PcmsoRecord): PcmsoSummary {
  // Lista explícita: conteúdo e histórico nunca são serializados para administradora/SST.
  return { id: record.id, companyId: record.companyId, unitId: record.unitId, companyName: record.companyName, unitName: record.unitName, coordinatorId: record.coordinatorId, status: record.status, version: record.version, createdAt: record.createdAt, updatedAt: record.updatedAt };
}
export function listPcmsoSummaries(userId: string): PcmsoSummary[] {
  const access = context(userId, "pcmso.status.read");
  return read().records.filter(r => r.tenantId === access.tenant.id).map(r => { audit(userId, r, "pcmso.status_read"); return summary(r); });
}
export function listAssignedPcmso(userId: string): PcmsoRecord[] {
  const access = context(userId, "pcmso.manage");
  return read().records.filter(r => r.tenantId === access.tenant.id && r.coordinatorId === userId).map(r => { audit(userId, r, "pcmso.read"); return structuredClone(r); });
}
// Projeção usada para autorizar o M10; não lê/transmite o conteúdo do PCMSO.
export function listMedicalUnitScopes(userId: string): PcmsoScope[] {
  const access = context(userId, "pcmso.manage");
  return read().records.filter(r => r.tenantId === access.tenant.id && r.coordinatorId === userId)
    .map(r => ({ companyId: r.companyId, unitId: r.unitId, companyName: r.companyName, unitName: r.unitName }));
}
export function assignPcmso(userId: string, scope: PcmsoScope, coordinatorId: string): PcmsoSummary {
  const access = context(userId, "pcmso.assign");
  const coordinator = DEMO_MEMBERSHIPS.find(m => m.userId === coordinatorId && m.tenantId === access.tenant.id && m.status === "active" && m.role === "medico_coordenador");
  if (!coordinator) throw new Error("Selecione um coordenador médico desta consultoria.");
  const db = read();
  const now = new Date().toISOString();
  let record = db.records.find(r => r.tenantId === access.tenant.id && r.companyId === scope.companyId && r.unitId === scope.unitId);
  if (record) {
    record.coordinatorId = coordinatorId;
    record.updatedAt = now;
    record.history.push({ action: "assigned", actorUserId: userId, occurredAt: now });
  } else {
    record = { ...scope, id: randomUUID(), tenantId: access.tenant.id, coordinatorId, status: "draft", version: 0, content: "", revisions: [], createdAt: now, updatedAt: now, history: [{ action: "assigned", actorUserId: userId, occurredAt: now }] };
    db.records.push(record);
  }
  audit(userId, record, "pcmso.assigned"); write(db); return summary(record);
}
export function changePcmso(userId: string, id: string, expectedVersion: number, operation: "save" | "submit" | "review", content?: string): void {
  const access = context(userId, "pcmso.manage");
  const db = read();
  const record = db.records.find(r => r.id === id && r.tenantId === access.tenant.id && r.coordinatorId === userId);
  if (!record) throw new Error("PCMSO indisponível para este coordenador.");
  if (record.version !== expectedVersion) throw new Error("O documento mudou. Atualize a página antes de tentar novamente.");
  const now = new Date().toISOString();
  if (operation === "save") {
    if (record.status !== "draft") throw new Error("Somente rascunhos podem ser editados.");
    if (typeof content !== "string" || !content.trim() || content.length > 12000) throw new Error("Informe conteúdo fictício entre 1 e 12.000 caracteres.");
    record.content = content.trim(); record.version++;
    record.revisions.push({ version: record.version, content: record.content, savedAt: now, actorUserId: userId });
  } else if (operation === "submit") {
    if (record.status !== "draft" || record.version < 1) throw new Error("Salve um rascunho antes de enviar para revisão.");
    record.status = "in_review";
  } else if (operation === "review") {
    if (record.status !== "in_review") throw new Error("Envie o documento para revisão primeiro.");
    record.status = "reviewed";
  } else { throw new Error("Operação inválida."); }
  record.updatedAt = now;
  record.history.push({ action: operation, actorUserId: userId, occurredAt: now });
  audit(userId, record, operation === "save" ? "pcmso.saved" : operation === "submit" ? "pcmso.submitted" : "pcmso.reviewed");
  write(db);
}
