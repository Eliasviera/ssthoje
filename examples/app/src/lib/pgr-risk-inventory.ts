import { ESOCIAL_CATALOG_SNAPSHOT, getEsocialCode } from "./esocial-catalog";

export type PgrRiskAssessment = {
  status: "reported" | "under_review" | "assessed";
  method?: string;
  decision?: string;
  assessor?: string;
  assessedAt?: string;
};

export type PgrExposureEvaluation = {
  id: string;
  agent: string;
  type: "qualitative" | "quantitative";
  status: "planned" | "collected" | "reviewed";
  method?: string;
  result?: string;
  unit?: string;
  evaluatedAt?: string;
  responsible?: string;
  qualification?: string;
  professionalRegistration?: string;
  artReference?: string;
  equipment?: string;
  equipmentId?: string;
  calibrationLab?: string;
  calibrationCertificate?: string;
  calibrationDate?: string;
  calibrationDueDate?: string;
  calibrationEvidenceRef?: string;
  samplingStrategy?: string;
  environmentalConditions?: string;
  monitoringNotes?: string;
  nextMonitoringAt?: string;
  evidenceRefs: string[];
};

export type PgrRiskItem = {
  id: string;
  process: string;
  activity: string;
  hazard: string;
  sourceCircumstance: string;
  possibleHarm: string;
  exposedGroups: string[];
  exposureDescription: string;
  existingMeasures: string[];
  evidenceRefs: string[];
  assessment: PgrRiskAssessment;
  exposureEvaluations?: PgrExposureEvaluation[];
  esocialTable24?: {
    code: string;
    label: string;
    catalogVersion: string;
    sourceUrl: string;
    rationale: string;
  };
};

export type PgrRiskInventory = {
  schemaVersion: 1;
  tenantId: string;
  companyId: string;
  unitId: string;
  revision: number;
  title: string;
  activityDescription: string;
  actionPlan: string;
  legacySource?: PgrLegacySource;
  items: PgrRiskItem[];
};

export type PgrLegacySnapshot = {
  version: number;
  title: string;
  activityDescription: string;
  riskInventory: string;
  actionPlan: string;
  savedAt: string;
  actorUserId: string;
  actorRole: string;
};

export type PgrLegacySource = {
  draftId: string;
  status: "draft" | "in_review" | "approved";
  revision: number;
  authorUserId: string;
  reviewerUserId?: string;
  reviewerRole?: string;
  createdAt: string;
  updatedAt: string;
  snapshots: PgrLegacySnapshot[];
  history: Array<{ id: string; action: "draft" | "in_review" | "approved" | "updated"; occurredAt: string; actorUserId: string; actorRole: string; note?: string }>;
};

const textLimits: Record<string, number> = {
  process: 3000,
  activity: 3000,
  hazard: 3000,
  sourceCircumstance: 3000,
  possibleHarm: 3000,
  exposureDescription: 3000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStringArray(value: unknown, maxItemLength: number): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= maxItemLength);
}

