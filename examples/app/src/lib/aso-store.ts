import { readLocalDataText, type LocalDataFile } from "./local-data-read.ts";
// Persistência local de fixtures; a aplicação importa este módulo via aso-service (server-only).
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requireTenantAccess } from "./tenant-access.ts";
import { appendAuditEvent } from "./audit-log.ts";
import { listMedicalUnitScopes } from "./pcmso-store.ts";
import type { ClientCompany } from "./client-store";
import type { WorkerRecord } from "./worker-store";

export type AsoFitness = "unrecorded" | "fit" | "unfit";
export type AsoStatus = "draft" | "in_review" | "reviewed";
export type AsoContent = { appointmentDate: string; nextExamDueOn?: string; reference: string; exams: { name: string; date: string }[]; fitness: AsoFitness };
export type AsoWorker = { workerId: string; companyId: string; unitId: string; workerName: string; jobTitle: string; companyName: string; unitName: string };
export type AsoSummary = AsoWorker & { id: string; status: AsoStatus; version: number; updatedAt: string };
type AsoAuditSignal = AsoWorker & { dueOn: string | null; status: "missing_due_date" | "renewal_in_review" | "overdue" };
export type AsoRecord = AsoSummary & {
  tenantId: string; content: AsoContent; createdAt: string;
  revisions: { version: number; content: AsoContent; actorUserId: string; savedAt: string }[];
  history: { action: "save" | "submit" | "review"; actorUserId: string; occurredAt: string }[];
};
type Database = { records: AsoRecord[] };
export type MedicalScopeReader = (userId: string) => Pick<AsoWorker, "companyId" | "unitId">[] | Promise<Pick<AsoWorker, "companyId" | "unitId">[]>;
type AsoAuditAction = "aso.read" | "aso.status_read" | "aso.workers_read" | "aso.saved" | "aso.submitted" | "aso.reviewed";
const attempts = new Map<string, { count: number; start: number }>();

