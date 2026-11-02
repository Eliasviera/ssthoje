import "server-only";

import type { PoolClient } from "pg";
import { getCurrentTenantAccess } from "./tenant-context";
import type { TenantPermission } from "./tenant-access";
import { getPostgresPool } from "./postgres";
import { executeTenantWriteTransaction } from "./tenant-write-operations";

export { executeTenantWriteTransaction } from "./tenant-write-operations";

export class TenantWriteTransactionAccessError extends Error {
  constructor(readonly statusCode: 401 | 403) {
    super(statusCode === 401 ? "Autenticação obrigatória." : "Acesso ao tenant negado.");
    this.name = "TenantWriteTransactionAccessError";
  }
}

import type { TenantWriteContext } from "./tenant-write-operations";
export type { TenantWriteContext } from "./tenant-write-operations";

export async function withCurrentTenantWriteTransaction<T>(
  permission: TenantPermission,
  requestedTenantId: string | undefined,
  operation: (client: PoolClient, context: TenantWriteContext) => Promise<T>,
): Promise<T> {
  const access = await getCurrentTenantAccess(permission, requestedTenantId);
  if (!access.authenticated) throw new TenantWriteTransactionAccessError(401);
  if (!access.context) throw new TenantWriteTransactionAccessError(403);

  const pool = getPostgresPool();
  if (!pool) throw new Error("A conexão PostgreSQL local não está configurada.");

  const client = await pool.connect();
  try {
    return await executeTenantWriteTransaction(client, {
      userId: access.session.userId,
      tenantId: access.context.tenant.id,
      role: access.context.membership.role,
    }, operation);
  } finally {
    client.release();
  }
}
