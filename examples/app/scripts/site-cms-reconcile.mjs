import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { validateSiteContent } from "../src/lib/site-content.ts";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const sourcePath = join(process.cwd(), "data", "site-content.json");

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function snapshot(value, nullable = false) {
  if (nullable && value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error("snapshot local inválido");
  }
  const content = validateSiteContent(value.content);
  if (stable(content) !== stable(value.content)) throw new Error("snapshot local requer normalização");
  return { revision: value.revision, content };
}

function localState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.history)) {
    throw new Error("estado local CMS inválido");
  }
  return {
    draft: snapshot(value.draft),
    published: snapshot(value.published, true),
    history: value.history.map((event) => ({
      id: event.id,
      operation: event.operation,
      actorUserId: event.actorUserId,
      occurredAt: new Date(event.occurredAt).toISOString(),
      reason: event.reason,
      before: snapshot(event.before, event.operation === "publish"),
      after: snapshot(event.after),
    })),
  };
}

const pool = new Pool(loadRuntimePostgresConfig());
let client;
let transactionOpen = false;
try {
  const raw = await readFile(sourcePath);
  const sourceHash = createHash("sha256").update(raw).digest("hex");
  const expected = localState(JSON.parse(raw.toString("utf8")));
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  transactionOpen = true;
  const stateResult = await client.query(
    `SELECT draft_revision, draft_content, published_revision, published_content
     FROM sst.site_cms_state WHERE singleton = true`,
  );
  assert.equal(stateResult.rowCount, 1, "a linha de estado CMS no PostgreSQL não corresponde ao snapshot");
  const row = stateResult.rows[0];
  const actualState = {
    draft: { revision: Number(row.draft_revision), content: validateSiteContent(row.draft_content) },
    published: row.published_revision === null || row.published_content === null
      ? null
      : { revision: Number(row.published_revision), content: validateSiteContent(row.published_content) },
  };
  assert.equal(stable(actualState), stable({ draft: expected.draft, published: expected.published }), "estado CMS diverge do JSON local");

  const historyResult = await client.query(
    `SELECT id, operation, actor_user_id, occurred_at, reason, before_snapshot, after_snapshot
     FROM sst.site_cms_history ORDER BY occurred_at, id`,
  );
  const actualHistory = historyResult.rows.map((event) => ({
    id: event.id,
    operation: event.operation,
    actorUserId: event.actor_user_id,
    occurredAt: new Date(event.occurred_at).toISOString(),
    reason: event.reason,
    before: event.before_snapshot,
    after: event.after_snapshot,
  }));
  assert.equal(stable(actualHistory), stable(expected.history), "histórico CMS diverge do JSON local");
  await client.query("COMMIT");
  transactionOpen = false;
  console.log("Reconciliação CMS concluída em transação somente leitura; conteúdo não exibido.");
  console.log(`Rascunho/publicação: revisão ${expected.draft.revision}/${expected.published?.revision ?? "ausente"}.`);
  console.log(`Histórico: ${actualHistory.length} eventos; SHA-256 JSON ${sourceHash}.`);
} catch (error) {
  if (transactionOpen) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  console.error(error instanceof Error ? error.message : "Falha na reconciliação CMS.");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
