import "server-only";

import type { PoolClient } from "pg";
import { isModuleEnabled } from "./tenant-state";
import { hasTenantPermission } from "./tenant-access";
import {
  assertCurrentTenantMembershipParity,
  TenantTransactionAccessError,
  withCurrentTenantReadTransaction,
} from "./tenant-read-transaction";
import { readPrivateRegistrySnapshotInTransaction } from "./third-party-private-registry-operations";
import type { RegisteredPrivateObjectSnapshot } from "./third-party-private-filesystem-store";

/** Candidate only: reads registry IDs for recovery planning; not wired to an action or page. */
export async function readCurrentTenantPrivateObjectSnapshotCandidate(): Promise<RegisteredPrivateObjectSnapshot> {
  return withCurrentTenantReadTransaction("thirdparty.read", undefined, async (client: PoolClient, context) => {
    if (!hasTenantPermission(context.membershipRole, "thirdparty.read") || !isModuleEnabled(context.tenantId, "thirdparty")) {
      throw new TenantTransactionAccessError(403);
    }
    return readPrivateRegistrySnapshotInTransaction(client, context, assertCurrentTenantMembershipParity);
  });
}
