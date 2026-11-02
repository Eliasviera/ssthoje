import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class DeviationError extends Error {}

export type DeviationKind = "deviation" | "near_miss";
export type DeviationStatus = "open" | "in_review" | "closed";
export type DeviationHistoryEntry = { action: "reported" | "status_changed"; status: DeviationStatus; actorUserId: string; occurredAt: string; note: string };
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
  const now = new Date().toISOString();
  const record: DeviationRecord = {
    id: randomUUID(), tenantId: input.tenantId, kind: input.kind, companyId: optional(input.companyId, "empresa", 80), unitId: optional(input.unitId, "unidade", 80),
    occurredOn, location: required(input.location, "local", 200), description: required(input.description, "descrição", 2000),
    immediateAction: optional(input.immediateAction, "ação imediata", 1000), reporterName: required(input.reporterName, "nome de quem relata", 120),
    status: "open", history: [{ action: "reported", status: "open", actorUserId: input.actorUserId, occurredAt: now, note: "" }],
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