export function validatePgrRiskInventory(value: unknown): { value: PgrRiskInventory } | { error: string } {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "tenantId", "companyId", "unitId", "revision", "title", "activityDescription", "actionPlan", "legacySource", "items"]) || value.schemaVersion !== 1 || typeof value.tenantId !== "string" || !value.tenantId.trim() || value.tenantId.length > 140 || typeof value.companyId !== "string" || !value.companyId.trim() || value.companyId.length > 140 || typeof value.unitId !== "string" || !value.unitId.trim() || value.unitId.length > 140 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || typeof value.title !== "string" || !value.title.trim() || value.title.length > 140 || typeof value.activityDescription !== "string" || !value.activityDescription.trim() || value.activityDescription.length > 3000 || typeof value.actionPlan !== "string" || !value.actionPlan.trim() || value.actionPlan.length > 5000 || !Array.isArray(value.items)) {
    return { error: "Inventário inválido: confira versão, empresa, unidade, revisão e itens." };
  }

  const ids = new Set<string>();
  if (value.legacySource !== undefined && !isValidLegacySource(value.legacySource)) {
    return { error: "Snapshot legado do PGR inválido." };
  }
  for (const item of value.items) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["id", ...Object.keys(textLimits), "exposedGroups", "existingMeasures", "evidenceRefs", "assessment", "exposureEvaluations", "esocialTable24"]) || typeof item.id !== "string" || !item.id.trim() || item.id.length > 64 || ids.has(item.id)) {
      return { error: "Cada risco precisa de identificador único." };
    }
    ids.add(item.id);
    for (const [field, limit] of Object.entries(textLimits)) {
      if (typeof item[field] !== "string" || item[field].length > limit) return { error: `Campo ${field} inválido ou acima do limite.` };
    }
    if (!isStringArray(item.exposedGroups, 160) || new Set(item.exposedGroups).size !== item.exposedGroups.length || !isStringArray(item.existingMeasures, 1000) || !isStringArray(item.evidenceRefs, 200)) {
      return { error: "Grupos, medidas ou referências de evidência inválidos." };
    }
    const assessment = item.assessment;
    if (!isRecord(assessment) || !hasOnlyKeys(assessment, ["status", "method", "decision", "assessor", "assessedAt"]) || !["reported", "under_review", "assessed"].includes(String(assessment.status))) {
      return { error: "Estado da avaliação do risco inválido." };
    }
    if (["method", "decision", "assessor"].some((field) => assessment[field] !== undefined && (typeof assessment[field] !== "string" || assessment[field].length > (field === "decision" ? 1000 : field === "method" ? 500 : 200)))) {
      return { error: "Dados da avaliação inválidos ou acima do limite." };
    }
    if (assessment.status === "assessed" && (![assessment.method, assessment.decision, assessment.assessor].every((part) => typeof part === "string" && part.trim().length > 0) || typeof assessment.assessedAt !== "string" || Number.isNaN(Date.parse(assessment.assessedAt)))) {
      return { error: "Uma avaliação concluída exige método, decisão, responsável e data." };
    }
    if (assessment.assessedAt !== undefined && (typeof assessment.assessedAt !== "string" || Number.isNaN(Date.parse(assessment.assessedAt)))) {
      return { error: "Data da avaliação inválida." };
    }
    if (item.esocialTable24 !== undefined) {
      const association = item.esocialTable24;
      if (!isRecord(association) || !hasOnlyKeys(association, ["code", "label", "catalogVersion", "sourceUrl", "rationale"])
        || typeof association.code !== "string" || typeof association.label !== "string"
        || typeof association.catalogVersion !== "string" || typeof association.sourceUrl !== "string"
        || typeof association.rationale !== "string" || !association.rationale.trim() || association.rationale.length > 2000) {
        return { error: "Associação manual à Tabela 24 inválida; confira código e fundamentação." };
      }
      const catalogEntry = getEsocialCode("24", association.code);
      if (!catalogEntry || catalogEntry.label !== association.label
        || association.catalogVersion !== ESOCIAL_CATALOG_SNAPSHOT.sourceVersion
        || association.sourceUrl !== ESOCIAL_CATALOG_SNAPSHOT.sourceUrl) {
        return { error: "O código informado não corresponde ao snapshot atual da Tabela 24." };
      }
    }
    if (item.exposureEvaluations !== undefined) {
      if (!Array.isArray(item.exposureEvaluations) || item.exposureEvaluations.length > 30) return { error: "Lista de avaliações de exposição inválida." };
      const evaluationIds = new Set<string>();
      for (const evaluation of item.exposureEvaluations) {
        if (!isRecord(evaluation) || !hasOnlyKeys(evaluation, ["id", "agent", "type", "status", "method", "result", "unit", "evaluatedAt", "responsible", "qualification", "professionalRegistration", "artReference", "equipment", "equipmentId", "calibrationLab", "calibrationCertificate", "calibrationDate", "calibrationDueDate", "calibrationEvidenceRef", "samplingStrategy", "environmentalConditions", "monitoringNotes", "nextMonitoringAt", "evidenceRefs"])
          || typeof evaluation.id !== "string" || !evaluation.id.trim() || evaluation.id.length > 64 || evaluationIds.has(evaluation.id)
          || typeof evaluation.agent !== "string" || !evaluation.agent.trim() || evaluation.agent.length > 300
          || !["qualitative", "quantitative"].includes(String(evaluation.type))
          || !["planned", "collected", "reviewed"].includes(String(evaluation.status))
          || !isStringArray(evaluation.evidenceRefs, 200)) return { error: "Registro de avaliação de exposição inválido." };
        evaluationIds.add(evaluation.id);
        for (const field of ["method", "result", "unit", "responsible", "qualification", "professionalRegistration", "artReference", "equipment", "equipmentId", "calibrationLab", "calibrationCertificate", "calibrationEvidenceRef", "samplingStrategy", "environmentalConditions", "monitoringNotes"] as const) {
          const limit = ["result", "samplingStrategy", "environmentalConditions", "monitoringNotes"].includes(field) ? 1000 : ["qualification", "equipment"].includes(field) ? 300 : 200;
          if (evaluation[field] !== undefined && (typeof evaluation[field] !== "string" || evaluation[field].length > limit)) return { error: "Campo da avaliação ambiental inválido ou acima do limite." };
        }
        for (const field of ["evaluatedAt", "calibrationDate", "calibrationDueDate", "nextMonitoringAt"] as const) {
          if (evaluation[field] !== undefined && (typeof evaluation[field] !== "string" || Number.isNaN(Date.parse(evaluation[field] as string)))) return { error: "Data da avaliação, calibração ou próxima medição inválida." };
        }
        if (evaluation.status !== "planned" && (![evaluation.method, evaluation.result, evaluation.responsible].every((part) => typeof part === "string" && part.trim()) || typeof evaluation.evaluatedAt !== "string" || Number.isNaN(Date.parse(evaluation.evaluatedAt)))) {
          return { error: "Avaliação realizada exige método, resultado, responsável e data." };
        }
        if (evaluation.type === "quantitative" && evaluation.status !== "planned" && (typeof evaluation.unit !== "string" || !evaluation.unit.trim())) return { error: "Medição quantitativa exige unidade do resultado." };
      }
    }
  }

  return { value: value as unknown as PgrRiskInventory };
}

