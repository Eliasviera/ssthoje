import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TenantRole } from "./tenant-access";

export type PgrStatus = "draft" | "in_review" | "approved";
export type PgrHistoryEntry = { id: string; action: PgrStatus | "updated"; occurredAt: string; actorUserId: string; actorRole: TenantRole; note?: string };
export type PgrRevision = { version: number; companyId: string; unitId: string; title: string; activityDescription: string; riskInventory: string; actionPlan: string; savedAt: string; actorUserId: string; actorRole: TenantRole };
export type PgrDraft = {
  id: string; tenantId: string; companyId: string; unitId: string; title: string;
  activityDescription: string; riskInventory: string; actionPlan: string;
  status: PgrStatus; authorUserId: string; reviewerUserId?: string; reviewerRole?: TenantRole;
  revision: number; revisions: PgrRevision[]; createdAt: string; updatedAt: string; history: PgrHistoryEntry[];
};
export type PgrInput = Pick<PgrDraft, "companyId" | "unitId" | "title" | "activityDescription" | "riskInventory" | "actionPlan">;

function storePath() { return join(process.cwd(), "data", "pgr-drafts.json"); }
function readAll(): PgrDraft[] {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!Array.isArray(value)) throw new Error("O arquivo local de PGR tem formato inválido.");
    return value as PgrDraft[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
function writeAll(records: PgrDraft[]) {
  const path = storePath(); mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temp, path);
}
function clone(record: PgrDraft): PgrDraft { return { ...record, revision: record.revision ?? 1, revisions: (record.revisions ?? []).map((entry) => ({ ...entry })), history: record.history.map((entry) => ({ ...entry })) }; }

export function listPgrDraftsForTenant(tenantId: string) {
  return readAll().filter((record) => record.tenantId === tenantId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone);
}

export function savePgrDraft(tenantId: string, input: PgrInput, actor: { userId: string; role: TenantRole }, draftId?: string, expectedRevision?: number): PgrDraft | null {
  const records = readAll();
  const now = new Date().toISOString();
  const existing = draftId ? records.find((record) => record.id === draftId && record.tenantId === tenantId) : undefined;
  if (draftId && (!existing || existing.status !== "draft" || !Number.isSafeInteger(expectedRevision) || (existing.revision ?? 1) !== expectedRevision || existing.companyId !== input.companyId || existing.unitId !== input.unitId)) return null;
  if (existing) {
    existing.revision = (existing.revision ?? 1) + 1;
    existing.revisions ??= [{ companyId: existing.companyId, unitId: existing.unitId, title: existing.title, activityDescription: existing.activityDescription, riskInventory: existing.riskInventory, actionPlan: existing.actionPlan, version: existing.revision - 1, savedAt: existing.updatedAt, actorUserId: existing.authorUserId, actorRole: actor.role }];
    Object.assign(existing, input, { updatedAt: now });
    existing.revisions.push({ ...input, version: existing.revision, savedAt: now, actorUserId: actor.userId, actorRole: actor.role });
    existing.history.push({ id: randomUUID(), action: "updated", occurredAt: now, actorUserId: actor.userId, actorRole: actor.role });
    writeAll(records); return clone(existing);
  }
  const record: PgrDraft = {
    ...input, id: randomUUID(), tenantId, status: "draft", authorUserId: actor.userId,
    revision: 1, revisions: [{ ...input, version: 1, savedAt: now, actorUserId: actor.userId, actorRole: actor.role }], createdAt: now, updatedAt: now,
    history: [{ id: randomUUID(), action: "draft", occurredAt: now, actorUserId: actor.userId, actorRole: actor.role }],
  };
  writeAll([...records, record]); return clone(record);
}

export function transitionPgrDraft(tenantId: string, draftId: string, next: "in_review" | "approved", actor: { userId: string; role: TenantRole }, expectedRevision: number): PgrDraft | null {
  const records = readAll();
  const record = records.find((entry) => entry.id === draftId && entry.tenantId === tenantId);
  if (!record || !Number.isSafeInteger(expectedRevision) || (record.revision ?? 1) !== expectedRevision || (next === "in_review" && record.status !== "draft") || (next === "approved" && record.status !== "in_review")) return null;
  const now = new Date().toISOString(); record.status = next; record.updatedAt = now;
  record.revision = (record.revision ?? 1) + 1;
  if (next === "approved") { record.reviewerUserId = actor.userId; record.reviewerRole = actor.role; }
  record.history.push({ id: randomUUID(), action: next, occurredAt: now, actorUserId: actor.userId, actorRole: actor.role });
  writeAll(records); return clone(record);
}
