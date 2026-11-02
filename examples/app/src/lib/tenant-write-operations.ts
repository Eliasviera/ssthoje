import type { PoolClient } from "pg";
import type { TenantRole } from "./tenant-access.ts";

export type TenantWriteContext = Readonly<{ userId: string; tenantId: string; role: TenantRole }>;

export async function executeTenantWriteTransaction<T>(
  client: PoolClient,
  context: TenantWriteContext,
  operation: (client: PoolClient, context: TenantWriteContext) => Promise<T>,
): Promise<T> {
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('sst.user_id', $1, true)", [context.userId]);
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [context.tenantId]);
    const result = await operation(client, context);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  }
}
