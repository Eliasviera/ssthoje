import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { DEFAULT_SITE_CONTENT, validateSiteContent, type SiteContent } from "./site-content.ts";

type Snapshot = { revision: number; content: SiteContent };
type SiteHistory = {
  id: string;
  operation: "save" | "publish";
  actorUserId: string;
  occurredAt: string;
  reason: string;
  before: Snapshot | null;
  after: Snapshot;
};
export type PostgresSiteState = { draft: Snapshot; published: Snapshot | null; history: SiteHistory[] };

type SiteStateRow = {
  draft_revision: number | string;
  draft_content: SiteContent;
  published_revision: number | string | null;
  published_content: SiteContent | null;
};
type SiteHistoryRow = {
  id: string;
  operation: "save" | "publish";
  actor_user_id: string;
  occurred_at: Date | string;
  reason: string;
  before_snapshot: Snapshot | null;
  after_snapshot: Snapshot;
};

function snapshot(revision: number | string, content: SiteContent): Snapshot {
  const value = Number(revision);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Estado CMS inválido no PostgreSQL.");
  return { revision: value, content: validateSiteContent(content) };
}

function stateFromRow(row: SiteStateRow): Omit<PostgresSiteState, "history"> {
  return {
    draft: snapshot(row.draft_revision, row.draft_content),
    published: row.published_revision === null || row.published_content === null
      ? null
      : snapshot(row.published_revision, row.published_content),
  };
}

function snapshotFromJson(value: Snapshot): Snapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Snapshot CMS inválido no PostgreSQL.");
  return snapshot(value.revision, value.content);
}

function historyFromRow(row: SiteHistoryRow): SiteHistory {
  return {
    id: row.id,
    operation: row.operation,
    actorUserId: row.actor_user_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    reason: row.reason,
    before: row.before_snapshot === null ? null : snapshotFromJson(row.before_snapshot),
    after: snapshotFromJson(row.after_snapshot),
  };
}

function missingState(): Omit<PostgresSiteState, "history"> {
  return { draft: { revision: 0, content: structuredClone(DEFAULT_SITE_CONTENT) }, published: null };
}

async function readState(client: PoolClient) {
  const result = await client.query<SiteStateRow>(
    `SELECT draft_revision, draft_content, published_revision, published_content
     FROM sst.site_cms_state WHERE singleton = true`,
  );
  return result.rows[0] ? stateFromRow(result.rows[0]) : missingState();
}

function validateOperation(operation: string, expectedRevision: number, reason: string) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
    || typeof reason !== "string" || !reason.trim() || reason.length > 600
    || !["save", "publish"].includes(operation)) {
    throw new Error("Confira a operação e informe uma justificativa fictícia de até 600 caracteres.");
  }
}

export async function getSiteEditorPostgres(pool: Pool, userId: string): Promise<PostgresSiteState> {
  requirePlatformMaster(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const state = await readState(client);
    const history = await client.query<SiteHistoryRow>(
      `SELECT id, operation, actor_user_id, occurred_at, reason, before_snapshot, after_snapshot
       FROM sst.site_cms_history ORDER BY occurred_at, id`,
    );
    await client.query("COMMIT");
    return { ...state, history: history.rows.map(historyFromRow) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function getPublicSiteContentPostgres(pool: Pool): Promise<SiteContent> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const state = await readState(client);
    await client.query("COMMIT");
    return structuredClone(state.published?.content ?? DEFAULT_SITE_CONTENT);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function changeSiteContentPostgres(
  pool: Pool,
  userId: string,
  operation: "save" | "publish",
  expectedRevision: number,
  reason: string,
  content?: SiteContent,
) {
  requirePlatformMaster(userId);
  throttle(userId);
  validateOperation(operation, expectedRevision, reason);
  const normalized = operation === "save" ? validateSiteContent(content!) : undefined;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO sst.site_cms_state (singleton, draft_content)
       VALUES (true, $1::jsonb) ON CONFLICT (singleton) DO NOTHING`,
      [JSON.stringify(DEFAULT_SITE_CONTENT)],
    );
    const result = await client.query<SiteStateRow>(
      `SELECT draft_revision, draft_content, published_revision, published_content
       FROM sst.site_cms_state WHERE singleton = true FOR UPDATE`,
    );
    const current = result.rows[0];
    if (!current) throw new Error("Estado CMS indisponível no PostgreSQL.");
    const state = stateFromRow(current);
    if (state.draft.revision !== expectedRevision) throw new Error("O rascunho mudou. Atualize a página e revise antes de continuar.");

    const before = structuredClone(operation === "save" ? state.draft : state.published);
    let draft = state.draft;
    let published = state.published;
    if (operation === "save") {
      if (JSON.stringify(normalized) === JSON.stringify(state.draft.content)) throw new Error("Nenhuma alteração informada.");
      draft = { revision: state.draft.revision + 1, content: normalized! };
    } else {
      if (state.published?.revision === state.draft.revision) throw new Error("Esta revisão já está publicada.");
      published = structuredClone(state.draft);
    }

    const event: SiteHistory = {
      id: randomUUID(), operation, actorUserId: userId, occurredAt: new Date().toISOString(),
      reason: reason.trim(), before, after: structuredClone(draft),
    };
    await client.query(
      `UPDATE sst.site_cms_state
       SET draft_revision = $1, draft_content = $2::jsonb,
           published_revision = $3, published_content = $4::jsonb,
           row_version = row_version + 1, updated_at = clock_timestamp()
       WHERE singleton = true`,
      [draft.revision, JSON.stringify(draft.content), published?.revision ?? null,
        published ? JSON.stringify(published.content) : null],
    );
    await client.query(
      `INSERT INTO sst.site_cms_history
       (id, operation, actor_user_id, occurred_at, reason, before_snapshot, after_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [event.id, event.operation, event.actorUserId, event.occurredAt, event.reason,
        event.before ? JSON.stringify(event.before) : null, JSON.stringify(event.after)],
    );
    await client.query("COMMIT");
    return event;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
