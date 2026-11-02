import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import { getPublicSiteContentPostgres, getSiteEditorPostgres } from "../src/lib/site-postgres-store.ts";
import { DEFAULT_SITE_CONTENT } from "../src/lib/site-content.ts";

function poolWith(client: object, onConnect = () => {}) {
  return {
    connect: async () => { onConnect(); return client as PoolClient; },
  } as unknown as Pool;
}

test("CMS PostgreSQL público usa transação somente leitura e retorna cópia defensiva", async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes("FROM sst.site_cms_state")) return { rows: [] };
      return { rows: [] };
    },
    release: () => statements.push("RELEASE"),
  };

  const first = await getPublicSiteContentPostgres(poolWith(client));
  first.headline = "Mutação local de teste";
  const second = await getPublicSiteContentPostgres(poolWith(client));

  assert.equal(second.headline, DEFAULT_SITE_CONTENT.headline);
  assert.ok(statements.includes("BEGIN READ ONLY"));
  assert.equal(statements.filter((sql) => /^(INSERT|UPDATE|DELETE|TRUNCATE)/i.test(sql)).length, 0);
  assert.equal(statements.filter((sql) => sql === "COMMIT").length, 2);
  assert.equal(statements.filter((sql) => sql === "RELEASE").length, 2);
});

test("CMS PostgreSQL exige Master antes de abrir conexão", async () => {
  let connections = 0;
  const client = { query: async () => ({ rows: [] }), release: () => {} };
  const pool = poolWith(client, () => { connections += 1; });

  await assert.rejects(getSiteEditorPostgres(pool, "sst-demo-user"), /SaaS Master/);
  assert.equal(connections, 0);
});
