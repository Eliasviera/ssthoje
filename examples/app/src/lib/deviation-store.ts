import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DeviationAiDraft } from "./deviation-ai.ts";
import { readDeviationPhoto, saveDeviationPhoto, type DecodedDeviationPhoto, type DeviationPhotoMeta } from "./deviation-photo.ts";

export class DeviationError extends Error {}

export type DeviationKind = "deviation" | "near_miss";
export type DeviationStatus = "open" | "in_review" | "closed";
export type DeviationHistoryEntry = { action: "reported" | "status_changed" | "ai_reviewed"; status: DeviationStatus; actorUserId: string; occurredAt: string; note: string };
/** Revisão humana do rascunho de IA: o sistema registra, nunca decide no lugar da pessoa. */
export type DeviationAiReview = { reviewedByUserId: string; reviewedAt: string; editedBeforeSave: boolean };
export type DeviationRecord = {
  id: string;
  tenantId: string;
  kind: DeviationKind;
  companyId: string;
  unitId: string;
  occurredOn: string;
  location: string;
  description: string;
  immediateAction: string;
  reporterName: string;
  status: DeviationStatus;
  photo?: DeviationPhotoMeta;
  ai?: DeviationAiDraft;
  review?: DeviationAiReview;
  history: DeviationHistoryEntry[];
  createdByUserId: string;
  createdAt: string;
};
export type NewDeviation = {
  tenantId: string;
  kind: string;
  companyId: string;
  unitId: string;
  occurredOn: string;
  location: string;
  description: string;
  immediateAction: string;
  reporterName: string;
  actorUserId: string;
  photo?: DecodedDeviationPhoto;
  ai?: DeviationAiDraft;
  aiEdited?: boolean;
};

function storePath() {
  return join(process.cwd(), "data", "deviations.json");
}

function readAll(): DeviationRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!Array.isArray(value)) throw new DeviationError("O arquivo local de desvios tem formato inválido.");
    return value as DeviationRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(records: DeviationRecord[]) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function required(value: unknown, label: string, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw new DeviationError(`Confira o campo ${label}.`);
  return result;
}

function optional(value: unknown, label: string, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > max) throw new DeviationError(`Confira o campo ${label}.`);
  return result;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function createDeviation(input: NewDeviation): DeviationRecord {
  if (input.kind !== "deviation" && input.kind !== "near_miss") throw new DeviationError("Escolha desvio ou quase incidente.");
  const occurredOn = typeof input.occurredOn === "string" ? input.occurredOn.trim() : "";
  if (!validDate(occurredOn)) throw new DeviationError("Informe uma data válida.");
  // A sugestão de IA nasce de uma foto: sem foto, não há rascunho a revisar.
  if (input.ai && !input.photo) throw new DeviationError("A sugestão de IA precisa estar ligada à foto do local.");

  // Valida tudo antes de gravar a foto: relato recusado não deixa arquivo órfão.
  const companyId = optional(input.companyId, "empresa", 80);
  const unitId = optional(input.unitId, "unidade", 80);
  const location = required(input.location, "local", 200);
  const description = required(input.description, "descrição", 2000);
  const immediateAction = optional(input.immediateAction, "ação imediata", 1000);
  const reporterName = required(input.reporterName, "nome de quem relata", 120);

  const id = randomUUID();
  const photo = input.photo ? saveDeviationPhoto(id, input.photo) : undefined;
  const now = new Date().toISOString();
  const history: DeviationHistoryEntry[] = [{ action: "reported", status: "open", actorUserId: input.actorUserId, occurredAt: now, note: "" }];
  if (input.ai) {
    history.push({ action: "ai_reviewed", status: "open", actorUserId: input.actorUserId, occurredAt: now, note: "Rascunho sugerido por IA revisado antes de salvar." });
  }

  const record: DeviationRecord = {
    id, tenantId: input.tenantId, kind: input.kind, companyId, unitId,
    occurredOn, location, description, immediateAction, reporterName,
    status: "open",
    ...(photo ? { photo } : {}),
    ...(input.ai ? { ai: input.ai, review: { reviewedByUserId: input.actorUserId, reviewedAt: now, editedBeforeSave: Boolean(input.aiEdited) } } : {}),
    history,
    createdByUserId: input.actorUserId, createdAt: now,
  };
  const records = readAll();
  records.push(record);
  writeAll(records);
  return record;
}

// Quem só relata enxerga apenas os próprios registros; quem gerencia enxerga todos do tenant.
export function listDeviations(tenantId: string, viewer: { userId: string; canManage: boolean }): DeviationRecord[] {
  return readAll()
    .filter((item) => item.tenantId === tenantId && (viewer.canManage || item.createdByUserId === viewer.userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Foto do desvio com o mesmo escopo do relato: autor ou quem gerencia desvios. */
export function readDeviationPhotoForViewer(input: { tenantId: string; id: string; viewer: { userId: string; canManage: boolean } }): { bytes: Buffer; mime: DeviationPhotoMeta["mime"] } | null {
  const record = readAll().find((item) => item.id === input.id && item.tenantId === input.tenantId);
  if (!record?.photo) return null;
  if (!input.viewer.canManage && record.createdByUserId !== input.viewer.userId) return null;
  const bytes = readDeviationPhoto(record.photo.fileName);
  return bytes ? { bytes, mime: record.photo.mime } : null;
}

export function transitionDeviation(input: { tenantId: string; id: string; status: string; note: string; actorUserId: string }): DeviationRecord {
  if (input.status !== "in_review" && input.status !== "closed") throw new DeviationError("Situação inválida.");
  const note = input.status === "closed" ? required(input.note, "tratativa", 1000) : optional(input.note, "tratativa", 1000);
  const records = readAll();
  const record = records.find((item) => item.id === input.id && item.tenantId === input.tenantId);
  if (!record) throw new DeviationError("Registro indisponível.");
  if (record.status === "closed") throw new DeviationError("Registro encerrado não pode ser alterado.");
  record.status = input.status;
  record.history.push({ action: "status_changed", status: input.status, actorUserId: input.actorUserId, occurredAt: new Date().toISOString(), note });
  writeAll(records);
  return { ...record };
}
