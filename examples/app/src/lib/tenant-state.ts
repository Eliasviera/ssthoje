import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlanAccount, PlanEvent } from "./plan-catalog.ts";
import type { OptionalModule } from "./plan-catalog.ts";
import { isTrialActive, readRegisteredTrialAccounts } from "./trial-registry.ts";

export type TenantSettings = { status: "active" | "suspended"; companiesLimit: number; workersLimit: number };
export type PlatformChange = { id: string; tenantId: string; actorUserId: string; occurredAt: string; reason: string; before: TenantSettings; after: TenantSettings };
export type SupportCheck = { id: string; tenantId: string; actorUserId: string; occurredAt: string; reason: string };
type PlatformDB = { settings: Record<string, TenantSettings>; changes: PlatformChange[]; supportChecks?: SupportCheck[]; plans?: Record<string, PlanAccount>; planEvents?: PlanEvent[] };
export const DEFAULT_TENANT_SETTINGS: Readonly<TenantSettings> = Object.freeze({ status: "active", companiesLimit: 100, workersLimit: 1000 });
export function readPlatformState(): PlatformDB {
  try { return JSON.parse(readFileSync(join(process.cwd(), "data", "platform.json"), "utf8")) as PlatformDB; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { settings: {}, changes: [] }; throw error; }
}
export function writePlatformState(db: PlatformDB) {
  const path = join(process.cwd(), "data", "platform.json"); mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`; writeFileSync(temporary, JSON.stringify(db, null, 2), { flag: "wx" }); renameSync(temporary, path);
}
export function getTenantSettings(tenantId: string): TenantSettings { return { ...DEFAULT_TENANT_SETTINGS, ...readPlatformState().settings[tenantId] }; }
export function isTenantEnabled(tenantId: string) {
  if (getTenantSettings(tenantId).status !== "active") return false;
  if (!tenantId.startsWith("trial-tenant-")) return true;
  const account = readRegisteredTrialAccounts().find((entry) => entry.tenantId === tenantId);
  return Boolean(account && isTrialActive(account));
}
export function isModuleEnabled(tenantId: string, module: OptionalModule) {
  const config = readPlatformState().plans?.[tenantId]?.config;
  return !(config?.disabledModules ?? []).includes(module);
}
export function assertModuleEnabled(tenantId: string, module: OptionalModule) {
  if (!isModuleEnabled(tenantId, module)) throw new Error("Novas operações deste módulo estão desativadas. Procure a administradora da consultoria. Os registros anteriores continuam disponíveis.");
}
export class TenantCapacityError extends Error {}
export function assertTenantCapacity(tenantId: string, resource: "companies" | "workers", currentActive: number) {
  const settings = getTenantSettings(tenantId);
  if (settings.status !== "active") throw new TenantCapacityError("Consultoria suspensa. Procure o suporte da plataforma.");
  if (currentActive >= settings[resource === "companies" ? "companiesLimit" : "workersLimit"]) throw new TenantCapacityError(`Limite de ${resource === "companies" ? "empresas ativas" : "trabalhadores ativos"} atingido. Procure a administradora da consultoria.`);
}
