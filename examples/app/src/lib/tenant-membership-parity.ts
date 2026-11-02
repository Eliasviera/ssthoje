import type { PoolClient } from "pg";
import type { TenantRole } from "./tenant-access";

export class TenantTransactionAccessError extends Error {
  readonly statusCode: 401 | 403;

  constructor(statusCode: 401 | 403) {
    super(statusCode === 401 ? "Autenticação obrigatória." : "Acesso ao tenant negado.");
    this.name = "TenantTransactionAccessError";
    this.statusCode = statusCode;
  }
}

export type TenantReadContext = Readonly<{ userId: string; tenantId: string; membershipRole: TenantRole }>;

/**
 * Confere a autorização em memória contra a membership já visível sob RLS.
 * Mutações precisam repetir a validação e bloquear as linhas dentro da função transacional.
 */
export async function assertCurrentTenantMembershipParity(
  client: PoolClient,
  context: TenantReadContext,
): Promise<void> {
  const result = await client.query<{
    membership_role: string;
    membership_status: string;
    tenant_status: string;
  }>(
    `SELECT membership.role AS membership_role,
            membership.status AS membership_status,
            tenant.status AS tenant_status
       FROM sst.tenant_memberships AS membership
       JOIN sst.tenants AS tenant ON tenant.id = membership.tenant_id
      WHERE membership.tenant_id = $1
        AND membership.user_id = $2`,
    [context.tenantId, context.userId],
  );
  const membership = result.rows[0];
  if (
    !membership
    || membership.membership_status !== "active"
    || membership.tenant_status !== "active"
    || membership.membership_role !== context.membershipRole
  ) {
    throw new TenantTransactionAccessError(403);
  }
}
