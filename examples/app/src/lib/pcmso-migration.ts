import type { PcmsoRecord } from "./pcmso-store";

export type PcmsoMigrationIssue = { severity: "blocker"; code: string; index: number };

export function analyzePcmsoMigration(source: unknown, companyScopes: ReadonlySet<string>) {
  const issues: PcmsoMigrationIssue[] = [];
  if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray((source as { records?: unknown }).records)) {
    return { total: 0, ready: 0, blocked: 1, issues: [{ severity: "blocker" as const, code: "invalid_source", index: -1 }] };
  }

  const records = (source as { records: unknown[] }).records;
  const ids = new Set<string>();
  const scopes = new Set<string>();
  for (const [index, value] of records.entries()) {
    const record = value as Partial<PcmsoRecord> | null;
    let code: string | undefined;
    if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id.trim() || record.id.length > 200
      || typeof record.tenantId !== "string" || !record.tenantId.trim() || typeof record.companyId !== "string" || !record.companyId.trim()
      || typeof record.unitId !== "string" || !record.unitId.trim() || typeof record.coordinatorId !== "string" || !record.coordinatorId.trim()
      || !["draft", "in_review", "reviewed"].includes(String(record.status)) || !Number.isSafeInteger(record.version) || (record.version ?? -1) < 0
      || typeof record.content !== "string" || record.content.length > 12000
      || !validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt)
      || !Array.isArray(record.revisions) || !Array.isArray(record.history)) code = "invalid_record";
    else if (!companyScopes.has(`${record.tenantId}\u0000${record.companyId}\u0000${record.unitId}`)) code = "scope_missing";
    else if (ids.has(record.id)) code = "duplicate_id";
    else if (scopes.has(`${record.tenantId}\u0000${record.companyId}\u0000${record.unitId}`)) code = "duplicate_scope";
    else if (record.pgrRiskLink !== undefined) code = "unsupported_link_snapshot";
    else if (!validRevisions(record) || !validHistory(record)) code = "history_invalid";

    if (code) issues.push({ severity: "blocker", code, index });
    else {
      ids.add(record!.id!);
      scopes.add(`${record!.tenantId}\u0000${record!.companyId}\u0000${record!.unitId}`);
    }
  }
  const blocked = issues.length;
  return { total: records.length, ready: records.length - blocked, blocked, issues };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validRevisions(record: Partial<PcmsoRecord>): boolean {
  const revisions = record.revisions;
  if (!Array.isArray(revisions) || revisions.length !== record.version) return false;
  for (const [index, revision] of revisions.entries()) {
    if (!revision || revision.version !== index + 1 || typeof revision.content !== "string" || !revision.content.trim()
      || revision.content.length > 12000 || typeof revision.actorUserId !== "string" || !revision.actorUserId.trim()
      || !validTimestamp(revision.savedAt)) return false;
  }
  if (record.version === 0) return record.status === "draft" && record.content === "";
  return revisions.at(-1)?.content === record.content;
}

function validHistory(record: Partial<PcmsoRecord>): boolean {
  if (!Array.isArray(record.history) || record.history.length === 0 || !record.history.every((event) => event
    && ["assigned", "save", "submit", "review"].includes(event.action)
    && typeof event.actorUserId === "string" && Boolean(event.actorUserId.trim())
    && validTimestamp(event.occurredAt))) return false;
  if (record.history.filter((event) => event.action === "save").length !== record.version) return false;
  const lastAction = [...record.history].reverse().find((event) => event.action !== "assigned")?.action ?? "assigned";
  return record.status === "reviewed" ? lastAction === "review"
    : record.status === "in_review" ? lastAction === "submit"
      : record.status === "draft" && (lastAction === "assigned" || lastAction === "save");
}
