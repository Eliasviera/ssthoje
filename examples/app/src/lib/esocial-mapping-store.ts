import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ESOCIAL_CATALOG_SNAPSHOT,
  getEsocialCode,
  type EsocialTableId,
} from "./esocial-catalog";

export type EsocialMappingFields = {
  tableId: EsocialTableId;
  code: string;
  sourceReference: string;
  targetDescription: string;
  rationale: string;
};

export type EsocialMappingHistory = {
  revision: number;
  status: "draft" | "reviewed";
  action: "created" | "saved" | "reviewed";
  occurredAt: string;
  actorUserId: string;
  code: string;
  codeLabel: string;
  sourceReference: string;
  targetDescription: string;
  rationale: string;
  reviewNote?: string;
};

export type EsocialMapping = EsocialMappingFields & {
  id: string;
  tenantId: string;
  companyId: string;
  unitId: string;
  catalogVersion: string;
  catalogSourceUrl: string;
  revision: number;
  status: "draft" | "reviewed";
  codeLabel: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  supersedesMappingId?: string;
  supersedesRevision?: number;
  history: EsocialMappingHistory[];
};

type Database = { mappings: EsocialMapping[] };
type NewMapping = EsocialMappingFields & {
  tenantId: string;
  companyId: string;
  unitId: string;
  createdBy: string;
  supersedesMappingId?: string;
  supersedesRevision?: number;
};

const emptyDatabase: Database = { mappings: [] };
const fieldLimits = {
  sourceReference: 300,
  targetDescription: 1000,
  rationale: 2000,
} as const;

export class EsocialMappingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsocialMappingValidationError";
  }
}

function dataPath() {
  return join(process.cwd(), "data", "esocial-mappings.json");
}

function readDatabase(): Database {
  try {
    const value: unknown = JSON.parse(readFileSync(dataPath(), "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray((value as Database).mappings)) {
      throw new EsocialMappingValidationError("O arquivo local de associações eSocial tem formato inválido.");
    }
    return value as Database;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...emptyDatabase };
    throw error;
  }
}

