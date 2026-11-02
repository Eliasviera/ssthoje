import "server-only";

import type { PoolClient } from "pg";
import { getCurrentTenantAccess } from "./tenant-context";
import { assertModuleEnabled } from "./tenant-state";
import { getPostgresPool } from "./postgres";
import { assertCurrentTenantMembershipParity } from "./tenant-read-transaction";
import {
  assertThirdPartyReconciliationRole,
  executeThirdPartyReconciliationTransaction,
  ThirdPartyReconciliationAccessError,
  type ThirdPartyReconciliationCandidateCall,
} from "./third-party-legacy-reconciliation-write-operations";
import { executeTenantWriteTransaction, type TenantWriteContext } from "./tenant-write-operations";

/** Candidate executor; deliberately not imported by any active action or store. */
export async function withCurrentThirdPartyReconciliationTransaction(
  requestedTenantId: string | undefined,
  call: ThirdPartyReconciliationCandidateCall,
): Promise<unknown> {
  const access = await getCurrentTenantAccess("documents.review", requestedTenantId);
  if (!access.authenticated) throw new ThirdPartyReconciliationAccessError(401);
  if (!access.context) throw new ThirdPartyReconciliationAccessError(403);

  assertThirdPartyReconciliationRole(access.context.membership.role);
  assertModuleEnabled(access.context.tenant.id, "thirdparty");

  const pool = getPostgresPool();
  if (!pool) throw new Error("A conexão PostgreSQL local não está configurada.");

  const client = await pool.connect();
  try {
    return await executeThirdPartyReconciliationTransaction(client, {
      userId: access.session.userId,
      tenantId: access.context.tenant.id,
      role: access.context.membership.role,
    }, call);
  } finally {
    client.release();
  }
}

export async function withCurrentThirdPartyReconciliationWork<T>(
  requestedTenantId: string | undefined,
  operation: (client: PoolClient, context: TenantWriteContext) => Promise<T>,
): Promise<T> {
  const access = await getCurrentTenantAccess("documents.review", requestedTenantId);
  if (!access.authenticated) throw new ThirdPartyReconciliationAccessError(401);
  if (!access.context) throw new ThirdPartyReconciliationAccessError(403);

  assertThirdPartyReconciliationRole(access.context.membership.role);
  assertModuleEnabled(access.context.tenant.id, "thirdparty");

  const pool = getPostgresPool();
  if (!pool) throw new Error("A conexão PostgreSQL local não está configurada.");

  const client = await pool.connect();
  try {
    const context: TenantWriteContext = {
      userId: access.session.userId,
      tenantId: access.context.tenant.id,
      role: access.context.membership.role,
    };
    return await executeTenantWriteTransaction(client, context, async (transaction, trustedContext) => {
      await transaction.query("SELECT set_config('sst.membership_role', $1, true)", [trustedContext.role]);
      return operation(transaction, trustedContext);
    });
  } finally {
    client.release();
  }
}

export async function withCurrentClientRegistrarConfirmationWork<T>(
  operation: (client: PoolClient, context: TenantWriteContext) => Promise<T>,
): Promise<T> {
  const access = await getCurrentTenantAccess("documents.read");
  if (!access.authenticated) throw new ThirdPartyReconciliationAccessError(401);
  if (!access.context || access.context.membership.role !== "cliente") {
    throw new ThirdPartyReconciliationAccessError(403);
  }
  assertModuleEnabled(access.context.tenant.id, "thirdparty");

  const pool = getPostgresPool();
  if (!pool) throw new Error("A conexão PostgreSQL local não está configurada.");

  const client = await pool.connect();
  try {
    const context: TenantWriteContext = {
      userId: access.session.userId,
      tenantId: access.context.tenant.id,
      role: access.context.membership.role,
    };
    return await executeTenantWriteTransaction(client, context, async (transaction, trustedContext) => {
      await transaction.query("SELECT set_config('sst.membership_role', $1, true)", [trustedContext.role]);
      await assertCurrentTenantMembershipParity(transaction, {
        userId: trustedContext.userId,
        tenantId: trustedContext.tenantId,
        membershipRole: trustedContext.role,
      });
      return operation(transaction, trustedContext);
    });
  } finally {
    client.release();
  }
}
