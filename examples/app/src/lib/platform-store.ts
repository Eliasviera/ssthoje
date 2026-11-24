import { readLocalDataText, type LocalDataFile } from "./local-data-read.ts";
import { randomUUID } from "node:crypto";


import { listRuntimeTenants, listRuntimeMemberships } from "./tenant-access.ts";
import { isPlatformMaster } from "./platform-identity.ts";
import { getTenantSettings, readPlatformState, writePlatformState, type TenantSettings } from "./tenant-state.ts";
import { appendAuditEvent, listAuditEventsForTenant } from "./audit-log.ts";
import { DEFAULT_PLAN, PLANS, OPTIONAL_MODULES, planTotals, type PlanConfig } from "./plan-catalog.ts";
import { tenantStorageBytes, MB } from "./storage-quota.ts";

const attempts = new Map<string, { at: number; count: number }>();
export function requirePlatformMaster(userId: string) {
  if (!isPlatformMaster(userId)) {
    appendAuditEvent({ tenantId: "platform", actorUserId: userId || "anonymous", actorRole: listRuntimeMemberships().find(m => m.userId === userId)?.role ?? "terceiro", action: "platform.access_denied" });
    throw new Error("Acesso exclusivo ao SaaS Master.");
  }
}
export function throttle(userId: string) {
  const key = `${process.cwd()}:${userId}`, now = Date.now(), old = attempts.get(key);
  const next = old && now - old.at < 60000 ? { ...old, count: old.count + 1 } : { at: now, count: 1 };
  attempts.set(key, next); if (next.count > 20) throw new Error("Muitas ações administrativas. Aguarde um minuto.");
}
function target(id: string) { const tenant = listRuntimeTenants().find(t => t.id === id); if (!tenant) throw new Error("Consultoria indisponível."); return tenant; }
function reason(value: string) { if (typeof value !== "string" || !value.trim() || value.length > 600) throw new Error("Informe uma justificativa de até 600 caracteres, sem dados pessoais."); return value.trim(); }
function audit(userId: string, action: "platform.overview_read" | "platform.settings_changed" | "platform.support_diagnosed", targetId?: string) {
  appendAuditEvent({ tenantId: "platform", actorUserId: userId, actorRole: "saas_master", action, targetId });
}
type Usage = { companies: number; workers: number; members: number };
function records(name: LocalDataFile): { tenantId: string; status: string }[] {
  try { const value: unknown = JSON.parse(readLocalDataText(name)); if (!Array.isArray(value)) throw new Error("Cadastro local indisponível."); return value; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
function usage(tenantId: string): Usage {
  return { companies: records("clients.json").filter(r => r.tenantId === tenantId && r.status === "active").length, workers: records("workers.json").filter(r => r.tenantId === tenantId && r.status === "active").length, members: listRuntimeMemberships().filter(m => m.tenantId === tenantId && m.status === "active").length };
}
export function getPlatformOverview(userId: string) {
  requirePlatformMaster(userId); audit(userId, "platform.overview_read");
  const db = readPlatformState();
  return { tenants: listRuntimeTenants().map(t => ({ id: t.id, name: t.name, ...getTenantSettings(t.id), usage: usage(t.id), storageBytes: tenantStorageBytes(t.id), planAccount: db.plans?.[t.id] ?? structuredClone(DEFAULT_PLAN) })), planEvents: (db.planEvents ?? []).slice(-100).reverse(), changes: db.changes.slice(-100).reverse(), supportChecks: (db.supportChecks ?? []).slice(-100).reverse(), events: listAuditEventsForTenant("platform") };
}
export function managePlan(userId: string, tenantId: string, input: { operation: "configure"; config: PlanConfig } | { operation: "consume"; storageMB: number; credits: number }, justification: string, revision: number) {
  requirePlatformMaster(userId); throttle(userId); target(tenantId); const why = reason(justification);
  const db = readPlatformState(), before = db.plans?.[tenantId] ?? structuredClone(DEFAULT_PLAN);
  if (revision !== before.revision) throw new Error("A configuração mudou. Atualize a página antes de registrar.");
  const after = structuredClone(before);
  if (input.operation === "configure") {
    const c = input.config;
    if (!c || !Object.hasOwn(PLANS, c.plan) || !["monthly", "annual"].includes(c.cycle) || [c.extraCompanies, c.extraWorkers, c.extraStorageMB, c.extraCredits].some(v => !Number.isSafeInteger(v) || v < 0 || v > 9000)) throw new Error("Confira o plano, ciclo e adicionais inteiros entre 0 e 9.000.");
    if (c.disabledModules !== undefined && (!Array.isArray(c.disabledModules) || c.disabledModules.length > 3 || new Set(c.disabledModules).size !== c.disabledModules.length || c.disabledModules.some(m => !Object.hasOwn(OPTIONAL_MODULES, m)))) throw new Error("Confira os módulos selecionados.");
    if (c.trainingAddonActive !== undefined && typeof c.trainingAddonActive !== "boolean") throw new Error("Confira o status do adicional de treinamentos.");
    after.config = { plan: c.plan, cycle: c.cycle, extraCompanies: c.extraCompanies, extraWorkers: c.extraWorkers, extraStorageMB: c.extraStorageMB, extraCredits: c.extraCredits, ...(c.disabledModules !== undefined ? { disabledModules: [...c.disabledModules].sort() } : {}), ...(c.trainingAddonActive !== undefined ? { trainingAddonActive: c.trainingAddonActive } : before.config.trainingAddonActive !== undefined ? { trainingAddonActive: before.config.trainingAddonActive } : {}) };
    const totals = planTotals(after.config), current = usage(tenantId);
    if (totals.companies < current.companies || totals.workers < current.workers || totals.storageMB * MB < before.storageUsedMB * MB + tenantStorageBytes(tenantId) || totals.credits < before.creditsUsed) throw new Error("O plano não pode ficar abaixo do uso atual. Histórico e dados preservados.");
    if (JSON.stringify(after.config) === JSON.stringify(before.config)) throw new Error("Nenhuma alteração informada.");
    const settings = getTenantSettings(tenantId);
    const next = { ...settings, companiesLimit: totals.companies, workersLimit: totals.workers };
    db.settings[tenantId] = next;
    db.changes.push({ id: randomUUID(), tenantId, actorUserId: userId, occurredAt: new Date().toISOString(), reason: why, before: settings, after: next });
  } else if (input.operation === "consume") {
    if (getTenantSettings(tenantId).status !== "active") throw new Error("Consultoria suspensa. Reative antes de simular consumo.");
    if ([input.storageMB, input.credits].some(v => !Number.isSafeInteger(v) || v < 0 || v > 100000) || input.storageMB + input.credits === 0) throw new Error("Informe consumo inteiro positivo em pelo menos um recurso.");
    after.storageUsedMB += input.storageMB; after.creditsUsed += input.credits;
    const totals = planTotals(after.config);
    if (after.storageUsedMB * MB + tenantStorageBytes(tenantId) > totals.storageMB * MB || after.creditsUsed > totals.credits) throw new Error("Saldo insuficiente. Nenhum consumo foi registrado.");
  } else throw new Error("Ação inválida.");
  after.revision++;
  db.plans ??= {}; db.plans[tenantId] = after; db.planEvents ??= [];
  const event = { id: randomUUID(), tenantId, actorUserId: userId, occurredAt: new Date().toISOString(), reason: why, before, after };
  db.planEvents.push(event); writePlatformState(db);
  audit(userId, "platform.settings_changed", event.id);
}
export type PlatformOverview = ReturnType<typeof getPlatformOverview>;
export function changeTenantSettings(userId: string, tenantId: string, input: TenantSettings, justification: string, expected: string) {
  requirePlatformMaster(userId); throttle(userId); target(tenantId); const why = reason(justification);
  if (!input || !["active", "suspended"].includes(input.status) || !Number.isInteger(input.companiesLimit) || input.companiesLimit < 1 || input.companiesLimit > 10000 || !Number.isInteger(input.workersLimit) || input.workersLimit < 1 || input.workersLimit > 100000) throw new Error("Confira o estado e os limites inteiros: empresas de 1 a 10.000; trabalhadores de 1 a 100.000.");
  const current = usage(tenantId);
  if (input.companiesLimit < current.companies || input.workersLimit < current.workers) throw new Error("O limite não pode ficar abaixo do uso ativo. Nenhum cadastro foi alterado.");
  const before = getTenantSettings(tenantId);
  if (expected !== JSON.stringify(before)) throw new Error("A configuração mudou desde que você abriu a tela. Atualize a página e revise os valores antes de salvar.");
  if (before.status === input.status && before.companiesLimit === input.companiesLimit && before.workersLimit === input.workersLimit) throw new Error("Nenhuma alteração informada.");
  const db = readPlatformState(), after: TenantSettings = { status: input.status, companiesLimit: input.companiesLimit, workersLimit: input.workersLimit };
  const change = { id: randomUUID(), tenantId, actorUserId: userId, occurredAt: new Date().toISOString(), reason: why, before, after };
  db.settings[tenantId] = after; db.changes.push(change); writePlatformState(db);
  audit(userId, "platform.settings_changed", change.id);
}
export function diagnoseTenant(userId: string, tenantId: string, justification: string) {
  requirePlatformMaster(userId); throttle(userId); const tenant = target(tenantId); const why = reason(justification);
  // Projeção fechada: nenhum documento, nome de cliente/trabalhador, saúde, token ou auditoria do tenant.
  const diagnosis = { tenantName: tenant.name, ...getTenantSettings(tenantId), usage: usage(tenantId), checkedAt: new Date().toISOString() };
  const db = readPlatformState(); db.supportChecks ??= [];
  const check = { id: randomUUID(), tenantId, actorUserId: userId, occurredAt: diagnosis.checkedAt, reason: why };
  db.supportChecks.push(check); writePlatformState(db);
  audit(userId, "platform.support_diagnosed", check.id); return diagnosis;
}