function writeDatabase(database: Database) {
  const path = dataPath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function validateFields(fields: EsocialMappingFields) {
  if (fields.tableId !== "24" && fields.tableId !== "27") {
    throw new EsocialMappingValidationError("Selecione uma tabela eSocial disponível.");
  }
  const entry = getEsocialCode(fields.tableId, fields.code);
  if (!entry) throw new EsocialMappingValidationError("Selecione um código existente no catálogo versionado.");
  for (const [field, maximum] of Object.entries(fieldLimits)) {
    const value = fields[field as keyof typeof fieldLimits];
    if (typeof value !== "string" || value.length > maximum || !value.trim()) {
      throw new EsocialMappingValidationError("Preencha a origem, o item relacionado e a fundamentação nos limites indicados.");
    }
  }
  return entry;
}

function snapshot(
  mapping: EsocialMapping,
  action: EsocialMappingHistory["action"],
  actorUserId: string,
  reviewNote?: string,
): EsocialMappingHistory {
  return {
    revision: mapping.revision,
    status: mapping.status,
    action,
    occurredAt: mapping.updatedAt,
    actorUserId,
    code: mapping.code,
    codeLabel: mapping.codeLabel,
    sourceReference: mapping.sourceReference,
    targetDescription: mapping.targetDescription,
    rationale: mapping.rationale,
    ...(reviewNote ? { reviewNote } : {}),
  };
}

function copyMapping(mapping: EsocialMapping): EsocialMapping {
  return { ...mapping, history: mapping.history.map((entry) => ({ ...entry })) };
}

function assertRevision(mapping: EsocialMapping | undefined, expectedRevision: number): asserts mapping is EsocialMapping {
  if (!mapping) throw new EsocialMappingValidationError("A associação não está disponível nesta consultoria.");
  if (!Number.isSafeInteger(expectedRevision) || mapping.revision !== expectedRevision) {
    throw new EsocialMappingValidationError("A associação mudou em outra sessão. Atualize a página.");
  }
}

export function listEsocialMappings(tenantId: string): EsocialMapping[] {
  return readDatabase().mappings
    .filter((mapping) => mapping.tenantId === tenantId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(copyMapping);
}

export function createEsocialMapping(input: NewMapping): EsocialMapping {
  if (!input.tenantId || !input.companyId || !input.unitId || !input.createdBy) {
    throw new EsocialMappingValidationError("O escopo e a conta responsável são obrigatórios.");
  }
  const entry = validateFields(input);
  const database = readDatabase();
  const previous = input.supersedesMappingId
    ? database.mappings.find((item) => item.id === input.supersedesMappingId && item.tenantId === input.tenantId)
    : undefined;
  if (input.supersedesMappingId && (!previous || previous.status !== "reviewed"
    || previous.companyId !== input.companyId || previous.unitId !== input.unitId || previous.tableId !== input.tableId
    || previous.revision !== input.supersedesRevision)) {
    throw new EsocialMappingValidationError("A revisão anterior não está disponível ou mudou. Atualize e tente novamente.");
  }
  if (!input.supersedesMappingId && input.supersedesRevision !== undefined) {
    throw new EsocialMappingValidationError("A revisão anterior informada é inválida.");
  }
  const now = new Date().toISOString();
  const mapping: EsocialMapping = {
    ...input,
    id: randomUUID(),
    catalogVersion: ESOCIAL_CATALOG_SNAPSHOT.sourceVersion,
    catalogSourceUrl: ESOCIAL_CATALOG_SNAPSHOT.sourceUrl,
    codeLabel: entry.label,
    revision: previous ? previous.revision + 1 : 1,
    status: "draft",
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
    ...(previous ? { supersedesMappingId: previous.id, supersedesRevision: previous.revision } : {}),
    history: [],
  };
  mapping.history.push(snapshot(mapping, "created", input.createdBy));
  writeDatabase({ ...database, mappings: [...database.mappings, mapping] });
  return copyMapping(mapping);
}

export function saveEsocialMappingDraft(
  tenantId: string,
  mappingId: string,
  expectedRevision: number,
  fields: EsocialMappingFields,
  actorUserId: string,
): EsocialMapping {
  const database = readDatabase();
  const mapping = database.mappings.find((item) => item.id === mappingId && item.tenantId === tenantId);
  assertRevision(mapping, expectedRevision);
  if (!actorUserId.trim()) throw new EsocialMappingValidationError("A conta responsável não foi identificada.");
  if (mapping.status === "reviewed") {
    throw new EsocialMappingValidationError("A associação revisada é imutável. Crie uma nova associação para substituir esta revisão.");
  }
  const entry = validateFields(fields);
  Object.assign(mapping, fields, { codeLabel: entry.label });
  mapping.revision += 1;
  mapping.updatedAt = new Date().toISOString();
  mapping.history.push(snapshot(mapping, "saved", actorUserId));
  writeDatabase(database);
  return copyMapping(mapping);
}

export function reviewEsocialMapping(
  tenantId: string,
  mappingId: string,
  expectedRevision: number,
  actorUserId: string,
  reviewNote: string,
): EsocialMapping {
  const database = readDatabase();
  const mapping = database.mappings.find((item) => item.id === mappingId && item.tenantId === tenantId);
  assertRevision(mapping, expectedRevision);
  if (mapping.status !== "draft") {
    throw new EsocialMappingValidationError("Somente uma associação em rascunho pode ser revisada.");
  }
  if (!actorUserId.trim() || !reviewNote.trim() || reviewNote.length > 1000) {
    throw new EsocialMappingValidationError("Registre a conta revisora e a justificativa da revisão.");
  }
  const entry = getEsocialCode(mapping.tableId, mapping.code);
  if (!entry || entry.label !== mapping.codeLabel) {
    throw new EsocialMappingValidationError("O código não corresponde mais ao snapshot vinculado.");
  }
  mapping.status = "reviewed";
  mapping.revision += 1;
  mapping.updatedAt = new Date().toISOString();
  mapping.reviewedAt = mapping.updatedAt;
  mapping.reviewedBy = actorUserId;
  mapping.reviewNote = reviewNote.trim();
  mapping.history.push(snapshot(mapping, "reviewed", actorUserId, mapping.reviewNote));
  writeDatabase(database);
  return copyMapping(mapping);
}
