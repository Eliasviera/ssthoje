import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { validateSiteContent } from "../src/lib/site-content.ts";
import { loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const sourcePath = join(process.cwd(), "data", "site-content.json");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseSnapshot(value, nullable = false) {
  if (nullable && value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error("snapshot ausente ou inválido");
  }
  const content = validateSiteContent(value.content);
  if (stable(content) !== stable(value.content)) throw new Error("snapshot requer normalização e não pode ser importado sem revisão");
  return { revision: value.revision, content };
}

function parseSource(text) {
  const state = JSON.parse(text);
  if (!state || typeof state !== "object" || Array.isArray(state) || !Array.isArray(state.history)) {
    throw new Error("o arquivo não corresponde ao contrato CMS");
  }
  const draft = parseSnapshot(state.draft);
  const published = parseSnapshot(state.published, true);
  const ids = new Set();
  const history = state.history.map((event) => {
    if (!event || typeof event !== "object" || !uuidPattern.test(event.id) || ids.has(event.id)
      || !["save", "publish"].includes(event.operation)
      || typeof event.actorUserId !== "string" || !event.actorUserId.trim() || event.actorUserId.length > 200
      || typeof event.reason !== "string" || !event.reason.trim() || event.reason.length > 600
      || !Number.isFinite(Date.parse(event.occurredAt))) {
      throw new Error("evento de histórico ausente ou inválido");
    }
    ids.add(event.id);
    const before = parseSnapshot(event.before, event.operation === "publish");
    if (event.operation === "save" && before === null) throw new Error("evento save sem snapshot anterior");
    return { ...event, occurredAt: new Date(event.occurredAt).toISOString(), before, after: parseSnapshot(event.after) };
  });
  return { draft, published, history };
}

if (!process.argv.includes("--apply")) {
  console.error("Importação não executada. Revise e execute novamente com --apply após autorização.");
  process.exitCode = 2;
} else {
  const pool = new Pool(loadRuntimePostgresConfig());
  let client;
  let transactionOpen = false;
  try {
    const raw = await readFile(sourcePath);
    const sourceHash = digest(raw);
    const source = parseSource(raw.toString("utf8"));
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(22023, 2)");

    const counts = await client.query(
      `SELECT (SELECT count(*) FROM sst.site_cms_state)::int AS state,
              (SELECT count(*) FROM sst.site_cms_history)::int AS history`,
    );
    assert.deepEqual(counts.rows[0], { state: 0, history: 0 }, "as tabelas CMS não estão vazias; nenhum dado foi alterado");

    await client.query(
      `INSERT INTO sst.site_cms_state
       (singleton, draft_revision, draft_content, published_revision, published_content)
       VALUES (true, $1, $2::jsonb, $3, $4::jsonb)`,
      [source.draft.revision, JSON.stringify(source.draft.content), source.published?.revision ?? null,
        source.published ? JSON.stringify(source.published.content) : null],
    );

    for (const event of source.history) {
      await client.query(
        `INSERT INTO sst.site_cms_history
         (id, operation, actor_user_id, occurred_at, reason, before_snapshot, after_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [event.id, event.operation, event.actorUserId, event.occurredAt, event.reason,
          event.before ? JSON.stringify(event.before) : null, JSON.stringify(event.after)],
      );
    }

    const persistedState = await client.query(
      `SELECT draft_revision, draft_content, published_revision, published_content
       FROM sst.site_cms_state WHERE singleton = true`,
    );
    const row = persistedState.rows[0];
    assert.ok(row, "estado CMS não foi gravado");
    assert.equal(Number(row.draft_revision), source.draft.revision);
    assert.deepEqual(row.draft_content, source.draft.content);
    assert.equal(row.published_revision === null ? null : Number(row.published_revision), source.published?.revision ?? null);
    assert.deepEqual(row.published_content, source.published?.content ?? null);

    const persistedHistory = await client.query(
      `SELECT id, operation, actor_user_id, occurred_at, reason, before_snapshot, after_snapshot
       FROM sst.site_cms_history ORDER BY occurred_at, id`,
    );
    assert.equal(persistedHistory.rowCount, source.history.length);
    for (let index = 0; index < source.history.length; index += 1) {
      const expected = source.history[index];
      const actual = persistedHistory.rows[index];
      assert.equal(actual.id, expected.id);
      assert.equal(actual.operation, expected.operation);
      assert.equal(actual.actor_user_id, expected.actorUserId);
      assert.equal(new Date(actual.occurred_at).toISOString(), expected.occurredAt);
      assert.equal(actual.reason, expected.reason);
      assert.deepEqual(actual.before_snapshot, expected.before);
      assert.deepEqual(actual.after_snapshot, expected.after);
    }

    await client.query("COMMIT");
    transactionOpen = false;
    console.log("Importação CMS local confirmada; a fonte JSON e o app ativo não foram alterados.");
    console.log(`Rascunho/publicação: revisão ${source.draft.revision}/${source.published?.revision ?? "ausente"}.`);
    console.log(`Histórico reconciliado: ${source.history.length} eventos; SHA-256 da fonte ${sourceHash}.`);
  } catch (error) {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    console.error(error instanceof Error ? error.message : "Importação CMS interrompida; transação revertida.");
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
