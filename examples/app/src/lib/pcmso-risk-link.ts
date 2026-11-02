import type { PgrInventoryRecord } from "./pgr-postgres-operations";

export type PcmsoRiskLink = {
  schemaVersion: 1;
  tenantId: string;
  companyId: string;
  unitId: string;
  inventoryId: string;
  inventoryRevision: number;
  riskItemIds: string[];
  medicalReview: {
    status: "pending" | "reviewed";
    reviewerUserId?: string;
    reviewedAt?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePcmsoRiskLink(
  value: unknown,
  inventory: PgrInventoryRecord,
): { value: PcmsoRiskLink } | { error: string } {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !["schemaVersion", "tenantId", "companyId", "unitId", "inventoryId", "inventoryRevision", "riskItemIds", "medicalReview"].includes(key))
    || value.schemaVersion !== 1
    || typeof value.tenantId !== "string" || !value.tenantId.trim() || value.tenantId.length > 140
    || typeof value.companyId !== "string" || !value.companyId.trim() || value.companyId.length > 140
    || typeof value.unitId !== "string" || !value.unitId.trim() || value.unitId.length > 140
    || typeof value.inventoryId !== "string" || !value.inventoryId.trim() || value.inventoryId.length > 64
    || !Number.isSafeInteger(value.inventoryRevision) || (value.inventoryRevision as number) < 1
    || !Array.isArray(value.riskItemIds) || value.riskItemIds.length === 0 || value.riskItemIds.length > 500
    || !value.riskItemIds.every((id) => typeof id === "string" && id.trim().length > 0 && id.length <= 64)
    || new Set(value.riskItemIds).size !== value.riskItemIds.length
    || !isRecord(value.medicalReview)
    || Object.keys(value.medicalReview).some((key) => !["status", "reviewerUserId", "reviewedAt"].includes(key))
    || !["pending", "reviewed"].includes(String(value.medicalReview.status))) {
    return { error: "Vínculo PCMSO-PGR inválido." };
  }

  const review = value.medicalReview;
  if (review.status === "reviewed") {
    if (typeof review.reviewerUserId !== "string" || !review.reviewerUserId.trim() || review.reviewerUserId.length > 200
      || typeof review.reviewedAt !== "string" || Number.isNaN(Date.parse(review.reviewedAt))) {
      return { error: "Revisão médica exige responsável e data." };
    }
  } else if (review.reviewerUserId !== undefined || review.reviewedAt !== undefined) {
    return { error: "Vínculo pendente não pode carregar dados de revisão concluída." };
  }

  if (inventory.status !== "approved"
    || inventory.id !== value.inventoryId
    || inventory.inventory.tenantId !== value.tenantId
    || inventory.inventory.companyId !== value.companyId
    || inventory.inventory.unitId !== value.unitId
    || inventory.inventory.revision !== value.inventoryRevision) {
    return { error: "O vínculo precisa apontar para a revisão aprovada vigente da mesma unidade." };
  }

  const riskIds = new Set(inventory.inventory.items.map((item) => item.id));
  if (!(value.riskItemIds as string[]).every((id) => riskIds.has(id))) {
    return { error: "O vínculo contém risco que não existe no inventário informado." };
  }

  return { value: value as unknown as PcmsoRiskLink };
}
