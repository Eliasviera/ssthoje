import { readLocalDataText, type LocalDataFile } from "./local-data-read.ts";
// Infraestrutura da demonstração; acesso pela aplicação via operations-service server-only.
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hasTenantPermission, requireTenantAccess } from "./tenant-access.ts";
import { appendAuditEvent } from "./audit-log.ts";
import { assertModuleEnabled } from "./tenant-state.ts";
import type { ClientCompany } from "./client-store";
import type { StoredDocument } from "./document-store";
import type { ComplianceEvaluation } from "./compliance-store";
import type { InvitationSummary } from "./third-party-store";
import type { EpiDelivery } from "./epi-store";

export type OperationalCategory = "thirdparty" | "documents" | "epi";
export type OperationalSection = "terceiros" | "pendencias" | "documentos" | "epi";
export type OperationalTask = { key: string; title: string; context: string; category: OperationalCategory; section: OperationalSection; state: string; revision: string; dueOn: string; dueLabel: string; priority: "overdue" | "today" | "planned" | "undated" };
export type NotificationPreferences = { enabled: boolean; categories: OperationalCategory[]; lookaheadDays: number };
type Deadline = { id: string; tenantId: string; taskKey: string; dueOn: string; reason: string; changedAt: string; changedBy: string };
type PreferenceRecord = NotificationPreferences & { tenantId: string; userId: string; changedAt: string };
type Notice = { id: string; tenantId: string; userId: string; fingerprint: string; taskKey: string; title: string; context: string; category: OperationalCategory; section: OperationalSection; priority: OperationalTask["priority"]; createdAt: string; readAt?: string; endedAt?: string };
export type OperationalNotice = Omit<Notice, "tenantId" | "userId" | "fingerprint">;
export type OperationsOverview = { today: string; tasks: OperationalTask[]; notices: OperationalNotice[]; preferences: NotificationPreferences; deadlines: Omit<Deadline, "tenantId">[]; refreshedAt: string };
type Database = { deadlines: Deadline[]; preferences: PreferenceRecord[]; notices: Notice[] };
function load<T>(name: LocalDataFile, fallback: T): T {
  try { return JSON.parse(readLocalDataText(name)) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}
function read() { return load<Database>("operations.json", { deadlines: [], preferences: [], notices: [] }); }
function write(db: Database) {
  const path = join(process.cwd(), "data", "operations.json"); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(db, null, 2), { flag: "wx", encoding: "utf8" }); renameSync(temp, path);
}
function access(userId: string, manage = false) {
  const result = requireTenantAccess(userId, manage ? "operations.manage" : "operations.read");
  if (!result.ok) throw new Error("Painel operacional não autorizado."); return result.context;
}
const attempts = new Map<string, { startedAt: number; count: number }>();
function rate(userId: string) {
  const now = Date.now(); for (const [key, value] of attempts) if (now - value.startedAt >= 60000) attempts.delete(key);
  const value = attempts.get(userId) ?? { startedAt: now, count: 0 }; attempts.set(userId, value);
  if (++value.count > 30) throw new Error("Muitas alterações. Aguarde um minuto.");
}
function audit(userId: string, action: "operations.deadline_set" | "operations.preferences_set" | "operations.notice_created" | "operations.notice_read", targetId: string) {
  const current = access(userId); appendAuditEvent({ tenantId: current.tenant.id, actorUserId: userId, actorRole: current.membership.role, action, targetId });
}
export function operationalToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function validDay(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value; }
function priority(dueOn: string, today: string): OperationalTask["priority"] { return !dueOn ? "undated" : dueOn < today ? "overdue" : dueOn === today ? "today" : "planned"; }
function preferences(db: Database, tenantId: string, userId: string): NotificationPreferences {
  const saved = db.preferences.find(p => p.tenantId === tenantId && p.userId === userId);
  return saved ? { enabled: saved.enabled, categories: [...saved.categories], lookaheadDays: saved.lookaheadDays } : { enabled: true, categories: ["thirdparty", "documents", "epi"], lookaheadDays: 7 };
}
function tasksFor(userId: string, db: Database, today: string) {
  const current = access(userId), tenantId = current.tenant.id, role = current.membership.role;
  const companies = load<ClientCompany[]>("clients.json", []).filter(c => c.tenantId === tenantId && c.status === "active");
  const activeUnit = (companyId: string, unitId: string) => companies.some(c => c.id === companyId && c.units.some(u => u.id === unitId));
  const tasks: OperationalTask[] = [];
  const add = (task: Omit<OperationalTask, "priority">) => {
    const deadline = db.deadlines.filter(d => d.tenantId === tenantId && d.taskKey === task.key).at(-1);
    if (deadline?.dueOn && !task.dueLabel.startsWith("Prazo de correção")) { task.dueOn = deadline.dueOn; task.dueLabel = "Prazo interno definido pela equipe"; }
    // Remover um prazo interno restaura a validade cadastrada, quando houver.
    tasks.push({ ...task, priority: priority(task.dueOn, today) });
  };
  if (hasTenantPermission(role, "thirdparty.read")) {
    const invitations = load<{ invitations: (InvitationSummary & { tenantId: string })[] }>("third-party.json", { invitations: [] }).invitations;
    for (const i of invitations.filter(i => i.tenantId === tenantId && activeUnit(i.companyId, i.unitId))) {
      const context = `${i.contractorName} · ${i.companyName} · ${i.unitName}`;
      if (!i.revokedAt) for (const kind of i.requested.filter(k => !i.receipts.some(r => r.kind === k))) add({ key: `missing:${i.id}:${kind}`, title: `${kind} aguardando envio`, context, category: "thirdparty", section: "terceiros", state: "Aguardando documento", revision: "missing", dueOn: "", dueLabel: "Sem prazo interno" });
      for (const issue of (i.issues ?? []).filter(issue => issue.status !== "resolved")) add({ key: `issue:${issue.id}`, title: `${issue.kind} · ${issue.status === "awaiting_review" ? "reavaliar correção" : "correção solicitada"}`, context, category: "thirdparty", section: "pendencias", state: issue.status === "awaiting_review" ? "Aguardando reavaliação" : "Aguardando correção", revision: issue.currentReceiptId + ":" + issue.status, dueOn: issue.status === "open" ? issue.correctionPeriod?.dueOn ?? "" : "", dueLabel: issue.correctionPeriod ? "Prazo de correção · 3 dias corridos (Brasília); reenvio encerra a espera pela correção" : "Sem prazo interno" });
    }
  }
  // EPI tem envelope próprio; nenhum arquivo clínico é lido por este agregador.
  if (hasTenantPermission(role, "epi.read")) for (const d of load<{ deliveries: EpiDelivery[] }>("epi.json", { deliveries: [] }).deliveries.filter(d => d.tenantId === tenantId && d.status === "pending" && activeUnit(d.companyId, d.unitId))) add({ key: `epi:${d.id}`, title: "EPI aguardando confirmação fictícia", context: `${d.workerName} · ${d.companyName} · ${d.unitName}`, category: "epi", section: "epi", state: "Aguardando confirmação", revision: "pending", dueOn: "", dueLabel: "Sem prazo interno" });
  if (hasTenantPermission(role, "documents.read")) {
    const documents = load<StoredDocument[]>("documents.json", []).filter(d => d.tenantId === tenantId && d.status === "received" && ["PGR", "LTCAT", "Treinamento"].includes(d.kind) && activeUnit(d.companyId, d.unitId));
    for (const d of documents.filter(d => validDay(d.validUntil))) add({ key: `validity:${d.id}`, title: `${d.kind} · conferir validade informada`, context: d.title, category: "documents", section: "documentos", state: "Validade cadastrada; conferir documento", revision: String(d.version), dueOn: d.validUntil, dueLabel: "Validade informada no cadastro; não validada automaticamente" });
    if (hasTenantPermission(role, "documents.review")) {
      const evaluations = load<{ evaluations: ComplianceEvaluation[] }>("compliance.json", { evaluations: [] }).evaluations.filter(e => e.tenantId === tenantId && documents.some(d => d.id === e.documentId));
      const latest = new Map<string, ComplianceEvaluation>();
      for (const e of evaluations) { const key = `${e.documentId}:${e.ruleId}`; if (!latest.has(key) || latest.get(key)!.evaluatedAt <= e.evaluatedAt) latest.set(key, e); }
      for (const [key, e] of latest) if (e.result === "pendente" || e.result === "inconclusivo") add({ key: `evaluation:${key}`, title: `${e.documentKind} · avaliação ${e.result === "pendente" ? "pendente" : "inconclusiva"}`, context: `${e.documentTitle} · ${e.ruleTitle}`, category: "documents", section: "documentos", state: "Revisão humana necessária", revision: e.id, dueOn: "", dueLabel: "Sem prazo interno" });
    }
  }
  const rank = { overdue: 0, today: 1, planned: 2, undated: 3 };
  return tasks.sort((a, b) => rank[a.priority] - rank[b.priority] || a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}
function fingerprint(task: OperationalTask) { return createHash("sha256").update(JSON.stringify([task.key, task.revision, task.dueOn, task.priority])).digest("hex"); }
export function getOperationsOverview(userId: string): OperationsOverview {
  const current = access(userId), db = read(), today = operationalToday(), now = new Date().toISOString();
  const tasks = tasksFor(userId, db, today), pref = preferences(db, current.tenant.id, userId);
  const existing = db.notices.filter(n => n.tenantId === current.tenant.id && n.userId === userId);
  let changed = false; const createdIds: string[] = [];
  for (const n of existing.filter(n => !n.endedAt)) if (!tasks.some(t => t.key === n.taskKey && fingerprint(t) === n.fingerprint)) { n.endedAt = now; changed = true; }
  const horizon = new Date(`${today}T12:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + pref.lookaheadDays);
  for (const t of tasks) {
    if (!pref.enabled || !pref.categories.includes(t.category) || (t.dueOn && t.dueOn > horizon.toISOString().slice(0, 10))) continue;
    const key = fingerprint(t); if (existing.some(n => n.fingerprint === key && !n.endedAt)) continue;
    const notice: Notice = { id: randomUUID(), tenantId: current.tenant.id, userId, fingerprint: key, taskKey: t.key, title: t.title, context: t.context, category: t.category, section: t.section, priority: t.priority, createdAt: now };
    db.notices.push(notice); existing.push(notice); changed = true; createdIds.push(notice.id);
  }
  if (changed) write(db);
  for (const id of createdIds) audit(userId, "operations.notice_created", id);
  return { today, tasks, preferences: pref, notices: existing.slice(-100).reverse().map(n => ({ id: n.id, taskKey: n.taskKey, title: n.title, context: n.context, category: n.category, section: n.section, priority: n.priority, createdAt: n.createdAt, readAt: n.readAt, endedAt: n.endedAt })), deadlines: db.deadlines.filter(d => d.tenantId === current.tenant.id).map(d => ({ id: d.id, taskKey: d.taskKey, dueOn: d.dueOn, reason: d.reason, changedAt: d.changedAt, changedBy: d.changedBy })), refreshedAt: now };
}
export function setOperationalDeadline(userId: string, taskKey: string, dueOn: string, reason: string) {
  const current = access(userId, true); rate(userId); const db = read();
  const task = typeof taskKey === "string" ? tasksFor(userId, db, operationalToday()).find(t => t.key === taskKey) : undefined;
  if (!task) throw new Error("Tarefa ativa não encontrada nesta consultoria.");
  if (task.dueLabel.startsWith("Prazo de correção")) throw new Error("O prazo de correção é preservado na pendência. Uma nova solicitação de correção inicia outro ciclo de três dias corridos.");
  if (typeof dueOn !== "string" || (dueOn && !validDay(dueOn))) throw new Error("Informe uma data interna válida ou deixe sem prazo.");
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 600) throw new Error("Informe a justificativa interna, até 600 caracteres.");
  const entry: Deadline = { id: randomUUID(), tenantId: current.tenant.id, taskKey, dueOn, reason: reason.trim(), changedAt: new Date().toISOString(), changedBy: userId };
  db.deadlines.push(entry); write(db); audit(userId, "operations.deadline_set", entry.id);
}
export function setNotificationPreferences(userId: string, input: NotificationPreferences) {
  const current = access(userId); rate(userId);
  assertModuleEnabled(current.tenant.id, "operations");
  if (typeof input.enabled !== "boolean" || !Number.isInteger(input.lookaheadDays) || input.lookaheadDays < 0 || input.lookaheadDays > 30 || !Array.isArray(input.categories) || input.categories.some(c => !["thirdparty", "documents", "epi"].includes(c)) || new Set(input.categories).size !== input.categories.length) throw new Error("Confira as preferências de avisos locais.");
  const db = read(); db.preferences = db.preferences.filter(p => p.tenantId !== current.tenant.id || p.userId !== userId);
  db.preferences.push({ ...structuredClone(input), tenantId: current.tenant.id, userId, changedAt: new Date().toISOString() }); write(db); audit(userId, "operations.preferences_set", userId);
}
export function markOperationalNoticeRead(userId: string, id: string) {
  const current = access(userId); rate(userId); const db = read();
  const notice = db.notices.find(n => n.id === id && n.userId === userId && n.tenantId === current.tenant.id);
  if (!notice) throw new Error("Aviso indisponível para esta conta.");
  if (!notice.readAt) { notice.readAt = new Date().toISOString(); write(db); audit(userId, "operations.notice_read", id); }
}
