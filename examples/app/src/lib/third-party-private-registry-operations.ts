import "server-only";

import type { PoolClient } from "pg";
import type { TenantReadContext } from "./tenant-read-transaction";
import {
  readRegisteredPrivateObjectSnapshot,
  type RegisteredPrivateObjectSnapshot,
} from "./third-party-private-filesystem-store";

export async function readPrivateRegistrySnapshotInTransaction(
  client: PoolClient,
  context: TenantReadContext,
  assertMembershipParity: (client: PoolClient, context: TenantReadContext) => Promise<void>,
): Promise<RegisteredPrivateObjectSnapshot> {
  await client.query("SELECT set_config('sst.membership_role', $1, true)", [context.membershipRole]);
  await assertMembershipParity(client, context);
  return readRegisteredPrivateObjectSnapshot(client, context.tenantId);
}
