import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class DdsError extends Error {}

export type DdsSignature = {
  image: string;
  signedAt: string;
  capturedByUserId: string;
  method: "drawn_on_screen_simple";
};
export type DdsAttendee = { id: string; workerId?: string; workerName: string; registered: boolean; signature?: DdsSignature };
export type DdsHistoryEntry = { action: "created" | "signed" | "responsible_signed" | "closed"; actorUserId: string; occurredAt: string; attendeeId?: string };
export type DdsRecord = {
  id: string;
  tenantId: string;
  companyId: string;
  unitId: string;
  theme: string;
  heldOn: string;
  location: string;
  responsible: string;
  notes: string;
  status: "draft" | "closed";
  revision: number;
  responsibleSignature?: DdsSignature;
  attendees: DdsAttendee[];
  history: DdsHistoryEntry[];
  createdAt: string;
  closedAt?: string;
};
export type NewDds = {
  tenantId: string;
  companyId: string;
  unitId: string;
  theme: string;
  heldOn: string;
  location: string;
  responsible: string;
  notes: string;
  attendees: { workerId?: string; workerName: string }[];
  actorUserId: string;
};

const MAX_SIGNATURE_BYTES = 80 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function storePath() {
  return join(process.cwd(), "data", "dds.json");
}

function readAll(): DdsRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!Array.isArray(value)) throw new DdsError("O arquivo local de DDS tem formato inválido.");
    return value as DdsRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(records: DdsRecord[]) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function requiredText(value: string, label: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new DdsError(`Confira o campo ${label}.`);
  return text;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function validateSignatureImage(image: unknown): string {
  if (typeof image !== "string" || !image.startsWith("data:image/png;base64,")) throw new DdsError("Assinatura inválida. Desenhe a assinatura novamente.");
  const base64 = image.slice("data:image/png;base64,".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new DdsError("Assinatura inválida. Desenhe a assinatura novamente.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 100 || bytes.length > MAX_SIGNATURE_BYTES || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new DdsError("Assinatura inválida ou muito grande. Desenhe a assinatura novamente.");
  }
  return image;
}

export function listDds(tenantId: string): DdsRecord[] {
  return readAll().filter((record) => record.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createDds(input: NewDds): DdsRecord {
  const heldOn = typeof input.heldOn === "string" ? input.heldOn.trim() : "";
  if (!validDate(heldOn)) throw new DdsError("Informe uma data válida.");
  if (!Array.isArray(input.attendees) || input.attendees.length < 1 || input.attendees.length > 200) throw new DdsError("Selecione de 1 a 200 participantes.");
  const seen = new Set<string>();
  const attendees: DdsAttendee[] = input.attendees.map((attendee) => {
    const name = requiredText(attendee.workerName, "nome do participante", 120);
    const key = attendee.workerId ?? `name:${name.toLocaleLowerCase("pt-BR")}`;
    if (seen.has(key)) throw new DdsError("Participante repetido.");
    seen.add(key);
    return { id: randomUUID(), workerId: attendee.workerId, workerName: name, registered: Boolean(attendee.workerId) };
  });
  const now = new Date().toISOString();
  const record: DdsRecord = {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId,
    unitId: input.unitId,
    theme: requiredText(input.theme, "tema", 160),
    heldOn,
    location: requiredText(input.location, "local", 200),
    responsible: requiredText(input.responsible, "responsável", 120),
    notes: typeof input.notes === "string" ? input.notes.trim().slice(0, 1000) : "",
    status: "draft",
    revision: 1,
    attendees,
    history: [{ action: "created", actorUserId: input.actorUserId, occurredAt: now }],
    createdAt: now,
  };
  writeAll([...readAll(), record]);
  return record;
}

function mutate(tenantId: string, id: string, revision: number, change: (record: DdsRecord, now: string) => void): DdsRecord {
  const all = readAll();
  const index = all.findIndex((record) => record.id === id && record.tenantId === tenantId);
  if (index < 0) throw new DdsError("Registro de DDS indisponível.");
  const record = structuredClone(all[index]);
  if (record.revision !== revision) throw new DdsError("O registro mudou. Atualize a página antes de continuar.");
  if (record.status === "closed") throw new DdsError("DDS encerrado não pode ser alterado.");
  change(record, new Date().toISOString());
  record.revision += 1;
  all[index] = record;
  writeAll(all);
  return record;
}

export function signDdsResponsible(input: { tenantId: string; id: string; revision: number; image: string; actorUserId: string }): DdsRecord {
  const image = validateSignatureImage(input.image);
  return mutate(input.tenantId, input.id, input.revision, (record, now) => {
    if (record.responsibleSignature) throw new DdsError("O responsável já assinou.");
    record.responsibleSignature = { image, signedAt: now, capturedByUserId: input.actorUserId, method: "drawn_on_screen_simple" };
    record.history.push({ action: "responsible_signed", actorUserId: input.actorUserId, occurredAt: now });
  });
}

export function signDdsAttendee(input: { tenantId: string; id: string; attendeeId: string; revision: number; image: string; actorUserId: string }): DdsRecord {
  const image = validateSignatureImage(input.image);
  return mutate(input.tenantId, input.id, input.revision, (record, now) => {
    const attendee = record.attendees.find((item) => item.id === input.attendeeId);
    if (!attendee) throw new DdsError("Participante não pertence a este DDS.");
    if (attendee.signature) throw new DdsError("Este participante já assinou.");
    attendee.signature = { image, signedAt: now, capturedByUserId: input.actorUserId, method: "drawn_on_screen_simple" };
    record.history.push({ action: "signed", actorUserId: input.actorUserId, occurredAt: now, attendeeId: attendee.id });
  });
}

export function closeDds(input: { tenantId: string; id: string; revision: number; actorUserId: string }): DdsRecord {
  return mutate(input.tenantId, input.id, input.revision, (record, now) => {
    if (!record.responsibleSignature) throw new DdsError("O responsável precisa assinar antes de encerrar.");
    if (!record.attendees.some((attendee) => attendee.signature)) throw new DdsError("Colete ao menos uma assinatura de participante antes de encerrar.");
    record.status = "closed";
    record.closedAt = now;
    record.history.push({ action: "closed", actorUserId: input.actorUserId, occurredAt: now });
  });
}
