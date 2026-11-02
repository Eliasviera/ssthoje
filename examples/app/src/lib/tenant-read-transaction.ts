import "server-only";

import type { PoolClient } from "pg";
import { getCurrentTenantAccess } from "./tenant-context";
import type { TenantPermission } from "./tenant-access";
import {
  TenantTransactionAccessError,
  type TenantReadContext,
} from "./tenant-membership-parity";
import { getPostgresPool } from "./postgres";

export { assertCurrentTenantMembershipParity, TenantTransactionAccessError } from "./tenant-membership-parity";
export type { TenantReadContext } from "./tenant-membership-parity";

export async function withCurrentTenantReadTransaction<T>(
  permission: TenantPermission,
  requestedTenantId: string | undefined,
  operation: (client: PoolClient, context: TenantReadContext) => Promise<T>,
): Promise<T> {
  const access = await getCurrentTenantAccess(permission, requestedTenantId);
  if (!access.authenticated) throw new TenantTransactionAccessError(401);
  if (!access.context) throw new TenantTransactionAccessError(403);

  const pool = getPostgresPool();
  if (!pool) throw new Error("A conexão PostgreSQL local não está configurada.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('sst.user_id', $1, true)", [access.session.userId]);
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [access.context.tenant.id]);
    const result = await operation(client, {
      userId: access.session.userId,
      tenantId: access.context.tenant.id,
      membershipRole: access.context.membership.role,
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
