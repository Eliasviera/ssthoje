import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type RiskAnalysisFields = {
  title: string;
  activity: string;
  workArea: string;
  assessment: string;
  controls: string;
  responsibleName: string;
};

export type RiskAnalysisHistoryEntry = {
  revision: number;
  status: "draft" | "issued";
  action: "created" | "saved" | "issued";
  occurredAt: string;
  actorUserId: string;
  fields: RiskAnalysisFields;
};

export type RiskAnalysis = RiskAnalysisFields & {
  id: string;
  tenantId: string;
  companyId: string;
  unitId: string;
  revision: number;
  status: "draft" | "issued";
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  issuedAt?: string;
  issuedBy?: string;
  history: RiskAnalysisHistoryEntry[];
};

type RiskAnalysisData = { records: RiskAnalysis[] };
type NewRiskAnalysis = RiskAnalysisFields & {
  tenantId: string;
  companyId: string;
  unitId: string;
  createdBy: string;
};

const emptyData: RiskAnalysisData = { records: [] };
const fieldLimits: Record<keyof RiskAnalysisFields, number> = {
  title: 140,
  activity: 1000,
  workArea: 1000,
  assessment: 5000,
  controls: 5000,
  responsibleName: 120,
};

export class RiskAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskAnalysisValidationError";
  }
}

function storePath() {
  return join(process.cwd(), "data", "risk-analyses.json");
}

function readData(): RiskAnalysisData {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray((value as RiskAnalysisData).records)) {
      throw new RiskAnalysisValidationError("O arquivo local de análises de risco tem formato inválido.");
    }
    return value as RiskAnalysisData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...emptyData };
    throw error;
  }
}

function writeData(data: RiskAnalysisData) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function normalizeFields(fields: RiskAnalysisFields): RiskAnalysisFields {
  const normalized = Object.fromEntries(
    Object.entries(fieldLimits).map(([field, maximum]) => {
      const value = fields[field as keyof RiskAnalysisFields];
      if (typeof value !== "string" || value.length > maximum) {
        throw new RiskAnalysisValidationError("Um campo da análise excede o limite permitido.");
      }
      return [field, value.trim()];
    }),
  ) as RiskAnalysisFields;
  if (Object.values(normalized).some((value) => !value)) {
    throw new RiskAnalysisValidationError("Preencha todos os campos da análise antes de salvar.");
  }
  return normalized;
}

function copyFields(fields: RiskAnalysisFields): RiskAnalysisFields {
  return {
    title: fields.title,
    activity: fields.activity,
    workArea: fields.workArea,
    assessment: fields.assessment,
    controls: fields.controls,
    responsibleName: fields.responsibleName,
  };
}

function copyRiskAnalysis(record: RiskAnalysis): RiskAnalysis {
  return {
    ...record,
    history: record.history.map((entry) => ({ ...entry, fields: copyFields(entry.fields) })),
  };
}

function captureHistory(
  record: RiskAnalysis,
  action: RiskAnalysisHistoryEntry["action"],
  actorUserId: string,
): RiskAnalysisHistoryEntry {
  return {
    revision: record.revision,
    status: record.status,
    action,
    occurredAt: record.updatedAt,
    actorUserId,
    fields: copyFields(record),
  };
}

function assertExpectedDraft(record: RiskAnalysis | undefined, expectedRevision: number): asserts record is RiskAnalysis {
  if (!record || record.status !== "draft") {
    throw new RiskAnalysisValidationError("A análise não está disponível para alteração.");
  }
  if (record.revision !== expectedRevision) {
    throw new RiskAnalysisValidationError("A análise foi alterada em outra sessão. Atualize a página.");
  }
}

export function listRiskAnalyses(tenantId: string): RiskAnalysis[] {
  return readData().records.filter((record) => record.tenantId === tenantId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(copyRiskAnalysis);
}

export function createRiskAnalysis(input: NewRiskAnalysis): RiskAnalysis {
  if (!input.tenantId || !input.companyId || !input.unitId || !input.createdBy) {
    throw new RiskAnalysisValidationError("Selecione empresa/unidade e confirme a conta responsável.");
  }
  const fields = normalizeFields(input);
  const data = readData();
  const now = new Date().toISOString();
  const record: RiskAnalysis = {
    ...fields,
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId,
    unitId: input.unitId,
    revision: 1,
    status: "draft",
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
    history: [],
  };
  record.history = [captureHistory(record, "created", input.createdBy)];
  writeData({ ...data, records: [...data.records, record] });
  return copyRiskAnalysis(record);
}

export function saveRiskAnalysisDraft(
  tenantId: string,
  recordId: string,
  expectedRevision: number,
  fieldsInput: RiskAnalysisFields,
  actorUserId: string,
): RiskAnalysis {
  const data = readData();
  const record = data.records.find((entry) => entry.id === recordId && entry.tenantId === tenantId);
  assertExpectedDraft(record, expectedRevision);
  if (!actorUserId.trim()) throw new RiskAnalysisValidationError("A conta responsável não foi identificada.");
  const fields = normalizeFields(fieldsInput);
  Object.assign(record, fields);
  record.revision += 1;
  record.updatedAt = new Date().toISOString();
  record.history.push(captureHistory(record, "saved", actorUserId));
  writeData(data);
  return copyRiskAnalysis(record);
}

export function issueRiskAnalysis(
  tenantId: string,
  recordId: string,
  expectedRevision: number,
  actorUserId: string,
): RiskAnalysis {
  const data = readData();
  const record = data.records.find((entry) => entry.id === recordId && entry.tenantId === tenantId);
  assertExpectedDraft(record, expectedRevision);
  if (!actorUserId.trim()) throw new RiskAnalysisValidationError("A conta responsável não foi identificada.");
  normalizeFields(record);
  record.status = "issued";
  record.revision += 1;
  record.updatedAt = new Date().toISOString();
  record.issuedAt = record.updatedAt;
  record.issuedBy = actorUserId;
  record.history.push(captureHistory(record, "issued", actorUserId));
  writeData(data);
  return copyRiskAnalysis(record);
}
