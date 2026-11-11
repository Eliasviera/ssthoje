import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DocumentSignatureError, normalizeSignerName, sameSignerName, validateSignatureImage, type DocumentSigner, type DocumentSignature, type DocumentSignerRole } from "./document-signatures";

export type RiskAnalysisApplicability = "aplicavel" | "nao_aplicavel" | "a_confirmar";

/** Perigo registrado na AR, com o mesmo molde da APR: risco, controles e aplicabilidade. */
export type RiskAnalysisHazard = {
  id: string;
  hazard: string;
  risk: string;
  controls: string;
  ppe: string;
  reference: string;
  applicability: RiskAnalysisApplicability;
  justification: string;
};

/** Etapa operacional da AR (passo a passo da atividade). */
export type RiskAnalysisStage = {
  id: string;
  order: number;
  name: string;
  hazards: RiskAnalysisHazard[];
};

export type RiskAnalysisFields = {
  title: string;
  activity: string;
  workArea: string;
  assessment: string;
  controls: string;
  responsibleName: string;
  /** Modelo do acervo usado como base (opcional). */
  catalogModelId?: string;
  stages?: RiskAnalysisStage[];
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
  /** Número do documento, sequencial por tenant: AR-2026-0001. */
  documentNumber: string;
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
  signers?: DocumentSigner[];
  signatures?: DocumentSignature[];
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
const fieldLimits: Record<"title" | "activity" | "workArea" | "assessment" | "controls" | "responsibleName", number> = {
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
  ) as Record<"title" | "activity" | "workArea" | "assessment" | "controls" | "responsibleName", string>;
  if (Object.values(normalized).some((value) => !value)) {
    throw new RiskAnalysisValidationError("Preencha todos os campos da análise antes de salvar.");
  }
  return {
    ...normalized,
    catalogModelId: fields.catalogModelId,
    stages: Array.isArray(fields.stages) ? fields.stages : undefined,
  };
}

function copyFields(fields: RiskAnalysisFields): RiskAnalysisFields {
  return {
    catalogModelId: fields.catalogModelId,
    stages: fields.stages ? structuredClone(fields.stages) : undefined,
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
    ...(record.signers ? { signers: record.signers.map((signer) => ({ ...signer })) } : {}),
    ...(record.signatures ? { signatures: record.signatures.map((signature) => ({ ...signature })) } : {}),
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
  const year = now.slice(0, 4);
  const sequence = data.records.filter((record) => record.tenantId === input.tenantId && record.documentNumber?.startsWith(`AR-${year}-`)).length + 1;
  const record: RiskAnalysis = {
    ...fields,
    id: randomUUID(),
    documentNumber: `AR-${year}-${String(sequence).padStart(4, "0")}`,
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

/**
 * Inclui quem vai assinar (emissor ou participante). Não altera o conteúdo
 * revisado nem a revisão do documento: a lista de assinaturas é evidência à parte.
 */
export function addRiskAnalysisSigner(
  tenantId: string,
  recordId: string,
  nameInput: string,
  roleInput: string,
  actorUserId: string,
  workerId?: string,
): RiskAnalysis {
  const data = readData();
  const record = data.records.find((entry) => entry.id === recordId && entry.tenantId === tenantId);
  if (!record) throw new RiskAnalysisValidationError("A análise não está disponível nesta consultoria.");
  if (!actorUserId?.trim()) throw new RiskAnalysisValidationError("A conta que inclui o assinante não foi identificada.");
  if (roleInput !== "issuer" && roleInput !== "participant") throw new RiskAnalysisValidationError("Informe se a pessoa é emissor ou participante.");
  let name: string;
  try { name = normalizeSignerName(nameInput); } catch (error) {
    if (error instanceof DocumentSignatureError) throw new RiskAnalysisValidationError(error.message);
    throw error;
  }
  const signers = record.signers ?? [];
  if (signers.some((signer) => sameSignerName(signer.name, name) || (workerId ? signer.workerId === workerId : false))) {
    throw new RiskAnalysisValidationError("Esta pessoa já está na lista de assinaturas.");
  }
  record.signers = [...signers, { id: randomUUID(), name, role: roleInput as DocumentSignerRole, ...(workerId ? { workerId } : {}) }];
  record.updatedAt = new Date().toISOString();
  writeData(data);
  return copyRiskAnalysis(record);
}

/** Registra a assinatura desenhada na tela de uma pessoa já incluída. */
export function signRiskAnalysis(
  tenantId: string,
  recordId: string,
  signerId: string,
  imageInput: string,
  actorUserId: string,
): RiskAnalysis {
  const data = readData();
  const record = data.records.find((entry) => entry.id === recordId && entry.tenantId === tenantId);
  if (!record) throw new RiskAnalysisValidationError("A análise não está disponível nesta consultoria.");
  if (!actorUserId?.trim()) throw new RiskAnalysisValidationError("A conta que coleta a assinatura não foi identificada.");
  const signer = (record.signers ?? []).find((entry) => entry.id === signerId);
  if (!signer) throw new RiskAnalysisValidationError("O assinante não está na lista desta análise. Atualize a página.");
  if ((record.signatures ?? []).some((signature) => signature.signerId === signerId)) {
    throw new RiskAnalysisValidationError("Esta pessoa já assinou esta análise.");
  }
  let image: string;
  try { image = validateSignatureImage(imageInput); } catch (error) {
    if (error instanceof DocumentSignatureError) throw new RiskAnalysisValidationError(error.message);
    throw error;
  }
  const signature: DocumentSignature = {
    signerId: signer.id,
    signerName: signer.name,
    role: signer.role,
    image,
    signedAt: new Date().toISOString(),
    capturedByUserId: actorUserId,
    method: "drawn_on_screen_simple",
  };
  record.signatures = [...(record.signatures ?? []), signature];
  record.updatedAt = signature.signedAt;
  writeData(data);
  return copyRiskAnalysis(record);
}
