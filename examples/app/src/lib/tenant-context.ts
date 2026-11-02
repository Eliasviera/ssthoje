import "server-only";

import { getSession } from "./session";
import { requireTenantAccess, type TenantPermission } from "./tenant-access";

export async function getCurrentTenantAccess(permission: TenantPermission, requestedTenantId?: string) {
  const session = await getSession();
  if (!session) return { authenticated: false as const, session: null, context: null, reason: "unauthenticated" as const };

  const access = requireTenantAccess(session.userId, permission, requestedTenantId);
  if (!access.ok) return { authenticated: true as const, session, context: null, reason: access.reason };
  return { authenticated: true as const, session, context: access.context, reason: null };
}
