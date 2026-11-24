import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ClientCompanyBinding = {
  id: string; revision: number; userId: string; tenantId: string; companyId: string;
  unitIds: string[]; status: "active" | "revoked"; validFrom: string; validUntil: string;
  reviewedByUserId: string; reviewReference: string;
};
export type ClientCompanyScope = Pick<ClientCompanyBinding, "id" | "revision" | "tenantId" | "companyId" | "unitIds" | "validUntil">;
export type CompanyScopedAccess = { tenant: { id: string }; membership: { role: string }; companyScope?: ClientCompanyScope | null };
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,140}$/.test(value);

// Fonte local somente de leitura. Nenhuma rota ou action concede vínculos.
// Provisionamento autenticado/adapter PostgreSQL permanecem necessários antes de produção.
function readBindings(): ClientCompanyBinding[] {
  try {
    const path = join(process.cwd(), "data", "client-company-access.json");
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) return [];
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(value) || value.length > 1000) return [];
    const valid = value.every((item) => item && typeof item === "object"
      && [item.id, item.userId, item.tenantId, item.companyId, item.reviewedByUserId].every(safeId)
      && Number.isSafeInteger(item.revision) && item.revision >= 1
      && ["active", "revoked"].includes(item.status)
      && Array.isArray(item.unitIds) && item.unitIds.length > 0 && item.unitIds.length <= 100
      && item.unitIds.every(safeId) && new Set(item.unitIds).size === item.unitIds.length
      && typeof item.validFrom === "string" && Number.isFinite(Date.parse(item.validFrom))
      && typeof item.validUntil === "string" && Number.isFinite(Date.parse(item.validUntil))
      && Date.parse(item.validFrom) < Date.parse(item.validUntil)
      && typeof item.reviewReference === "string" && item.reviewReference.trim().length > 0 && item.reviewReference.length <= 200);
    return valid ? value as ClientCompanyBinding[] : [];
  } catch { return []; }
}

export function resolveClientCompanyScope(userId: string, tenantId: string, now = new Date()): ClientCompanyScope | null {
  const matches = readBindings().filter((item) => item.userId === userId && item.tenantId === tenantId);
  if (matches.length !== 1) return null;
  const binding = matches[0];
  if (binding.status !== "active" || !(Date.parse(binding.validFrom) <= now.getTime() && now.getTime() < Date.parse(binding.validUntil))) return null;
  return { id: binding.id, revision: binding.revision, tenantId: binding.tenantId, companyId: binding.companyId, unitIds: [...binding.unitIds], validUntil: binding.validUntil };
}

// Só permite caminhos que já aplicam o filtro por empresa/unidade.
export function clientCompanyPermissionReady(permission: string): boolean {
  return ["dds.read", "checklist.read", "deviation.report", "client.logo.manage"].includes(permission);
}

export function canAccessCompanyResource(access: CompanyScopedAccess, row: { tenantId: string; companyId: string; unitId: string }): boolean {
  if (row.tenantId !== access.tenant.id) return false;
  if (access.membership.role !== "cliente") return true;
  const scope = access.companyScope;
  return Boolean(scope && scope.tenantId === access.tenant.id && scope.companyId === row.companyId && scope.unitIds.includes(row.unitId));
}

export function scopeClientCompanies<T extends { id: string; tenantId: string; units: { id: string }[] }>(access: CompanyScopedAccess, companies: T[]): T[] {
  return companies.filter((company) => company.tenantId === access.tenant.id).flatMap((company) => {
    if (access.membership.role !== "cliente") return [company];
    const scope = access.companyScope;
    if (!scope || scope.tenantId !== access.tenant.id || scope.companyId !== company.id) return [];
    const units = company.units.filter((unit) => scope.unitIds.includes(unit.id));
    return units.length ? [{ ...company, units }] : [];
  });
}