function isValidLegacySource(value: unknown): value is PgrLegacySource {
  if (!isRecord(value) || !hasOnlyKeys(value, ["draftId", "status", "revision", "authorUserId", "reviewerUserId", "reviewerRole", "createdAt", "updatedAt", "snapshots", "history"]) || typeof value.draftId !== "string" || !value.draftId.trim() || value.draftId.length > 64 || !["draft", "in_review", "approved"].includes(String(value.status)) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || typeof value.authorUserId !== "string" || !value.authorUserId.trim() || value.authorUserId.length > 200 || (value.reviewerUserId !== undefined && (typeof value.reviewerUserId !== "string" || value.reviewerUserId.length > 200)) || (value.reviewerRole !== undefined && (typeof value.reviewerRole !== "string" || value.reviewerRole.length > 80)) || typeof value.createdAt !== "string" || value.createdAt.length > 64 || typeof value.updatedAt !== "string" || value.updatedAt.length > 64 || !Array.isArray(value.snapshots) || !Array.isArray(value.history)) return false;
  const snapshotsValid = value.snapshots.every((snapshot) => isRecord(snapshot)
    && hasOnlyKeys(snapshot, ["version", "title", "activityDescription", "riskInventory", "actionPlan", "savedAt", "actorUserId", "actorRole"])
    && Number.isSafeInteger(snapshot.version) && (snapshot.version as number) >= 1
    && typeof snapshot.title === "string" && snapshot.title.length <= 140
    && typeof snapshot.activityDescription === "string" && snapshot.activityDescription.length <= 3000
    && typeof snapshot.riskInventory === "string" && snapshot.riskInventory.length <= 5000
    && typeof snapshot.actionPlan === "string" && snapshot.actionPlan.length <= 5000
    && typeof snapshot.savedAt === "string" && snapshot.savedAt.length <= 64
    && typeof snapshot.actorUserId === "string" && snapshot.actorUserId.length <= 200
    && typeof snapshot.actorRole === "string" && snapshot.actorRole.length <= 80);
  const historyIds = new Set<string>();
  let historyValid = true;
  for (const entry of value.history) {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["id", "action", "occurredAt", "actorUserId", "actorRole", "note"])
      || typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 64 || historyIds.has(entry.id)
      || !["draft", "in_review", "approved", "updated"].includes(String(entry.action))
      || typeof entry.occurredAt !== "string" || entry.occurredAt.length > 64
      || typeof entry.actorUserId !== "string" || !entry.actorUserId.trim() || entry.actorUserId.length > 200
      || typeof entry.actorRole !== "string" || !entry.actorRole.trim() || entry.actorRole.length > 80
      || (entry.note !== undefined && (typeof entry.note !== "string" || entry.note.length > 1000))) {
      historyValid = false;
      break;
    }
    historyIds.add(entry.id);
  }
  return snapshotsValid && historyValid;
}