function read<T>(file: LocalDataFile, empty: T): T {
  try { return JSON.parse(readLocalDataText(file)) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty; throw error; }
}
function write(db: Database) {
  const path = join(process.cwd(), "data", "aso.json");
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(db, null, 2), { flag: "wx", encoding: "utf8" });
  renameSync(temp, path);
}
function context(userId: string, permission: "aso.manage" | "aso.status.read") {
  const access = requireTenantAccess(userId, permission);
  if (!access.ok) throw new Error("Acesso ao ASO não autorizado.");
  return access.context;
}
function checkRate(userId: string) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (now - entry.start >= 60000) attempts.delete(key);
  const entry = attempts.get(userId) ?? { count: 0, start: now };
  if (++entry.count > 30) throw new Error("Muitas alterações. Aguarde um minuto e tente novamente.");
  attempts.set(userId, entry);
}
function audit(userId: string, targetId: string, action: AsoAuditAction, medical = true) {
  const access = context(userId, medical ? "aso.manage" : "aso.status.read");
  appendAuditEvent({ tenantId: access.tenant.id, actorUserId: userId, actorRole: access.membership.role, targetId, action });
}
function workerScope(tenantId: string, workerId: string, activeOnly: boolean): AsoWorker | null {
  const worker = read<WorkerRecord[]>("workers.json", []).find(w => w.tenantId === tenantId && w.id === workerId && (!activeOnly || w.status === "active"));
  const company = worker && read<ClientCompany[]>("clients.json", []).find(c => c.tenantId === tenantId && c.id === worker.companyId && (!activeOnly || c.status === "active"));
  const unit = company?.units.find(u => u.id === worker?.unitId);
  if (!worker || !company || !unit) return null;
  return { workerId: worker.id, companyId: company.id, unitId: unit.id, workerName: worker.displayName, jobTitle: worker.jobTitle, companyName: company.tradeName || company.legalName, unitName: unit.name };
}
function sameScope(a: AsoWorker, b: Pick<AsoWorker, "companyId" | "unitId">) { return a.companyId === b.companyId && a.unitId === b.unitId; }
async function authorizedWorker(userId: string, workerId: string, activeOnly: boolean, scopesFor: MedicalScopeReader): Promise<AsoWorker> {
  const access = context(userId, "aso.manage");
  const scopes = await scopesFor(userId);
  const worker = workerScope(access.tenant.id, workerId, activeOnly);
  if (!worker || !scopes.some(scope => sameScope(worker, scope))) throw new Error("Trabalhador indisponível para este coordenador. Confira o vínculo da unidade e o cadastro ativo.");
  return worker;
}
function summary(record: AsoRecord): AsoSummary {
  return { id: record.id, workerId: record.workerId, companyId: record.companyId, unitId: record.unitId, workerName: record.workerName, jobTitle: record.jobTitle, companyName: record.companyName, unitName: record.unitName, status: record.status, version: record.version, updatedAt: record.updatedAt };
}
export async function listAsoWorkers(userId: string, scopesFor: MedicalScopeReader = listMedicalUnitScopes): Promise<AsoWorker[]> {
  const access = context(userId, "aso.manage");
  const scopes = await scopesFor(userId);
  return read<WorkerRecord[]>("workers.json", []).filter(w => w.tenantId === access.tenant.id)
    .map(w => workerScope(access.tenant.id, w.id, true)).filter((w): w is AsoWorker => Boolean(w && scopes.some(s => sameScope(w, s))))
    .map(w => { audit(userId, w.workerId, "aso.workers_read"); return w; });
}
export async function listMedicalAsos(userId: string, scopesFor: MedicalScopeReader = listMedicalUnitScopes): Promise<AsoRecord[]> {
  const access = context(userId, "aso.manage");
  const scopes = await scopesFor(userId);
  return read<Database>("aso.json", { records: [] }).records.filter(r => {
    if (r.tenantId !== access.tenant.id) return false;
    const worker = workerScope(access.tenant.id, r.workerId, false);
    return worker && sameScope(worker, r) && scopes.some(s => sameScope(worker, s));
  }).map(r => { audit(userId, r.id, "aso.read"); return structuredClone(r); });
}
export function listAsoSummaries(userId: string): AsoSummary[] {
  const access = context(userId, "aso.status.read");
  return read<Database>("aso.json", { records: [] }).records.filter(r => {
    if (r.tenantId !== access.tenant.id) return false;
    const worker = workerScope(access.tenant.id, r.workerId, false);
    return worker && sameScope(worker, r);
  }).map(r => { audit(userId, r.id, "aso.status_read", false); return summary(r); });
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function listAsoAuditSignals(userId: string, now = new Date()) {
  const { tenant } = context(userId, "aso.status.read");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const byWorker = new Map<string, AsoRecord[]>();
  for (const record of read<Database>("aso.json", { records: [] }).records) {
    if (record.tenantId !== tenant.id) continue;
    const records = byWorker.get(record.workerId) ?? [];
    records.push(record);
    byWorker.set(record.workerId, records);
  }
  return Array.from(byWorker).flatMap<AsoAuditSignal>(([workerId, records]) => {
    const worker = workerScope(tenant.id, workerId, true);
    if (!worker) return [];
    const scoped = records.filter(record => sameScope(worker, record) && record.status !== "draft");
    scoped.sort((a, b) => b.content.appointmentDate.localeCompare(a.content.appointmentDate) || b.createdAt.localeCompare(a.createdAt));
    const latest = scoped[0];
    if (!latest) return [];
    const reviewed = scoped.find(record => record.status === "reviewed");
    const current = reviewed ?? latest;
    const dueOn = current.content.nextExamDueOn;
    if (!validDate(dueOn)) {
      audit(userId, current.id, "aso.status_read", false);
      return [{ ...worker, dueOn: null, status: "missing_due_date" as const }];
    }
    if (dueOn >= today) return [];
    audit(userId, current.id, "aso.status_read", false);
    const status = latest.status === "in_review" && latest.id !== current.id
      && validDate(latest.content.nextExamDueOn) && latest.content.nextExamDueOn >= today
      ? "renewal_in_review" as const : "overdue" as const;
    return [{ ...worker, dueOn, status }];
  });
}
function validate(input: AsoContent): AsoContent {
  if (!input || !validDate(input.appointmentDate) || typeof input.reference !== "string" || !input.reference.trim() || input.reference.length > 100) throw new Error("Preencha a data válida do atendimento e uma referência fictícia de até 100 caracteres.");
  if (!["unrecorded", "fit", "unfit"].includes(input.fitness)) throw new Error("Selecione uma opção de aptidão válida.");
  if (!Array.isArray(input.exams) || input.exams.length > 10) throw new Error("Informe no máximo dez exames fictícios neste registro.");
  const exams = input.exams.map(e => {
    if (!e || typeof e.name !== "string" || !e.name.trim() || e.name.length > 120 || !validDate(e.date)) throw new Error("Cada exame informado precisa de nome e data válidos; não inclua resultados clínicos.");
    return { name: e.name.trim(), date: e.date };
  });
  const dueOn = input.nextExamDueOn;
  if (dueOn !== undefined && (!validDate(dueOn) || dueOn < input.appointmentDate)) {
    throw new Error("Informe um prazo válido para o próximo exame, na data do atendimento ou depois.");
  }
  return { appointmentDate: input.appointmentDate, ...(dueOn ? { nextExamDueOn: dueOn } : {}), reference: input.reference.trim(), fitness: input.fitness, exams };
}
export async function saveAso(userId: string, workerId: string, expectedVersion: number, input: AsoContent, id?: string, scopesFor: MedicalScopeReader = listMedicalUnitScopes): Promise<string> {
  const access = context(userId, "aso.manage"); checkRate(userId);
  const scope = await authorizedWorker(userId, workerId, true, scopesFor);
  const content = validate(input);
  const db = read<Database>("aso.json", { records: [] });
  let record = id ? db.records.find(r => r.id === id && r.tenantId === access.tenant.id && r.workerId === workerId && sameScope(scope, r)) : undefined;
  if ((id && !record) || (record && (record.status !== "draft" || record.version !== expectedVersion)) || (!id && expectedVersion !== 0)) throw new Error("ASO indisponível para edição ou versão alterada. Atualize a página.");
  const now = new Date().toISOString();
  if (!record) {
    record = { ...scope, id: randomUUID(), tenantId: access.tenant.id, content, status: "draft", version: 0, createdAt: now, updatedAt: now, revisions: [], history: [] };
    db.records.push(record);
  }
  record.content = content; record.version++; record.updatedAt = now;
  record.revisions.push({ version: record.version, content: structuredClone(content), actorUserId: userId, savedAt: now });
  record.history.push({ action: "save", actorUserId: userId, occurredAt: now });
  write(db); audit(userId, record.id, "aso.saved"); return record.id;
}
export async function transitionAso(userId: string, id: string, expectedVersion: number, operation: "submit" | "review", scopesFor: MedicalScopeReader = listMedicalUnitScopes) {
  const access = context(userId, "aso.manage"); checkRate(userId);
  const initial = read<Database>("aso.json", { records: [] }).records.find(r => r.id === id && r.tenantId === access.tenant.id);
  if (!initial) throw new Error("ASO indisponível para este coordenador.");
  const worker = await authorizedWorker(userId, initial.workerId, true, scopesFor);
  const db = read<Database>("aso.json", { records: [] });
  const record = db.records.find(r => r.id === id && r.tenantId === access.tenant.id && r.workerId === initial.workerId);
  if (!record) throw new Error("ASO indisponível para este coordenador.");
  if (!sameScope(worker, record) || record.version !== expectedVersion) throw new Error("Vínculo ou versão alterados. Atualize a página.");
  if (operation === "submit") {
    if (record.status !== "draft" || record.content.fitness === "unrecorded") throw new Error("Informe e salve a aptidão fictícia antes de enviar o rascunho.");
    record.status = "in_review";
  } else if (operation === "review") {
    if (record.status !== "in_review") throw new Error("Envie o ASO para revisão antes de registrá-la.");
    record.status = "reviewed";
  } else throw new Error("Operação inválida.");
  const now = new Date().toISOString(); record.updatedAt = now;
  record.history.push({ action: operation, actorUserId: userId, occurredAt: now });
  write(db); audit(userId, record.id, operation === "submit" ? "aso.submitted" : "aso.reviewed");
}
