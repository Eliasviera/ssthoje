import "server-only";

import { randomUUID } from "node:crypto";
import { listApprovedPgrRiskOptionsInTransaction, listPgrInventoriesInTransaction, createPgrInventoryInTransaction, savePgrInventoryInTransaction, transitionPgrInventoryInTransaction, type PgrRiskOptionSet } from "./pgr-postgres-operations";
import { withCurrentTenantReadTransaction } from "./tenant-read-transaction";
import { withCurrentTenantWriteTransaction } from "./tenant-write-transaction";
import type { PgrRiskInventory } from "./pgr-risk-inventory";
import { listMedicalUnitScopesInTransaction } from "./pcmso-postgres-operations";

export function listPgrInventoriesPostgres(requestedTenantId?: string) {
  return withCurrentTenantReadTransaction("documents.read", requestedTenantId, (client, context) =>
    listPgrInventoriesInTransaction(client, context.tenantId));
}

export function listAssignedMedicalPgrRiskOptionsPostgres(): Promise<PgrRiskOptionSet[]> {
  return withCurrentTenantReadTransaction("pcmso.manage", undefined, (client, context) => {
    const scopes = listMedicalUnitScopesInTransaction(client, context.tenantId, context.userId)
      .then((items) => items.map(({ companyId, unitId }) => ({ companyId, unitId })));
    return scopes.then((assigned) => listApprovedPgrRiskOptionsInTransaction(client, context.tenantId, assigned));
  });
}

export function listPgrAuditEventsPostgres(requestedTenantId?: string) {
  return withCurrentTenantReadTransaction("tenant.audit.read", requestedTenantId, async (client, context) => {
    const result = await client.query<{ id: string; actor_role: string; action: string; occurred_at: Date | string }>(
      `SELECT id, actor_role, action, occurred_at
       FROM sst.pgr_audit_history WHERE tenant_id = $1
       ORDER BY occurred_at DESC, id DESC LIMIT 100`,
      [context.tenantId],
    );
    return result.rows.map((event) => ({
      id: event.id,
      actorRole: event.actor_role,
      action: event.action,
      occurredAt: new Date(event.occurred_at).toISOString(),
    }));
  });
}

export function createPgrInventoryPostgres(input: PgrRiskInventory) {
  const inventoryId = randomUUID();
  return withCurrentTenantWriteTransaction("pgr.manage", input.tenantId, (client, context) =>
    createPgrInventoryInTransaction(client, context, inventoryId, input, context));
}

export function savePgrInventoryPostgres(inventoryId: string, expectedRevision: number, input: PgrRiskInventory) {
  return withCurrentTenantWriteTransaction("pgr.manage", input.tenantId, (client, context) =>
    savePgrInventoryInTransaction(client, context, inventoryId, expectedRevision, input, context));
}

export function transitionPgrInventoryPostgres(
  inventoryId: string,
  next: "in_review" | "approved",
  expectedRevision: number,
  requestedTenantId?: string,
) {
  const permission = next === "approved" ? "documents.review" : "pgr.manage";
  return withCurrentTenantWriteTransaction(permission, requestedTenantId, (client, context) =>
    transitionPgrInventoryInTransaction(client, context, inventoryId, next, expectedRevision, context));
}
