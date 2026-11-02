import "server-only";

import { requireTenantAccess } from "./tenant-access";
import { getPcmsoStorageMode } from "./pcmso-storage-mode";
import * as jsonStore from "./pcmso-store";
import type { PcmsoScope } from "./pcmso-store";

function tenant(userId: string, permission: "pcmso.assign" | "pcmso.manage" | "pcmso.status.read") {
  const access = requireTenantAccess(userId, permission);
  if (!access.ok) throw new Error("Acesso ao PCMSO não autorizado.");
  return access.context;
}

export async function listPcmsoSummaries(userId: string) {
  if (getPcmsoStorageMode() === "json") return jsonStore.listPcmsoSummaries(userId);
  const context = tenant(userId, "pcmso.status.read");
  const [{ listPcmsoSummariesInTransaction }, { withCurrentTenantReadTransaction }] = await Promise.all([
    import("./pcmso-postgres-operations"), import("./tenant-read-transaction"),
  ]);
  return withCurrentTenantReadTransaction("pcmso.status.read", context.tenant.id, (client, tx) => listPcmsoSummariesInTransaction(client, tx.tenantId));
}

export async function listAssignedPcmso(userId: string) {
  if (getPcmsoStorageMode() === "json") return jsonStore.listAssignedPcmso(userId);
  const context = tenant(userId, "pcmso.manage");
  const [{ listAssignedPcmsoInTransaction }, { withCurrentTenantReadTransaction }] = await Promise.all([
    import("./pcmso-postgres-operations"), import("./tenant-read-transaction"),
  ]);
  return withCurrentTenantReadTransaction("pcmso.manage", context.tenant.id, (client, tx) => listAssignedPcmsoInTransaction(client, tx.tenantId, tx.userId));
}

export async function listMedicalUnitScopes(userId: string) {
  if (getPcmsoStorageMode() === "json") return jsonStore.listMedicalUnitScopes(userId);
  const context = tenant(userId, "pcmso.manage");
  const [{ listMedicalUnitScopesInTransaction }, { withCurrentTenantReadTransaction }] = await Promise.all([
    import("./pcmso-postgres-operations"), import("./tenant-read-transaction"),
  ]);
  return withCurrentTenantReadTransaction("pcmso.manage", context.tenant.id, (client, tx) => listMedicalUnitScopesInTransaction(client, tx.tenantId, tx.userId));
}

export async function assignPcmso(userId: string, scope: PcmsoScope, coordinatorId: string) {
  if (getPcmsoStorageMode() === "json") return jsonStore.assignPcmso(userId, scope, coordinatorId);
  const context = tenant(userId, "pcmso.assign");
  const [{ assignPcmsoInTransaction }, { withCurrentTenantWriteTransaction }] = await Promise.all([
    import("./pcmso-postgres-operations"), import("./tenant-write-transaction"),
  ]);
  return withCurrentTenantWriteTransaction("pcmso.assign", context.tenant.id, (client, tx) => assignPcmsoInTransaction(client, tx, scope, coordinatorId));
}

export async function changePcmso(userId: string, id: string, expectedVersion: number, operation: "save" | "submit" | "review", content?: string) {
  if (getPcmsoStorageMode() === "json") return jsonStore.changePcmso(userId, id, expectedVersion, operation, content);
  const context = tenant(userId, "pcmso.manage");
  const [{ changePcmsoInTransaction }, { withCurrentTenantWriteTransaction }] = await Promise.all([
    import("./pcmso-postgres-operations"), import("./tenant-write-transaction"),
  ]);
  return withCurrentTenantWriteTransaction("pcmso.manage", context.tenant.id, (client, tx) => changePcmsoInTransaction(client, tx, id, expectedVersion, operation, content));
}

export async function savePcmsoPgrRiskLinks(userId: string, id: string, expectedVersion: number, inventoryId: string, riskItemIds: string[]) {
  if (getPcmsoStorageMode() !== "postgres") throw new Error("O registro de vínculos PGR-PCMSO ficará disponível após a reconciliação e ativação do armazenamento PostgreSQL.");
  const context = tenant(userId, "pcmso.manage");
  const [{ savePcmsoPgrRiskLinksInTransaction }, { withCurrentTenantWriteTransaction }] = await Promise.all([
    import("./pcmso-postgres-operations"), import("./tenant-write-transaction"),
  ]);
  return withCurrentTenantWriteTransaction("pcmso.manage", context.tenant.id, (client, tx) => savePcmsoPgrRiskLinksInTransaction(client, tx, id, expectedVersion, inventoryId, riskItemIds));
}

export async function reviewPcmsoPgrRiskLinks(userId: string, id: string, expectedVersion: number) {
  if (getPcmsoStorageMode() !== "postgres") throw new Error("A revisão do vínculo PGR-PCMSO ficará disponível após a reconciliação e ativação do armazenamento PostgreSQL.");
  const context = tenant(userId, "pcmso.manage");
  const [{ reviewPcmsoPgrRiskLinksInTransaction }, { withCurrentTenantWriteTransaction }] = await Promise.all([
    import("./pcmso-postgres-operations"), import("./tenant-write-transaction"),
  ]);
  return withCurrentTenantWriteTransaction("pcmso.manage", context.tenant.id, (client, tx) => reviewPcmsoPgrRiskLinksInTransaction(client, tx, id, expectedVersion));
}
