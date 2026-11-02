import type { PgrInventoryRecord } from "./pgr-postgres-operations";

export function selectApprovedPgrRisks(
  inventories: PgrInventoryRecord[],
  selection: {
    tenantId: string;
    inventoryId: string;
    companyId: string;
    unitId: string;
    riskIds: string[];
  },
) {
  const { tenantId, inventoryId, companyId, unitId, riskIds } = selection;
  if (!tenantId || !inventoryId || !companyId || !unitId || riskIds.length < 1 || riskIds.length > 100
    || riskIds.some((id) => !id.trim()) || new Set(riskIds).size !== riskIds.length) return null;

  const inventory = inventories.find((record) => record.id === inventoryId && record.status === "approved"
    && record.inventory.tenantId === tenantId && record.inventory.companyId === companyId
    && record.inventory.unitId === unitId);
  if (!inventory) return null;

  const requestedIds = new Set(riskIds);
  const risks = inventory.inventory.items.filter((risk) => requestedIds.has(risk.id));
  if (risks.length !== requestedIds.size) return null;
  return { inventory, risks };
}
