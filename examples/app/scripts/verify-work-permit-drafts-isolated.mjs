import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import pg from "pg";

// Dedicated disposable database; never reads the application's environment files.
const name = `sst-permit-proof-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }).trim();
let pool;
let started = false;
let checks = 0;
let stage = "sql";
async function transaction(tenant, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE sst_hoje_app");
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenant]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
async function save(title) {
  return transaction("tenant-a", async (client) => {
    const result = await client.query(`UPDATE sst.work_permit_drafts SET title=$1, revision=revision+1,
      updated_at=clock_timestamp(), updated_by='actor-test' WHERE tenant_id='tenant-a' AND id='draft-a' AND revision=1 RETURNING *`, [title]);
    if (!result.rowCount) return false;
    const row = result.rows[0];
    await client.query(`INSERT INTO sst.work_permit_draft_revisions VALUES ('tenant-a','draft-a',$1,$2::jsonb,'actor-test',now())`,
      [row.revision, JSON.stringify({ title: row.title, values: row.field_values, status: row.status })]);
    return true;
  });
}
try {
  docker(["run", "--rm", "-d", "--name", name, "-e", `POSTGRES_PASSWORD=${password}`, "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  started = true;
  const mapping = docker(["port", name, "5432/tcp"]).split(/\r?\n/)[0];
  const port = Number(mapping.slice(mapping.lastIndexOf(":") + 1));
  assert.ok(Number.isInteger(port) && port > 0);
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password, connectionTimeoutMillis: 1000, max: 4 });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await pool.query("SELECT 1"); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  assert.ok(ready, "PostgreSQL temporário indisponível");
  // Only the dependencies of migrations 0011/0012 are provisioned here.
  await pool.query("CREATE SCHEMA sst; CREATE ROLE sst_hoje_app NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA sst TO sst_hoje_app; CREATE TABLE sst.tenants(id text PRIMARY KEY); INSERT INTO sst.tenants VALUES ('tenant-a'),('tenant-b')");
  await pool.query(readFileSync(new URL("../db/migrations/0011_work_permit_drafts.sql", import.meta.url), "utf8"));
  await transaction("tenant-a", (client) => client.query(`INSERT INTO sst.work_permit_drafts
    (tenant_id,id,map_id,title,field_values,status,created_at,created_by)
    VALUES ('tenant-a','draft-a','pte-confined-space','Rascunho sintético','{"company":"Empresa fictícia"}','draft_demo',now(),'actor-test')`));
  await pool.query(readFileSync(new URL("../db/migrations/0012_work_permit_draft_revisions.sql", import.meta.url), "utf8"));
  const initial = await transaction("tenant-a", (client) => client.query("SELECT * FROM sst.work_permit_draft_revisions"));
  assert.equal(initial.rowCount, 1);
  assert.equal(initial.rows[0].snapshot.title, "Rascunho sintético"); checks++;
  await transaction("tenant-b", async (client) => {
    assert.equal((await client.query("SELECT * FROM sst.work_permit_drafts")).rowCount, 0);
    assert.equal((await client.query("SELECT * FROM sst.work_permit_draft_revisions")).rowCount, 0);
    assert.equal((await client.query("UPDATE sst.work_permit_drafts SET title='Intrusão'")).rowCount, 0);
  }); checks++;
  await assert.rejects(transaction("tenant-b", (client) => client.query(`INSERT INTO sst.work_permit_draft_revisions VALUES ('tenant-a','draft-a',9,'{}','actor-test',now())`)), { code: "42501" }); checks++;
  const results = await Promise.all([save("Edição sintética A"), save("Edição sintética B")]);
  assert.equal(results.filter(Boolean).length, 1); checks++;
  await transaction("tenant-a", async (client) => {
    const draft = (await client.query("SELECT * FROM sst.work_permit_drafts")).rows[0];
    const history = (await client.query("SELECT * FROM sst.work_permit_draft_revisions ORDER BY revision")).rows;
    assert.equal(draft.revision, 2);
    assert.equal(draft.status, "draft_demo");
    assert.deepEqual(history.map((row) => row.revision), [1, 2]);
    assert.equal(history[0].snapshot.title, "Rascunho sintético");
    assert.equal(history[1].snapshot.title, draft.title);
  }); checks++;
  // Runtime cannot mutate history; the trigger also rejects privileged mutation.
  await assert.rejects(transaction("tenant-a", (client) => client.query("DELETE FROM sst.work_permit_draft_revisions")), { code: "42501" }); checks++;
  await assert.rejects(pool.query("UPDATE sst.work_permit_draft_revisions SET snapshot='{}'"), { code: "55000" }); checks++;
  await assert.rejects(pool.query("DELETE FROM sst.work_permit_draft_revisions"), { code: "55000" }); checks++;
  await assert.rejects(transaction("tenant-a", async (client) => {
    await client.query("UPDATE sst.work_permit_drafts SET title='Deve reverter',revision=revision+1");
    await client.query("INSERT INTO sst.work_permit_draft_revisions VALUES ('tenant-a','draft-a',2,'{}','actor-test',now())");
  }), { code: "23505" });
  const after = await pool.query("SELECT revision,title FROM sst.work_permit_drafts");
  assert.equal(after.rows[0].revision, 2);
  assert.notEqual(after.rows[0].title, "Deve reverter"); checks++;
  const policies = await pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('sst.work_permit_drafts'::regclass,'sst.work_permit_draft_revisions'::regclass)");
  assert.equal(policies.rowCount, 2);
  assert.ok(policies.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)); checks++;
  // Substitute only the session boundary and pool lookup. Store queries and
  // PostgreSQL policies remain real; this is not a browser authentication test.
  globalThis.__sstPermitProof = {
    pool,
    run(permission, tenant, operation) {
      assert.equal(permission, "pgr.manage");
      assert.ok(["tenant-a", "tenant-b"].includes(tenant));
      return transaction(tenant, (client) => operation(client, { tenantId: tenant, userId: "server-actor-test" }));
    },
  };
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (specifier === "./postgres") return { url: "data:text/javascript,export const getPostgresPool=()=>globalThis.__sstPermitProof.pool", shortCircuit: true };
    if (specifier === "./tenant-read-transaction" || specifier === "./tenant-write-transaction") {
      return { url: "data:text/javascript,export const withCurrentTenantReadTransaction=(...args)=>globalThis.__sstPermitProof.run(...args);export const withCurrentTenantWriteTransaction=withCurrentTenantReadTransaction", shortCircuit: true };
    }
    if (specifier === "./work-permit-source-field-maps") return { url: new URL("../src/lib/work-permit-source-field-maps.ts", import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  } });
  let store;
  try { store = await import("../src/lib/work-permit-draft-store.ts"); }
  finally { hooks.deregister(); }
  stage = "store-create-author";
  const created = await store.createWorkPermitDraft({ tenantId: "tenant-a", mapId: "hot-work-composite", title: "Store sintético", values: { company: "Empresa fictícia" }, createdBy: "untrusted-actor" });
  assert.equal(created.createdBy, "server-actor-test");
  assert.equal(created.revisionHistory[0].actorUserId, created.createdBy); checks++;
  stage = "store-tenant-isolation";
  assert.equal(await store.getWorkPermitDraft("tenant-b", created.id), null);
  assert.deepEqual(await store.listWorkPermitDrafts("tenant-b"), []); checks++;
  const edit = { mapId: created.mapId, title: "Store revisado", values: { company: "Empresa fictícia revisada" }, updatedBy: "untrusted-editor", expectedRevision: 1 };
  assert.equal(await store.updateWorkPermitDraft("tenant-b", created.id, edit), null); checks++;
  stage = "store-concurrent-edit";
  const concurrent = await Promise.all([
    store.updateWorkPermitDraft("tenant-a", created.id, edit),
    store.updateWorkPermitDraft("tenant-a", created.id, { ...edit, title: "Segunda edição" }),
  ]);
  assert.equal(concurrent.filter(Boolean).length, 1);
  const updated = concurrent.find(Boolean);
  assert.equal(updated.updatedBy, "server-actor-test");
  assert.equal(updated.revision, 2);
  assert.deepEqual(updated.revisionHistory.map((entry) => entry.revision), [2, 1]); checks++;
  stage = "store-readback";
  const reopened = await store.getWorkPermitDraft("tenant-a", created.id);
  assert.deepEqual(reopened, updated);
  const listed = (await store.listWorkPermitDrafts("tenant-a")).find((draft) => draft.id === created.id);
  assert.deepEqual(listed, reopened); checks++;
  stage = "store-stale-edit";
  assert.equal(await store.updateWorkPermitDraft("tenant-a", created.id, { ...edit, mapId: "pte-confined-space", expectedRevision: 2 }), null);
  assert.equal(await store.updateWorkPermitDraft("tenant-a", created.id, edit), null); checks++;
  stage = "store-historical-revision";
  const firstRevision = await store.getWorkPermitDraftRevision("tenant-a", created.id, 1);
  const secondRevision = await store.getWorkPermitDraftRevision("tenant-a", created.id, 2);
  assert.equal(firstRevision.title, "Store sintético");
  assert.equal(firstRevision.values.company, "Empresa fictícia");
  assert.equal(secondRevision.title, updated.title); checks++;
  assert.equal(await store.getWorkPermitDraftRevision("tenant-b", created.id, 1), null);
  assert.equal(await store.getWorkPermitDraftRevision("tenant-a", created.id, 99), null);
  assert.equal(await store.getWorkPermitDraftRevision("tenant-a", created.id, 0), null); checks++;
  console.log(`${checks}/18 verificações PostgreSQL aprovadas (migrações 0011/0012 e store real; contexto de sessão simulado).`);
} catch (error) {
  // No connection parameters or generated secrets in output.
  console.error(`Validação falhou em ${stage} após ${checks} verificações: ${error.code ?? error.name}`);
  process.exitCode = 1;
} finally {
  delete globalThis.__sstPermitProof;
  if (pool) await pool.end();
  if (started) { docker(["rm", "-f", name]); console.log("Container temporário removido."); }
}
