import "server-only";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
export type WorkingKind = "role" | "risk" | "action";
export type WorkingFields = { name: string; sector: string; role: string; activity: string; description: string; harm: string; controls: string; evidence: string; responsible?: string; priority?: string; objective?: string; startDate?: string; endDate?: string };
export type WorkingEntry = { id: string; kind: WorkingKind; fields: WorkingFields; reason: string; revision: number; actorUserId: string; savedAt: string };
function file(tenantId: string, companyId: string, hash: string) {
  if (![tenantId, companyId].every(value => /^[a-zA-Z0-9_-]{1,140}$/.test(value)) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Origem inválida.");
  return join(process.cwd(), "data", "pgr-working", tenantId, companyId, `${hash}.jsonl`);
}
export function readWorkingHistory(tenantId: string, companyId: string, hash: string): WorkingEntry[] {
  try { return readFileSync(file(tenantId, companyId, hash), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export function saveWorkingEntry(tenantId: string, companyId: string, hash: string, input: { id: string; kind: WorkingKind; fields: WorkingFields; reason: string; actorUserId: string }, expected: number) {
  const path = file(tenantId, companyId, hash);
  if (!["role", "risk", "action"].includes(input.kind) || !input.actorUserId || !input.fields.name.trim() || !input.fields.evidence.trim() || !input.reason.trim() || input.reason.length > 2000 || Object.values(input.fields).some(value => typeof value !== "string" || value.length > 3000) || !Number.isSafeInteger(expected) || expected < 0) throw new Error("Preencha nome/perigo, evidência e motivo. Respeite os limites dos campos.");
  if (input.id && !new RegExp(`^${input.kind}:(?:[0-9]+|new-[a-f0-9-]{36})$`).test(input.id)) throw new Error("Item inválido.");
  const id = input.id || `${input.kind}:new-${randomUUID()}`;
  const previous = readWorkingHistory(tenantId, companyId, hash).filter(entry => entry.id === id).at(-1);
  if ((previous?.revision ?? 0) !== expected) throw new Error("O item mudou. Atualize a página antes de salvar.");
  const entry: WorkingEntry = { ...input, id, revision: expected + 1, savedAt: new Date().toISOString() };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}
