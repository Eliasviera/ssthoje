import type { PgrDraft, PgrHistoryEntry, PgrRevision } from "./pgr-store";
import type { PgrLegacySnapshot, PgrRiskInventory } from "./pgr-risk-inventory";
import { validatePgrRiskInventory } from "./pgr-risk-inventory";

function snapshotFromRevision(revision: PgrRevision): PgrLegacySnapshot {
  return {
    version: revision.version,
    title: revision.title,
    activityDescription: revision.activityDescription,
    riskInventory: revision.riskInventory,
    actionPlan: revision.actionPlan,
    savedAt: revision.savedAt,
    actorUserId: revision.actorUserId,
    actorRole: revision.actorRole,
  };
}

export function previewPgrLegacyMigration(draft: PgrDraft): PgrRiskInventory {
  const revisions = [...(draft.revisions ?? [])].sort((a, b) => a.version - b.version);
  const latest = revisions.at(-1);
  const currentMatchesLatest = latest
    && latest.title === draft.title
    && latest.activityDescription === draft.activityDescription
    && latest.riskInventory === draft.riskInventory
    && latest.actionPlan === draft.actionPlan;
  if (!currentMatchesLatest) {
    revisions.push({
      version: draft.revision ?? 1,
      companyId: draft.companyId,
      unitId: draft.unitId,
      title: draft.title,
      activityDescription: draft.activityDescription,
      riskInventory: draft.riskInventory,
      actionPlan: draft.actionPlan,
      savedAt: draft.updatedAt,
      actorUserId: draft.authorUserId,
      actorRole: draft.revisions?.at(-1)?.actorRole ?? "consultoria_admin",
    });
  }

  return {
    schemaVersion: 1,
    tenantId: draft.tenantId,
    companyId: draft.companyId,
    unitId: draft.unitId,
    revision: 1,
    title: draft.title,
    activityDescription: draft.activityDescription,
    actionPlan: draft.actionPlan,
    legacySource: {
      draftId: draft.id,
      status: draft.status,
      revision: draft.revision ?? 1,
      authorUserId: draft.authorUserId,
      ...(draft.reviewerUserId ? { reviewerUserId: draft.reviewerUserId } : {}),
      ...(draft.reviewerRole ? { reviewerRole: draft.reviewerRole } : {}),
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      snapshots: revisions.map(snapshotFromRevision),
      history: (draft.history ?? []).map((entry: PgrHistoryEntry) => ({ ...entry })),
    },
    items: [],
  };
}

export type PgrMigrationIssueCode =
  | "invalid_collection"
  | "invalid_record"
  | "duplicate_source_key"
  | "unresolved_company_unit"
  | "unsupported_status"
  | "invalid_current_revision"
  | "invalid_revision_history"
  | "duplicate_revision_version"
  | "snapshot_limit_exceeded"
  | "invalid_preview";

