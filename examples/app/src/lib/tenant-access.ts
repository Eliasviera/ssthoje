import { isTenantEnabled, isModuleEnabled } from "./tenant-state.ts";

export type TenantRole = "consultoria_admin" | "sst_tst" | "cliente" | "terceiro" | "profissional_habilitado" | "medico_coordenador" | "saas_master" | "campo";
export type Tenant = { id: string; name: string; status: "active" | "suspended" };
export type TenantMembership = { userId: string; tenantId: string; role: TenantRole; status: "active" | "suspended"; displayName: string };
export type TenantPermission =
  | "tenant.dashboard.read"
  | "tenant.members.manage"
  | "tenant.clients.read"
  | "tenant.clients.manage"
  | "tenant.audit.read"
  | "documents.read"
  | "documents.review"
  | "documents.submit"
  | "documents.manage"
  | "pgr.manage"
  | "operations.read"
  | "operations.manage"
  | "epi.read"
  | "epi.manage"
  | "dds.read"
  | "dds.manage"
  | "checklist.read"
  | "checklist.apply"
  | "checklist.manage"
  | "workers.read"
  | "workers.manage"
  | "medical.review"
  | "pcmso.status.read"
  | "pcmso.assign"
  | "pcmso.manage"
  | "thirdparty.read"
  | "thirdparty.manage"
  | "aso.manage"
  | "aso.status.read"
  | "saas.tenants.manage"
  | "safety.risk_analysis.manage"
  | "esocial.table24.manage"
  | "esocial.table27.manage";

// Somente fixtures fictícias para demonstrar o isolamento enquanto não há banco de dados.
export const DEMO_TENANTS: readonly Tenant[] = Object.freeze([
  Object.freeze({ id: "tenant-horizonte", name: "Consultoria A", status: "active" }),
  Object.freeze({ id: "tenant-aurora", name: "Consultoria B", status: "active" }),
]);

export const DEMO_MEMBERSHIPS: readonly TenantMembership[] = Object.freeze([
  Object.freeze({ userId: "sst-demo-medico", tenantId: "tenant-horizonte", role: "medico_coordenador", status: "active", displayName: "Coordenador médico fictício" }),
  Object.freeze({ userId: "sst-demo-client-authority", tenantId: "tenant-horizonte", role: "cliente", status: "active", displayName: "Conta cliente fictícia M22" }),
  Object.freeze({ userId: "sst-demo-user", tenantId: "tenant-horizonte", role: "consultoria_admin", status: "active", displayName: "Conta administradora de demonstração" }),
  Object.freeze({ userId: "sst-demo-sst", tenantId: "tenant-horizonte", role: "sst_tst", status: "active", displayName: "Profissional SST de demonstração" }),
  Object.freeze({ userId: "sst-demo-user-b", tenantId: "tenant-aurora", role: "consultoria_admin", status: "active", displayName: "Administradora da segunda consultoria" }),
  Object.freeze({ userId: "sst-demo-campo", tenantId: "tenant-horizonte", role: "campo", status: "active", displayName: "Líder de campo de demonstração" }),
]);

const permissionsByRole: Readonly<Record<TenantRole, readonly TenantPermission[]>> = Object.freeze({
  consultoria_admin: ["operations.read", "operations.manage", "epi.read", "epi.manage", "thirdparty.read", "thirdparty.manage", "aso.status.read", "pcmso.status.read", "pcmso.assign", "tenant.dashboard.read", "tenant.members.manage", "tenant.clients.read", "tenant.clients.manage", "tenant.audit.read", "documents.read", "documents.review", "documents.submit", "documents.manage", "pgr.manage", "workers.read", "workers.manage", "dds.read", "dds.manage", "checklist.read", "checklist.apply", "checklist.manage"],
  sst_tst: ["operations.read", "epi.read", "thirdparty.read", "aso.status.read", "pcmso.status.read", "tenant.dashboard.read", "tenant.clients.read", "documents.read", "documents.review", "pgr.manage", "workers.read", "safety.risk_analysis.manage", "dds.read", "dds.manage", "checklist.read", "checklist.apply", "checklist.manage", "esocial.table24.manage"],
  cliente: ["tenant.dashboard.read", "documents.read", "dds.read", "checklist.read"],
  terceiro: ["documents.submit"],
  profissional_habilitado: ["tenant.dashboard.read", "documents.read", "medical.review"],
  medico_coordenador: ["aso.manage", "tenant.dashboard.read", "pcmso.manage", "esocial.table27.manage"],
  saas_master: ["saas.tenants.manage"],
  campo: ["dds.read", "dds.manage", "checklist.read", "checklist.apply"],
});

export const SECTION_PERMISSIONS = Object.freeze({
  epi: ["epi.read"],
  terceiros: ["thirdparty.read"],
  aso: ["aso.manage", "aso.status.read"],
  pcmso: ["pcmso.status.read", "pcmso.manage"],
  inicio: ["tenant.dashboard.read"],
  empresas: ["tenant.clients.read"],
  pgr: ["documents.read", "pgr.manage"],
  documentos: ["documents.read", "documents.review", "documents.submit"],
  confirmacoes: ["documents.read"],
  pendencias: ["documents.review"],
  auditoria: ["tenant.audit.read"],
  trabalhadores: ["workers.read"],
  "analise-risco": ["safety.risk_analysis.manage"],
  dds: ["dds.read"],
  checklists: ["checklist.read"],
} satisfies Record<string, readonly TenantPermission[]>);

export function getVisibleSections(role: TenantRole): string[] {
  return Object.entries(SECTION_PERMISSIONS)
    .filter(([section, permissions]) => section === "confirmacoes"
      ? role === "cliente" && permissions.some((permission) => hasTenantPermission(role, permission))
      : permissions.some((permission) => hasTenantPermission(role, permission)))
    .map(([section]) => section);
}

export function hasTenantPermission(role: TenantRole | string, permission: TenantPermission | string): boolean {
  return Object.prototype.hasOwnProperty.call(permissionsByRole, role)
    && permissionsByRole[role as TenantRole].includes(permission as TenantPermission);
}

export function resolveTenantMembership(userId: string, requestedTenantId?: string) {
  const memberships = DEMO_MEMBERSHIPS.filter((membership) => membership.userId === userId && membership.status === "active");
  const membership = requestedTenantId
    ? memberships.find((entry) => entry.tenantId === requestedTenantId)
    : memberships.length === 1 ? memberships[0] : undefined;
  if (!membership) return null;

  const tenant = DEMO_TENANTS.find((entry) => entry.id === membership.tenantId && entry.status === "active");
  return tenant && isTenantEnabled(tenant.id) ? { membership, tenant } : null;
}

export function requireTenantAccess(
  userId: string,
  permission: TenantPermission | string,
  requestedTenantId?: string,
): { ok: true; context: NonNullable<ReturnType<typeof resolveTenantMembership>> } | { ok: false; reason: "membership_not_found" | "permission_denied" } {
  const context = resolveTenantMembership(userId, requestedTenantId);
  if (!context) return { ok: false, reason: "membership_not_found" };
  if (!hasTenantPermission(context.membership.role, permission)) return { ok: false, reason: "permission_denied" };
  const requiredModule = ({ "operations.manage": "operations", "thirdparty.manage": "thirdparty", "epi.manage": "epi" } as const)[permission as "operations.manage" | "thirdparty.manage" | "epi.manage"];
  if (requiredModule && !isModuleEnabled(context.tenant.id, requiredModule)) return { ok: false, reason: "permission_denied" };
  return { ok: true, context };
}
