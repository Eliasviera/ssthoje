import assert from "node:assert/strict";
import pg from "pg";
import { changeSiteContentPostgres, getSiteEditorPostgres, getPublicSiteContentPostgres } from "../src/lib/site-postgres-store.ts";
import { DEFAULT_SITE_CONTENT } from "../src/lib/site-content.ts";
import { loadAdminPostgresConfig, loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const admin = new Pool({ ...loadAdminPostgresConfig(), max: 2 });
const runtime = new Pool({ ...loadRuntimePostgresConfig(), max: 3 });
const lockClient = await admin.connect();
const master = "sst-demo-master";
let fixtureStarted = false;
let historyFailureTrigger = false;

try {
  const lock = await lockClient.query("SELECT pg_try_advisory_lock(22023, 1) AS acquired");
  assert.equal(lock.rows[0].acquired, true, "outra verificação do CMS está em execução");
  const existing = await lockClient.query(
    "SELECT (SELECT count(*) FROM sst.site_cms_state)::int AS state, (SELECT count(*) FROM sst.site_cms_history)::int AS history",
  );
  assert.equal(existing.rows[0].state, 0, "a tabela de estado CMS já contém dados; a verificação não alterou nada");
  assert.equal(existing.rows[0].history, 0, "o histórico CMS já contém dados; a verificação não alterou nada");
  fixtureStarted = true;

  const initial = await getSiteEditorPostgres(runtime, master);
  assert.equal(initial.draft.revision, 0);
  assert.deepEqual(initial.draft.content, DEFAULT_SITE_CONTENT);
  assert.equal(initial.history.length, 0);

  const first = { ...structuredClone(DEFAULT_SITE_CONTENT), headline: "CMS M22 verificação fictícia" };
  await changeSiteContentPostgres(runtime, master, "save", 0, "Fixture local M22", first);
  assert.equal((await getPublicSiteContentPostgres(runtime)).headline, DEFAULT_SITE_CONTENT.headline);

  await lockClient.query(`
    CREATE OR REPLACE FUNCTION sst.reject_site_cms_verify_history() RETURNS trigger
    LANGUAGE plpgsql AS $function$
    BEGIN RAISE EXCEPTION 'fixture de rollback CMS' USING ERRCODE = 'P0001'; END
    $function$
  `);
  await lockClient.query(`
    CREATE TRIGGER site_cms_verify_reject_history
    BEFORE INSERT ON sst.site_cms_history
    FOR EACH ROW EXECUTE FUNCTION sst.reject_site_cms_verify_history()
  `);
  historyFailureTrigger = true;
  const rollbackContent = { ...first, headline: "Não deve persistir" };
  await assert.rejects(
    changeSiteContentPostgres(runtime, master, "save", 1, "Falha controlada", rollbackContent),
    /fixture de rollback CMS/,
  );
  await lockClient.query("DROP TRIGGER site_cms_verify_reject_history ON sst.site_cms_history");
  await lockClient.query("DROP FUNCTION sst.reject_site_cms_verify_history()");
  historyFailureTrigger = false;
  let state = await getSiteEditorPostgres(runtime, master);
  assert.equal(state.draft.revision, 1, "falha no histórico não reverteu a alteração do estado");
  assert.equal(state.history.length, 1, "falha no histórico deixou evento parcial");

  const candidates = [
    { ...first, headline: "Concorrência A fictícia" },
    { ...first, headline: "Concorrência B fictícia" },
  ];
  const concurrent = await Promise.allSettled(candidates.map((content) =>
    changeSiteContentPostgres(runtime, master, "save", 1, "Concorrência local M22", content)));
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  state = await getSiteEditorPostgres(runtime, master);
  assert.equal(state.draft.revision, 2, "as duas gravações concorrentes não foram serializadas por revisão");
  assert.equal(state.history.length, 2, "concorrência gravou evento ausente ou duplicado");

  await changeSiteContentPostgres(runtime, master, "publish", 2, "Publicação fictícia M22");
  state = await getSiteEditorPostgres(runtime, master);
  assert.deepEqual(state.published, state.draft);
  assert.equal(state.history.length, 3);
  console.log("CMS PostgreSQL: escrita e histórico atômicos; rollback validado; concorrência serializada; publicação preservada.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha na verificação CMS PostgreSQL.");
  process.exitCode = 1;
} finally {
  if (historyFailureTrigger) {
    try { await lockClient.query("DROP TRIGGER IF EXISTS site_cms_verify_reject_history ON sst.site_cms_history"); } catch {}
    try { await lockClient.query("DROP FUNCTION IF EXISTS sst.reject_site_cms_verify_history()"); } catch {}
  }
  if (fixtureStarted) {
    try { await lockClient.query("TRUNCATE sst.site_cms_history, sst.site_cms_state"); }
    catch { process.exitCode = 1; console.error("Não foi possível limpar as fixtures CMS da verificação."); }
  }
  try { await lockClient.query("SELECT pg_advisory_unlock(22023, 1)"); } catch {}
  lockClient.release();
  await runtime.end();
  await admin.end();
}
