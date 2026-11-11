import "server-only";
import { listDds } from "./dds-store.ts";
import { listInspections } from "./checklist-store.ts";
import { listDeviations } from "./deviation-store.ts";
import { canAccessCompanyResource, type CompanyScopedAccess } from "./client-company-scope.ts";

export function listDdsForAccess(access: CompanyScopedAccess) {
  return listDds(access.tenant.id).filter((row) => canAccessCompanyResource(access, row));
}
export function listInspectionsForAccess(access: CompanyScopedAccess) {
  return listInspections(access.tenant.id).filter((row) => canAccessCompanyResource(access, row));
}
export function listDeviationsForAccess(access: CompanyScopedAccess, viewer: { userId: string; canManage: boolean }) {
  return listDeviations(access.tenant.id, viewer).filter((row) => access.membership.role !== "cliente" || canAccessCompanyResource(access, row));
}
