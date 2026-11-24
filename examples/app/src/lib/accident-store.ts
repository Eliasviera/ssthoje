import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AccidentStatus, AccidentType, CatType, TransmissionChannel } from "./accident-labels.ts";

export class AccidentError extends Error {}

export type AccidentMedical = {
  doctorName: string;
  crm: string;
  crmUf: string;
  attendedOn: string;
  /** Dado pessoal sensível de saúde: só sai do servidor para quem tem `accident.sensitive.read`. */
  cid?: string;
  daysOff?: number;
};

export type AccidentTransmission = {
  channel: TransmissionChannel;
  number: string;
  registeredByUserId: string;
  registeredAt: string;
};

export type AccidentHistoryEntry = {
  action: "reported" | "updated" | "cat_ready" | "transmitted_registered";
  status: AccidentStatus;
  actorUserId: string;
  occurredAt: string;
  note: string;
};

export type AccidentRecord = {
  id: string;
  tenantId: string;
  /** Protocolo interno do registro, não é número de CAT. */
  protocol: string;
  companyId: string;
  unitId: string;
  workerName: string;
  workerDocument?: string;
  workerRole?: string;
  occurredOn: string;
  occurredAtTime?: string;
  type: AccidentType;
  catType: CatType;
  previousCatNumber?: string;
  location: string;
  description: string;
  lastWorkDay?: string;
  hadLeave: boolean;
  death: boolean;
  deathDate?: string;
  medical?: AccidentMedical;
  status: AccidentStatus;
  transmission?: AccidentTransmission;
  history: AccidentHistoryEntry[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

/** Campos como chegam do formulário: strings cruas, validadas no store. */
export type AccidentFormInput = {
  companyId: string;
  unitId: string;
  workerName: string;
  workerDocument?: string;
  workerRole?: string;
  occurredOn: string;
  occurredAtTime?: string;
  type: string;
  catType: string;
  previousCatNumber?: string;
  location: string;
  description: string;
  lastWorkDay?: string;
  hadLeave: boolean;
  death: boolean;
  deathDate?: string;
  doctorName?: string;
  crm?: string;
  crmUf?: string;
  attendedOn?: string;
  cid?: string;
  daysOff?: string;
};

export type AccidentPendency = { key: string; label: string };

function storePath() {
  return join(process.cwd(), "data", "accidents.json");
}

function readAll(): AccidentRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!Array.isArray(value)) throw new AccidentError("O arquivo local de acidentes tem formato inválido.");
    return value as AccidentRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(records: AccidentRecord[]) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function required(value: unknown, label: string, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw new AccidentError(`Confira o campo ${label}.`);
  return result;
}

function optional(value: unknown, label: string, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > max) throw new AccidentError(`Confira o campo ${label}.`);
  return result;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeMedical(input: AccidentFormInput): AccidentMedical | undefined {
  const hasAny = [input.doctorName, input.crm, input.crmUf, input.attendedOn, input.cid, input.daysOff]
    .some((value) => typeof value === "string" && value.trim() !== "");
  if (!hasAny) return undefined;

  const doctorName = required(input.doctorName, "médico do atestado", 120);
  const crm = required(input.crm, "CRM", 30);
  const crmUf = required(input.crmUf, "UF do CRM", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(crmUf)) throw new AccidentError("Informe a UF do CRM com duas letras.");
  const attendedOn = required(input.attendedOn, "data do atendimento", 10);
  if (!validDate(attendedOn)) throw new AccidentError("Informe uma data de atendimento válida.");
  const cid = required(input.cid, "CID", 10).toUpperCase();
  if (!/^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/.test(cid)) throw new AccidentError("Informe o CID no formato A00 ou A00.0.");

  const rawDaysOff = optional(input.daysOff, "dias de afastamento", 4);
  let daysOff: number | undefined;
  if (rawDaysOff) {
    const parsed = Number(rawDaysOff);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3650) throw new AccidentError("Informe os dias de afastamento entre 0 e 3650.");
    daysOff = parsed;
  }
  return { doctorName, crm, crmUf, attendedOn, cid, ...(daysOff === undefined ? {} : { daysOff }) };
}

type NormalizedAccident = Omit<AccidentRecord, "id" | "tenantId" | "protocol" | "status" | "transmission" | "history" | "createdByUserId" | "createdAt" | "updatedAt">;