export type PgrMigrationReport = {
  total: number;
  ready: number;
  blocked: number;
  warnings: number;
  issues: Array<{ recordIndex: number; code: PgrMigrationIssueCode | "missing_revision_history" | "current_state_snapshot_added"; severity: "blocker" | "warning" }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function hasRequiredDraftShape(value: Record<string, unknown>) {
  return isNonEmptyString(value.id, 64)
    && isNonEmptyString(value.tenantId, 140)
    && isNonEmptyString(value.companyId, 140)
    && isNonEmptyString(value.unitId, 140)
    && isNonEmptyString(value.title, 140)
    && typeof value.activityDescription === "string"
    && typeof value.riskInventory === "string"
    && typeof value.actionPlan === "string"
    && typeof value.authorUserId === "string"
    && typeof value.updatedAt === "string";
}

export function analyzePgrMigration(input: unknown, allowedScopes?: ReadonlySet<string>): PgrMigrationReport {
  if (!Array.isArray(input)) {
    return { total: 0, ready: 0, blocked: 0, warnings: 0, issues: [{ recordIndex: -1, code: "invalid_collection", severity: "blocker" }] };
  }
  const records = input;
  const issues: PgrMigrationReport["issues"] = [];
  const sourceKeys = new Map<string, number>();
  const blockedIndexes = new Set<number>();
  let ready = 0;

  records.forEach((candidate, recordIndex) => {
    const addBlocker = (code: PgrMigrationIssueCode) => {
      issues.push({ recordIndex, code, severity: "blocker" });
      blockedIndexes.add(recordIndex);
    };
    if (!isRecord(candidate) || !hasRequiredDraftShape(candidate)) {
      addBlocker("invalid_record");
      return;
    }

    const sourceKey = `${candidate.tenantId}\u0000${candidate.id}`;
    if (sourceKeys.has(sourceKey)) addBlocker("duplicate_source_key");
    else sourceKeys.set(sourceKey, recordIndex);

    if (allowedScopes && !allowedScopes.has(`${candidate.tenantId}\u0000${candidate.companyId}\u0000${candidate.unitId}`)) addBlocker("unresolved_company_unit");

    if (!["draft", "in_review", "approved"].includes(String(candidate.status))) addBlocker("unsupported_status");
    if (!Number.isSafeInteger(candidate.revision) || (candidate.revision as number) < 1) addBlocker("invalid_current_revision");

    if (candidate.revisions === undefined || (Array.isArray(candidate.revisions) && candidate.revisions.length === 0)) {
      issues.push({ recordIndex, code: "missing_revision_history", severity: "warning" });
    } else if (!Array.isArray(candidate.revisions) || !candidate.revisions.every((entry) => isRecord(entry)
      && Number.isSafeInteger(entry.version) && (entry.version as number) > 0
      && typeof entry.title === "string" && typeof entry.activityDescription === "string"
      && typeof entry.riskInventory === "string" && typeof entry.actionPlan === "string"
      && typeof entry.savedAt === "string" && typeof entry.actorUserId === "string" && typeof entry.actorRole === "string")) {
      addBlocker("invalid_revision_history");
    } else {
      const versions = candidate.revisions.map((entry) => (entry as Record<string, unknown>).version);
      if (new Set(versions).size !== versions.length) addBlocker("duplicate_revision_version");
    }

    const revisions = Array.isArray(candidate.revisions) ? candidate.revisions : [];
    const textTooLong = (candidate.title as string).length > 140
      || (candidate.activityDescription as string).length > 3000
      || (candidate.riskInventory as string).length > 5000
      || (candidate.actionPlan as string).length > 5000;
    const historyTooLong = revisions.some((entry) => {
      if (!isRecord(entry)) return false;
      return (typeof entry.title === "string" && entry.title.length > 140)
        || (typeof entry.activityDescription === "string" && entry.activityDescription.length > 3000)
        || (typeof entry.riskInventory === "string" && entry.riskInventory.length > 5000)
        || (typeof entry.actionPlan === "string" && entry.actionPlan.length > 5000);
    });
    if (textTooLong || historyTooLong) addBlocker("snapshot_limit_exceeded");

    if (!blockedIndexes.has(recordIndex)) {
      try {
        const preview = previewPgrLegacyMigration(candidate as unknown as PgrDraft);
        if ("error" in validatePgrRiskInventory(preview)) addBlocker("invalid_preview");
        else {
          ready += 1;
          const latest = revisions.at(-1);
          const differs = !isRecord(latest) || latest.title !== candidate.title || latest.activityDescription !== candidate.activityDescription || latest.riskInventory !== candidate.riskInventory || latest.actionPlan !== candidate.actionPlan;
          if (revisions.length > 0 && differs) issues.push({ recordIndex, code: "current_state_snapshot_added", severity: "warning" });
        }
      } catch {
        addBlocker("invalid_preview");
      }
    }
  });

  return {
    total: records.length,
    ready,
    blocked: records.length - ready,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
}

export type PgrAuditMigrationReport = {
  total: number;
  ready: number;
  unlinked: number;
  blocked: number;
  issues: Array<{ eventIndex: number; code: "invalid_event" | "duplicate_event_id" | "cross_tenant_target" | "orphan_target" | "unlinked_event"; severity: "blocker" | "warning" }>;
};

export function analyzePgrAuditMigration(eventsInput: unknown, draftsInput: unknown): PgrAuditMigrationReport {
  const allEvents = Array.isArray(eventsInput) ? eventsInput : [];
  const drafts = Array.isArray(draftsInput) ? draftsInput.filter(isRecord) : [];
  const pgrEvents = allEvents.map((event, eventIndex) => ({ event, eventIndex }))
    .filter(({ event }) => isRecord(event) && typeof event.action === "string" && event.action.startsWith("pgr."));
  const draftTenants = new Map<string, Set<string>>();
  for (const draft of drafts) {
    if (typeof draft.id !== "string" || typeof draft.tenantId !== "string") continue;
    const tenants = draftTenants.get(draft.id) ?? new Set<string>();
    tenants.add(draft.tenantId);
    draftTenants.set(draft.id, tenants);
  }
  const ids = new Set<string>();
  const issues: PgrAuditMigrationReport["issues"] = [];
  let ready = 0;
  let unlinked = 0;
  for (const { event, eventIndex } of pgrEvents) {
    if (!isRecord(event) || !isNonEmptyString(event.id, 200) || !isNonEmptyString(event.tenantId, 140)
      || !isNonEmptyString(event.actorUserId, 200) || !isNonEmptyString(event.actorRole, 80)
      || !["pgr.created", "pgr.updated", "pgr.submitted", "pgr.approved"].includes(String(event.action))
      || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt))) {
      issues.push({ eventIndex, code: "invalid_event", severity: "blocker" });
      continue;
    }
    if (ids.has(event.id)) {
      issues.push({ eventIndex, code: "duplicate_event_id", severity: "blocker" });
      continue;
    }
    ids.add(event.id);
    if (event.targetId === undefined || event.targetId === null || event.targetId === "") {
      unlinked += 1;
      issues.push({ eventIndex, code: "unlinked_event", severity: "warning" });
      ready += 1;
      continue;
    }
    if (typeof event.targetId !== "string" || !event.targetId.trim() || event.targetId.length > 200) {
      issues.push({ eventIndex, code: "invalid_event", severity: "blocker" });
      continue;
    }
    const targetTenants = draftTenants.get(event.targetId);
    if (!targetTenants?.has(event.tenantId)) {
      const code = targetTenants?.size ? "cross_tenant_target" : "orphan_target";
      issues.push({ eventIndex, code, severity: "warning" });
    }
    ready += 1;
  }
  return { total: pgrEvents.length, ready, unlinked, blocked: pgrEvents.length - ready, issues };
}
