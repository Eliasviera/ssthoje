import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WORK_PERMIT_SOURCE_FIELD_MAPS } from "./work-permit-source-field-maps";
import { getPostgresPool } from "./postgres";
import { withCurrentTenantReadTransaction } from "./tenant-read-transaction";
import { withCurrentTenantWriteTransaction } from "./tenant-write-transaction";

export type WorkPermitDraft = {
  id: string;
  tenantId: string;
  mapId: (typeof WORK_PERMIT_SOURCE_FIELD_MAPS)[number]["id"];
  aprId?: string;
  title: string;
  values: Record<string, string>;
  status: "draft_demo";
  revision: number;
  revisionHistory?: WorkPermitDraftRevision[];
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type WorkPermitDraftRevision = {
  revision: number;
  actorUserId: string;
  occurredAt: string;
  snapshot?: WorkPermitDraftSnapshot;
};

type WorkPermitDraftSnapshot = Pick<WorkPermitDraft, "mapId" | "aprId" | "title" | "values" | "status">;
export type WorkPermitDraftHistoricalRevision = WorkPermitDraftSnapshot & {
  revision: number; occurredAt: string;
};
export type WorkPermitDraftRevisionsPair = {
  draftId: string;
  mapId: WorkPermitDraft["mapId"];
  left: WorkPermitDraftHistoricalRevision;
  right: WorkPermitDraftHistoricalRevision;
};
function snapshotOf(draft: WorkPermitDraft): WorkPermitDraftSnapshot {
  return { mapId: draft.mapId, ...(draft.aprId ? { aprId: draft.aprId } : {}), title: draft.title, values: { ...draft.values }, status: draft.status };
}

export async function getWorkPermitDraftRevisionsPair(
  tenantId: string,
  draftId: string,
  revisionA: number,
  revisionB: number,
): Promise<WorkPermitDraftRevisionsPair | null> {
  if (!Number.isSafeInteger(revisionA) || revisionA < 1 || revisionA > 2147483647) return null;
  if (!Number.isSafeInteger(revisionB) || revisionB < 1 || revisionB > 2147483647) return null;
  if (revisionA === revisionB) return null;
  if (typeof draftId !== "string" || draftId.length === 0 || draftId.length > 36) return null;
  const [left, right] = await Promise.all([
    getWorkPermitDraftRevision(tenantId, draftId, revisionA),
    getWorkPermitDraftRevision(tenantId, draftId, revisionB),
  ]);
  if (!left || !right) return null;
  if (left.mapId !== right.mapId) return null;
  return { draftId, mapId: left.mapId, left, right };
}

export async function getWorkPermitDraftRevision(tenantId: string, draftId: string, revision: number): Promise<WorkPermitDraftHistoricalRevision | null> {
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 2147483647) return null;
  if (getPostgresPool()) {
    return withCurrentTenantReadTransaction("pgr.manage", tenantId, async (client, context) => {
      const result = await client.query<{ snapshot: WorkPermitDraftSnapshot; revision: number; occurred_at: Date | string }>(
        `SELECT snapshot, revision, occurred_at FROM sst.work_permit_draft_revisions
         WHERE tenant_id = $1 AND draft_id = $2 AND revision = $3`, [context.tenantId, draftId, revision],
      );
      const row = result.rows[0];
      return row ? { ...row.snapshot, values: { ...row.snapshot.values }, revision: Number(row.revision), occurredAt: new Date(row.occurred_at).toISOString() } : null;
    });
  }
  const draft = readAll().find((item) => item.tenantId === tenantId && item.id === draftId);
  const entry = draft?.revisionHistory?.find((item) => item.revision === revision);
  // Old JSON entries contain dates only. Never substitute today's data for history.
  return entry?.snapshot ? { ...entry.snapshot, values: { ...entry.snapshot.values }, revision, occurredAt: entry.occurredAt } : null;
}

function path() { return join(process.cwd(), "data", "work-permit-drafts.json"); }

