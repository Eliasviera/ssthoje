import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

export type NcStatus = "open" | "in_progress" | "in_review" | "closed";
export type NcEvent = { status: NcStatus; note: string; actorUserId: string; occurredAt: string };
export type Nonconformity = {
  id: string; tenantId: string; companyId: string; unitId: string;
  title: string; description: string; evidence: string; location: string;
  responsible: string; actionPlan: string; dueDate: string;
  revision: number; status: NcStatus; createdAt: string; history: NcEvent[];
};
type NewNc = Omit<Nonconformity, "id" | "revision" | "status" | "createdAt" | "history"> & { actorUserId: string };
export class NonconformityError extends Error {}
function path() { return join(process.cwd(), "data", "nonconformities.json"); }
function read(): Nonconformity[] {
  try {
    const data: unknown = JSON.parse(readFileSync(path(), "utf8"));
    if (!Array.isArray(data)) throw new Error("Formato local de não conformidades inválido.");
    return data as Nonconformity[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
function write(data: Nonconformity[]) {
  mkdirSync(dirname(path()), { recursive: true });
  const temporary = `${path()}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  renameSync(temporary, path());
}
function required(value: string, max: number) { return typeof value === "string" && !!value.trim() && value.length <= max; }
export function listNonconformities(tenantId: string): Nonconformity[] {
  return read().filter(item => item.tenantId === tenantId).reverse();
}
export function createNonconformity(input: NewNc): Nonconformity {
  if (!required(input.tenantId, 140) || !required(input.actorUserId, 140)
    || !required(input.companyId, 140) || !required(input.unitId, 140)
    || !required(input.title, 140) || !required(input.description, 2000)
    || !required(input.evidence, 2000) || !required(input.location, 500)
    || !required(input.responsible, 120) || !required(input.actionPlan, 1200)
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
    || !Number.isFinite(Date.parse(`${input.dueDate}T00:00:00Z`))
    || new Date(`${input.dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.dueDate) {
    throw new NonconformityError("Confira os campos obrigatórios, seus limites e a data do prazo interno.");
  }
  const data = read();
  const now = new Date().toISOString();
  const { actorUserId, ...fields } = input;
  const record: Nonconformity = { ...fields, id: randomUUID(), revision: 1, status: "open", createdAt: now,
    history: [{ status: "open", note: "Ocorrência registrada para acompanhamento humano.", actorUserId, occurredAt: now }] };
  write([...data, record]);
  return structuredClone(record);
}
export function transitionNonconformity(tenantId: string, id: string, expectedRevision: number, status: NcStatus, note: string, actorUserId: string): Nonconformity {
  const data = read();
  const record = data.find(item => item.id === id && item.tenantId === tenantId);
  if (!record) throw new NonconformityError("Ocorrência indisponível nesta consultoria.");
  if (!Number.isSafeInteger(expectedRevision) || record.revision !== expectedRevision) throw new NonconformityError("A ocorrência mudou. Atualize a página antes de continuar.");
  const allowed: Record<NcStatus, NcStatus[]> = { open: ["in_progress"], in_progress: ["in_review"], in_review: ["in_progress", "closed"], closed: ["in_progress"] };
  if (!allowed[record.status].includes(status) || !required(note, 2000) || !required(actorUserId, 140)) {
    throw new NonconformityError("Transição inválida. Informe a ação, evidência ou justificativa da revisão.");
  }
  record.status = status;
  record.revision += 1;
  record.history.push({ status, note: note.trim(), actorUserId, occurredAt: new Date().toISOString() });
  write(data);
  return structuredClone(record);
}
