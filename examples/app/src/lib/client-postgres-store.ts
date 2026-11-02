import "server-only";

import type { ClientCompany, NewClientCompany } from "./client-store";
import { createClientCompanyInTransaction, listClientCompaniesInTransaction, setClientCompanyStatusInTransaction, validateNewClientCompany } from "./client-postgres-operations";
import { withCurrentTenantReadTransaction } from "./tenant-read-transaction";
import { withCurrentTenantWriteTransaction } from "./tenant-write-transaction";

export async function listClientCompaniesPostgres(requestedTenantId?: string): Promise<ClientCompany[]> {
  return withCurrentTenantReadTransaction("tenant.clients.read", requestedTenantId, (client, context) =>
    listClientCompaniesInTransaction(client, context.tenantId));
}

export async function createClientCompanyPostgres(input: NewClientCompany): Promise<ClientCompany> {
  validateNewClientCompany(input);
  return withCurrentTenantWriteTransaction("tenant.clients.manage", input.tenantId, (client, context) =>
    createClientCompanyInTransaction(client, context, input));
}

export async function setClientCompanyStatusPostgres(
  tenantId: string,
  companyId: string,
  status: ClientCompany["status"],
): Promise<ClientCompany | null> {
  if (!companyId || companyId.length > 200 || !["active", "archived"].includes(status)) {
    throw new Error("Confira o cadastro e a situação informada.");
  }
  return withCurrentTenantWriteTransaction("tenant.clients.manage", tenantId, (client, context) =>
    setClientCompanyStatusInTransaction(client, context, companyId, status));
}
