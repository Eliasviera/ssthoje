import "server-only";

import { appendAuditEvent } from "./audit-log";
import { createClientCompany as createClientCompanyJson, listClientCompaniesForTenant as listClientCompaniesJson, setClientCompanyStatus as setClientCompanyStatusJson } from "./client-store";
import type { ClientCompany, NewClientCompany } from "./client-store";
import { getPostgresPool } from "./postgres";
import type { TenantRole } from "./tenant-access";
import { getClientStorageMode } from "./client-storage-mode";

type ClientActor = { userId: string; role: TenantRole };

function requirePostgres() {
  if (!getPostgresPool()) throw new Error("A conexão PostgreSQL local não está configurada.");
}

export async function listClientCompanies(tenantId: string): Promise<ClientCompany[]> {
  if (getClientStorageMode() === "json") return listClientCompaniesJson(tenantId);
  requirePostgres();
  const store = await import("./client-postgres-store");
  return store.listClientCompaniesPostgres(tenantId);
}

export async function registerClientCompany(input: NewClientCompany, actor: ClientActor): Promise<ClientCompany> {
  if (getClientStorageMode() === "postgres") {
    requirePostgres();
    const store = await import("./client-postgres-store");
    return store.createClientCompanyPostgres(input);
  }

  const company = createClientCompanyJson(input);
  appendAuditEvent({ tenantId: input.tenantId, actorUserId: actor.userId, actorRole: actor.role, action: "client.created", targetId: company.id });
  return company;
}

export async function changeClientCompanyStatus(
  tenantId: string,
  companyId: string,
  status: ClientCompany["status"],
  actor: ClientActor,
): Promise<ClientCompany | null> {
  if (getClientStorageMode() === "postgres") {
    requirePostgres();
    const store = await import("./client-postgres-store");
    return store.setClientCompanyStatusPostgres(tenantId, companyId, status);
  }

  const company = setClientCompanyStatusJson(tenantId, companyId, status);
  if (company) {
    appendAuditEvent({ tenantId, actorUserId: actor.userId, actorRole: actor.role, action: "client.status_changed", targetId: company.id });
  }
  return company;
}
