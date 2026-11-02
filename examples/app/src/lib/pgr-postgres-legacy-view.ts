import type { PgrInventoryRecord } from "./pgr-postgres-operations";
import type { PgrLegacySnapshot, PgrRiskInventory, PgrRiskItem } from "./pgr-risk-inventory";

export type PgrPostgresLegacyView = {
  id: string;
  tenantId: string;
  companyId: string;
  unitId: string;
  title: string;
  activityDescription: string;
  actionPlan: string;
  status: PgrInventoryRecord["status"];
  authorUserId: string;
  reviewerUserId?: string;
  reviewerRole?: string;
  sourceRevision: number;
  storageRevision: number;
  createdAt: string;
  updatedAt: string;
  legacyRiskReport: string;
  legacySnapshots: PgrLegacySnapshot[];
  history: NonNullable<PgrRiskInventory["legacySource"]>["history"];
  items: PgrRiskItem[];
};

export function projectPgrPostgresLegacyView(record: PgrInventoryRecord): PgrPostgresLegacyView {
  const { inventory } = record;
  const source = inventory.legacySource;
  if (!source || source.draftId !== record.id || !source.snapshots.length) {
    throw new Error("O registro PGR não contém origem legada suficiente para exibição.");
  }

  const lastLegacySnapshot = source.snapshots.at(-1);
  if (!lastLegacySnapshot || !Number.isSafeInteger(source.revision) || source.revision < 1) {
    throw new Error("O histórico legado do PGR está incompleto.");
  }

  return {
    id: record.id,
    tenantId: inventory.tenantId,
    companyId: inventory.companyId,
    unitId: inventory.unitId,
    title: inventory.title,
    activityDescription: inventory.activityDescription,
    actionPlan: inventory.actionPlan,
    status: record.status,
    authorUserId: source.authorUserId,
    ...(record.reviewerUserId ? { reviewerUserId: record.reviewerUserId } : {}),
    ...(record.reviewerRole ? { reviewerRole: record.reviewerRole } : {}),
    sourceRevision: source.revision,
    storageRevision: inventory.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    legacyRiskReport: lastLegacySnapshot.riskInventory,
    legacySnapshots: source.snapshots.map((snapshot) => ({ ...snapshot })),
    history: source.history.map((entry) => ({ ...entry })),
    items: inventory.items.map((item) => ({
      ...item,
      exposedGroups: [...item.exposedGroups],
      existingMeasures: [...item.existingMeasures],
      evidenceRefs: [...item.evidenceRefs],
      assessment: { ...item.assessment },
      ...(item.exposureEvaluations ? { exposureEvaluations: item.exposureEvaluations.map((evaluation) => ({ ...evaluation, evidenceRefs: [...evaluation.evidenceRefs] })) } : {}),
    })),
  };
}