function readAll(): WorkPermitDraft[] {
  try {
    const value: unknown = JSON.parse(readFileSync(path(), "utf8"));
    if (!Array.isArray(value)) throw new Error("O arquivo local de rascunhos PT/PTE tem formato inválido.");
    return value as WorkPermitDraft[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(drafts: WorkPermitDraft[]) {
  const target = path();
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(drafts, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, target);
}

type WorkPermitDraftRow = {
  id: string;
  tenant_id: string;
  map_id: WorkPermitDraft["mapId"];
  apr_id: string | null;
  title: string;
  field_values: Record<string, string>;
  status: "draft_demo";
  revision: number | string;
  created_at: Date | string;
  created_by: string;
  updated_at: Date | string | null;
  updated_by: string | null;
};

type WorkPermitDraftRevisionRow = {
  draft_id?: string;
  revision: number | string;
  actor_user_id: string;
  occurred_at: Date | string;
};

function fromRow(row: WorkPermitDraftRow): WorkPermitDraft {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    mapId: row.map_id,
    ...(row.apr_id ? { aprId: row.apr_id } : {}),
    title: row.title,
    values: row.field_values,
    status: row.status,
    revision: Number(row.revision),
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by,
    ...(row.updated_at ? { updatedAt: new Date(row.updated_at).toISOString() } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

export async function listWorkPermitDrafts(tenantId: string): Promise<WorkPermitDraft[]> {
  if (getPostgresPool()) {
    return withCurrentTenantReadTransaction("pgr.manage", tenantId, async (client, context) => {
      const result = await client.query<WorkPermitDraftRow>(
        `SELECT id, tenant_id, map_id, apr_id, title, field_values, status, revision, created_at, created_by, updated_at, updated_by
         FROM sst.work_permit_drafts WHERE tenant_id = $1
         ORDER BY COALESCE(updated_at, created_at) DESC, id`, [context.tenantId],
      );
      const history = await client.query<WorkPermitDraftRevisionRow>(
        `SELECT draft_id, revision, actor_user_id, occurred_at FROM sst.work_permit_draft_revisions
         WHERE tenant_id = $1 ORDER BY draft_id, revision DESC`, [context.tenantId],
      );
      const byDraft = new Map<string, WorkPermitDraftRevision[]>();
      for (const row of history.rows) {
        if (!row.draft_id) continue;
        const entries = byDraft.get(row.draft_id) ?? [];
        entries.push({ revision: Number(row.revision), actorUserId: row.actor_user_id, occurredAt: new Date(row.occurred_at).toISOString() });
        byDraft.set(row.draft_id, entries);
      }
      return result.rows.map((row) => ({ ...fromRow(row), revisionHistory: byDraft.get(row.id) ?? [] }));
    });
  }
  return readAll().filter((draft) => draft.tenantId === tenantId)
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .map((draft) => ({ ...draft, revision: draft.revision ?? 1, values: { ...draft.values }, revisionHistory: [...(draft.revisionHistory ?? [])] }));
}

export async function getWorkPermitDraft(tenantId: string, draftId: string): Promise<WorkPermitDraft | null> {
  if (getPostgresPool()) {
    return withCurrentTenantReadTransaction("pgr.manage", tenantId, async (client, context) => {
      const result = await client.query<WorkPermitDraftRow>(
        `SELECT id, tenant_id, map_id, apr_id, title, field_values, status, revision, created_at, created_by, updated_at, updated_by
         FROM sst.work_permit_drafts WHERE tenant_id = $1 AND id = $2`, [context.tenantId, draftId],
      );
      if (!result.rows[0]) return null;
      const history = await client.query<WorkPermitDraftRevisionRow>(
        `SELECT revision, actor_user_id, occurred_at FROM sst.work_permit_draft_revisions
         WHERE tenant_id = $1 AND draft_id = $2 ORDER BY revision DESC`, [context.tenantId, draftId],
      );
      return { ...fromRow(result.rows[0]), revisionHistory: history.rows.map((row) => ({
        revision: Number(row.revision), actorUserId: row.actor_user_id, occurredAt: new Date(row.occurred_at).toISOString(),
      })) };
    });
  }
  const draft = readAll().find((item) => item.tenantId === tenantId && item.id === draftId);
  return draft ? { ...draft, revision: draft.revision ?? 1, values: { ...draft.values }, revisionHistory: [...(draft.revisionHistory ?? [])] } : null;
}

export async function createWorkPermitDraft(input: Omit<WorkPermitDraft, "id" | "status" | "revision" | "revisionHistory" | "createdAt">): Promise<WorkPermitDraft> {
  const createdAt = new Date().toISOString();
  const draft: WorkPermitDraft = {
    ...input,
    id: randomUUID(),
    status: "draft_demo",
    revision: 1,
    revisionHistory: [{ revision: 1, actorUserId: input.createdBy, occurredAt: createdAt }],
    createdAt,
  };
  if (getPostgresPool()) {
    return withCurrentTenantWriteTransaction("pgr.manage", input.tenantId, async (client, context) => {
      const result = await client.query<WorkPermitDraftRow>(
        `INSERT INTO sst.work_permit_drafts (tenant_id, id, map_id, apr_id, title, field_values, status, revision, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'draft_demo', 1, $7, $8)
         RETURNING id, tenant_id, map_id, apr_id, title, field_values, status, revision, created_at, created_by, updated_at, updated_by`,
        [context.tenantId, draft.id, draft.mapId, draft.aprId ?? null, draft.title, JSON.stringify(draft.values), draft.createdAt, context.userId],
      );
      const saved = fromRow(result.rows[0]);
      await client.query(
        `INSERT INTO sst.work_permit_draft_revisions (tenant_id, draft_id, revision, snapshot, actor_user_id, occurred_at)
         VALUES ($1, $2, 1, $3::jsonb, $4, $5)`,
        [context.tenantId, saved.id, JSON.stringify({ mapId: saved.mapId, aprId: saved.aprId ?? null, title: saved.title, values: saved.values, status: saved.status }), context.userId, saved.createdAt],
      );
      return { ...saved, revisionHistory: [{ revision: 1, actorUserId: context.userId, occurredAt: saved.createdAt }] };
    });
  }
  draft.revisionHistory![0].snapshot = snapshotOf(draft);
  writeAll([...readAll(), draft]);
  return { ...draft, values: { ...draft.values }, revisionHistory: [...(draft.revisionHistory ?? [])] };
}

export async function updateWorkPermitDraft(
  tenantId: string,
  draftId: string,
  input: { mapId: WorkPermitDraft["mapId"]; aprId?: string; title: string; values: Record<string, string>; updatedBy: string; expectedRevision: number },
): Promise<WorkPermitDraft | null> {
  if (getPostgresPool()) {
    return withCurrentTenantWriteTransaction("pgr.manage", tenantId, async (client, context) => {
      const result = await client.query<WorkPermitDraftRow>(
        `UPDATE sst.work_permit_drafts SET apr_id = $4, title = $5, field_values = $6::jsonb, revision = revision + 1, updated_at = clock_timestamp(), updated_by = $7
         WHERE tenant_id = $1 AND id = $2 AND map_id = $3 AND status = 'draft_demo' AND revision = $8
         RETURNING id, tenant_id, map_id, apr_id, title, field_values, status, revision, created_at, created_by, updated_at, updated_by`,
        [context.tenantId, draftId, input.mapId, input.aprId ?? null, input.title, JSON.stringify(input.values), context.userId, input.expectedRevision],
      );
      if (!result.rows[0]) return null;
      const saved = fromRow(result.rows[0]);
      const occurredAt = saved.updatedAt ?? new Date().toISOString();
      await client.query(
        `INSERT INTO sst.work_permit_draft_revisions (tenant_id, draft_id, revision, snapshot, actor_user_id, occurred_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [context.tenantId, saved.id, saved.revision, JSON.stringify({ mapId: saved.mapId, aprId: saved.aprId ?? null, title: saved.title, values: saved.values, status: saved.status }), context.userId, occurredAt],
      );
      const history = await client.query<WorkPermitDraftRevisionRow>(
        `SELECT revision, actor_user_id, occurred_at FROM sst.work_permit_draft_revisions
         WHERE tenant_id = $1 AND draft_id = $2 ORDER BY revision DESC`, [context.tenantId, saved.id],
      );
      return { ...saved, revisionHistory: history.rows.map((row) => ({ revision: Number(row.revision), actorUserId: row.actor_user_id, occurredAt: new Date(row.occurred_at).toISOString() })) };
    });
  }
  const drafts = readAll();
  const index = drafts.findIndex((draft) => draft.id === draftId && draft.tenantId === tenantId && draft.status === "draft_demo");
  if (index < 0 || drafts[index].mapId !== input.mapId || (drafts[index].revision ?? 1) !== input.expectedRevision) return null;
  const updatedAt = new Date().toISOString();
  const revision = (drafts[index].revision ?? 1) + 1;
  const updated: WorkPermitDraft = {
    ...drafts[index],
    aprId: input.aprId,
    title: input.title,
    values: { ...input.values },
    revision,
    updatedAt,
    updatedBy: input.updatedBy,
    revisionHistory: [...(drafts[index].revisionHistory ?? [{ revision: drafts[index].revision ?? 1, actorUserId: drafts[index].createdBy, occurredAt: drafts[index].createdAt }]), {
      revision, actorUserId: input.updatedBy, occurredAt: updatedAt,
    }],
  };
  updated.revisionHistory![updated.revisionHistory!.length - 1].snapshot = snapshotOf(updated);
  drafts[index] = updated;
  writeAll(drafts);
  return { ...updated, values: { ...updated.values } };
}