function normalizeAccident(input: AccidentFormInput): NormalizedAccident {
  if (!["typical", "commute", "disease"].includes(input.type)) throw new AccidentError("Escolha o tipo de acidente.");
  if (!["initial", "reopen", "death"].includes(input.catType)) throw new AccidentError("Escolha o tipo de CAT.");
  const type = input.type as AccidentType;
  const catType = input.catType as CatType;

  const occurredOn = required(input.occurredOn, "data do acidente", 10);
  if (!validDate(occurredOn)) throw new AccidentError("Informe uma data de acidente válida.");
  const occurredAtTime = optional(input.occurredAtTime, "hora do acidente", 5);
  if (occurredAtTime && !validTime(occurredAtTime)) throw new AccidentError("Informe a hora no formato HH:MM.");

  const lastWorkDay = optional(input.lastWorkDay, "último dia trabalhado", 10);
  if (lastWorkDay && !validDate(lastWorkDay)) throw new AccidentError("Informe uma data válida para o último dia trabalhado.");

  const deathDate = optional(input.deathDate, "data do óbito", 10);
  if (input.death && !deathDate) throw new AccidentError("Informe a data do óbito.");
  if (deathDate) {
    if (!validDate(deathDate)) throw new AccidentError("Informe uma data de óbito válida.");
    if (deathDate < occurredOn) throw new AccidentError("A data do óbito não pode ser anterior à data do acidente.");
  }
  if (catType === "death" && !input.death) throw new AccidentError("A comunicação de óbito exige indicar que houve óbito.");

  const previousCatNumber = optional(input.previousCatNumber, "número da CAT de origem", 60);
  if (catType === "reopen" && !previousCatNumber) throw new AccidentError("Informe o número da CAT de origem para a reabertura.");

  return {
    companyId: required(input.companyId, "empresa", 80),
    unitId: required(input.unitId, "unidade", 80),
    workerName: required(input.workerName, "trabalhador", 120),
    ...(optional(input.workerDocument, "documento do trabalhador", 20) ? { workerDocument: optional(input.workerDocument, "documento do trabalhador", 20) } : {}),
    ...(optional(input.workerRole, "função do trabalhador", 120) ? { workerRole: optional(input.workerRole, "função do trabalhador", 120) } : {}),
    occurredOn,
    ...(occurredAtTime ? { occurredAtTime } : {}),
    type,
    catType,
    ...(previousCatNumber ? { previousCatNumber } : {}),
    location: required(input.location, "local do acidente", 200),
    description: required(input.description, "descrição do acidente", 4000),
    ...(lastWorkDay ? { lastWorkDay } : {}),
    hadLeave: input.hadLeave,
    death: input.death,
    ...(deathDate ? { deathDate } : {}),
    medical: normalizeMedical(input),
  };
}

