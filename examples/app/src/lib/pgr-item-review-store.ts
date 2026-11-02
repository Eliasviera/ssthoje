import "server-only";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePgrReviewTarget } from "./pgr-review-target";

export type PgrItemReview = { itemKey: string; status: "checked" | "adjustment" | "pending"; note: string; revision: number; actorUserId: string; savedAt: string };
function pathFor(tenantId: string, companyId: string, sha256: string) {
  if (![tenantId, companyId].every(value => /^[a-zA-Z0-9_-]{1,140}$/.test(value)) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Origem inválida.");
  return join(process.cwd(), "data", "pgr-item-reviews", tenantId, companyId, `${sha256}.jsonl`);
}
export function readPgrItemReviews(tenantId: string, companyId: string, sha256: string): PgrItemReview[] {
  try { return readFileSync(pathFor(tenantId, companyId, sha256), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export function savePgrItemReview(tenantId: string, companyId: string, sha256: string, input: Omit<PgrItemReview, "revision" | "savedAt">, expectedRevision: number) {
  const path = pathFor(tenantId, companyId, sha256);
  if (!parsePgrReviewTarget(input.itemKey) || !["checked", "adjustment", "pending"].includes(input.status) || input.note.length > 3000 || (input.status === "adjustment" && !input.note.trim()) || !input.actorUserId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Revisão inválida. Descreva os ajustes necessários.");
  const entries = readPgrItemReviews(tenantId, companyId, sha256);
  const previous = entries.filter(entry => entry.itemKey === input.itemKey).at(-1);
  if ((previous?.revision ?? 0) !== expectedRevision) throw new Error("Este item mudou. Atualize a página antes de salvar.");
  const entry = { ...input, note: input.note.trim(), revision: expectedRevision + 1, savedAt: new Date().toISOString() };
  mkdirSync(join(path, ".."), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}