function nextProtocol(records: AccidentRecord[], tenantId: string) {
  const year = new Date().getFullYear();
  const prefix = `AC-${year}-`;
  const last = records
    .filter((record) => record.tenantId === tenantId && record.protocol.startsWith(prefix))
    .reduce((max, record) => {
      const parsed = Number(record.protocol.slice(prefix.length));
      return Number.isFinite(parsed) && parsed > max ? parsed : max;
    }, 0);
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

/** Pendências do registro: o que falta para a CAT ficar completa. */
export function accidentPendencies(record: Pick<AccidentRecord, "medical" | "catType" | "previousCatNumber" | "death" | "deathDate" | "status" | "transmission">): AccidentPendency[] {
  const pending: AccidentPendency[] = [];
  if (!record.medical) pending.push({ key: "medical", label: "Dados do atestado médico: médico, CRM/UF, data do atendimento e CID" });
  if (record.catType === "reopen" && !record.previousCatNumber) pending.push({ key: "previous_cat", label: "Número da CAT de origem (reabertura)" });
  if (record.death && !record.deathDate) pending.push({ key: "death_date", label: "Data do óbito" });
  if (!record.transmission) pending.push({ key: "transmission", label: "Número da CAT transmitida e canal usado" });
  return pending;
}

/** Só o que impede a CAT de ser marcada como pronta para transmissão. */
export function blockingPendencies(record: AccidentRecord) {
  return accidentPendencies(record).filter((item) => item.key !== "transmission");
}

export function createAccident(input: { tenantId: string; actorUserId: string; input: AccidentFormInput }): AccidentRecord {
  const normalized = normalizeAccident(input.input);
  const records = readAll();
  const now = new Date().toISOString();
  const record: AccidentRecord = {
    id: randomUUID(),
    tenantId: input.tenantId,
    protocol: nextProtocol(records, input.tenantId),
    ...normalized,
    status: "draft",
    history: [{ action: "reported", status: "draft", actorUserId: input.actorUserId, occurredAt: now, note: "" }],
    createdByUserId: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  records.push(record);
  writeAll(records);
  return { ...record };
}

/** Corrige/completa o registro enquanto a CAT não foi transmitida; voltar a rascunho reabre as pendências. */
export function updateAccident(input: { tenantId: string; id: string; actorUserId: string; input: AccidentFormInput }): AccidentRecord {
  const records = readAll();
  const record = records.find((item) => item.id === input.id && item.tenantId === input.tenantId);
  if (!record) throw new AccidentError("Registro indisponível.");
  if (record.status === "transmitted") throw new AccidentError("Registro transmitido não pode ser alterado.");

  const normalized = normalizeAccident(input.input);
  Object.assign(record, normalized);
  record.status = "draft";
  record.updatedAt = new Date().toISOString();
  record.history.push({ action: "updated", status: "draft", actorUserId: input.actorUserId, occurredAt: record.updatedAt, note: "Dados revisados após o registro." });
  writeAll(records);
  return { ...record };
}

export function markCatReady(input: { tenantId: string; id: string; actorUserId: string }): AccidentRecord {
  const records = readAll();
  const record = records.find((item) => item.id === input.id && item.tenantId === input.tenantId);
  if (!record) throw new AccidentError("Registro indisponível.");
  if (record.status === "transmitted") throw new AccidentError("Registro já transmitido.");
  const pending = blockingPendencies(record);
  if (pending.length) throw new AccidentError(`Complete antes de marcar como pronta: ${pending.map((item) => item.label).join("; ")}.`);
  record.status = "ready";
  record.updatedAt = new Date().toISOString();
  record.history.push({ action: "cat_ready", status: "ready", actorUserId: input.actorUserId, occurredAt: record.updatedAt, note: "CAT conferida e pronta para transmissão pelo cliente." });
  writeAll(records);
  return { ...record };
}

export function registerTransmission(input: { tenantId: string; id: string; actorUserId: string; channel: string; number: string }): AccidentRecord {
  if (!["esocial", "catweb", "other"].includes(input.channel)) throw new AccidentError("Escolha o canal da transmissão.");
  const number = required(input.number, "número da CAT", 60);
  const records = readAll();
  const record = records.find((item) => item.id === input.id && item.tenantId === input.tenantId);
  if (!record) throw new AccidentError("Registro indisponível.");
  if (record.status === "transmitted") throw new AccidentError("Transmissão já registrada.");
  if (record.status !== "ready") throw new AccidentError("Marque a CAT como pronta antes de registrar a transmissão.");
  const now = new Date().toISOString();
  record.status = "transmitted";
  record.transmission = { channel: input.channel as TransmissionChannel, number, registeredByUserId: input.actorUserId, registeredAt: now };
  record.updatedAt = now;
  record.history.push({ action: "transmitted_registered", status: "transmitted", actorUserId: input.actorUserId, occurredAt: now, note: `Número informado: ${number}.` });
  writeAll(records);
  return { ...record };
}

/** Remove o CID de quem não tem permissão de dado sensível; o restante do registro continua visível. */
export function sanitizeAccident(record: AccidentRecord, canSeeSensitive: boolean): AccidentRecord {
  if (canSeeSensitive || !record.medical?.cid) return { ...record, medical: record.medical ? { ...record.medical } : undefined };
  const medical: AccidentMedical = { ...record.medical };
  delete medical.cid;
  return { ...record, medical };
}

export function listAccidents(tenantId: string, viewer: { userId: string; canManage: boolean; canSeeSensitive: boolean }): AccidentRecord[] {
  return readAll()
    .filter((item) => item.tenantId === tenantId && (viewer.canManage || item.createdByUserId === viewer.userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => sanitizeAccident(item, viewer.canSeeSensitive));
}

export function getAccident(tenantId: string, id: string, canSeeSensitive: boolean): AccidentRecord | null {
  const record = readAll().find((item) => item.id === id && item.tenantId === tenantId);
  return record ? sanitizeAccident(record, canSeeSensitive) : null;
}
