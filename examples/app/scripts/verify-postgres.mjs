import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadAdminPostgresConfig, loadRuntimePostgresConfig } from "./postgres-env.mjs";

const { Pool } = pg;
const admin = new Pool({ ...loadAdminPostgresConfig(), max: 3 });
const app = new Pool({ ...loadRuntimePostgresConfig(), max: 3 });
const token = randomUUID();
const tenantA = `m22-test-${token}-a`;
const tenantB = `m22-test-${token}-b`;
const concurrencyTenant = `m22-test-${token}-concurrency`;
const userId = `m22-user-${token}`;
const fixtureTenants = [tenantA, tenantB, concurrencyTenant];

async function createTenant(id, name) {
  await admin.query("INSERT INTO sst.tenants (id, name) VALUES ($1, $2)", [id, name]);
}

try {
  const migration = await admin.query("SELECT version FROM sst.schema_migrations ORDER BY version");
  assert.ok(migration.rows.length > 0, "nenhuma migração está aplicada");

  await createTenant(tenantA, "Fixture tenant A");
  await createTenant(tenantB, "Fixture tenant B");
  await admin.query(
    `INSERT INTO sst.tenant_memberships (tenant_id, user_id, role, display_name)
     VALUES ($1, $3, 'consultoria_admin', 'Fixture user A'), ($2, $3, 'sst_tst', 'Fixture user B')`,
    [tenantA, tenantB, userId],
  );

  const scoped = await app.connect();
  try {
    await scoped.query("BEGIN");
    const noIdentity = await scoped.query("SELECT user_id FROM sst.tenant_memberships");
    const noTenant = await scoped.query("SELECT id FROM sst.tenants");
    assert.equal(noIdentity.rowCount, 0);
    assert.equal(noTenant.rowCount, 0);
    await scoped.query("SELECT set_config('sst.user_id', $1, true)", [userId]);
    const ownMemberships = await scoped.query("SELECT tenant_id FROM sst.tenant_memberships ORDER BY tenant_id");
    assert.deepEqual(ownMemberships.rows.map((row) => row.tenant_id), [tenantA, tenantB].sort());
    await scoped.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantA]);
    const visibleTenants = await scoped.query("SELECT id FROM sst.tenants ORDER BY id");
    assert.deepEqual(visibleTenants.rows.map((row) => row.id), [tenantA]);
    await scoped.query("SELECT set_config('sst.user_id', $1, true)", [`other-user-${token}`]);
    const foreignMemberships = await scoped.query("SELECT tenant_id FROM sst.tenant_memberships");
    assert.equal(foreignMemberships.rowCount, 0);
    await scoped.query("SAVEPOINT read_only_check");
    await assert.rejects(
      scoped.query("UPDATE sst.tenants SET name = 'Forbidden write' WHERE id = $1", [tenantA]),
      { code: "42501" },
    );
    await scoped.query("ROLLBACK TO SAVEPOINT read_only_check");
    await scoped.query("ROLLBACK");
  } finally {
    scoped.release();
  }
  console.log("RLS: sem contexto não há linhas; memberships seguem a identidade da sessão e tenants o escopo ativo.");
  console.log("Privilégios: usuário de runtime sem permissão de escrita.");

  const rollbackId = `m22-test-${token}-rollback`;
  const rollbackClient = await admin.connect();
  try {
    await rollbackClient.query("BEGIN");
    await rollbackClient.query("INSERT INTO sst.tenants (id, name) VALUES ($1, $2)", [rollbackId, "Rollback fixture"]);
    await rollbackClient.query("ROLLBACK");
  } finally {
    rollbackClient.release();
  }
  const rollbackCheck = await admin.query("SELECT 1 FROM sst.tenants WHERE id = $1", [rollbackId]);
  assert.equal(rollbackCheck.rowCount, 0);
  console.log("Transação: rollback deixou o banco sem a linha de teste.");

  await createTenant(concurrencyTenant, "Concurrency fixture");
  const first = await admin.connect();
  const second = await admin.connect();
  let secondUpdate;
  try {
    await first.query("BEGIN");
    await second.query("BEGIN");
    await first.query("UPDATE sst.tenants SET name = 'Concurrent write A' WHERE id = $1", [concurrencyTenant]);
    let secondSettled = false;
    secondUpdate = second.query("UPDATE sst.tenants SET name = 'Concurrent write B' WHERE id = $1", [concurrencyTenant])
      .finally(() => { secondSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(secondSettled, false, "a segunda escrita não aguardou o lock da primeira");
    await first.query("COMMIT");
    await secondUpdate;
    await second.query("COMMIT");
  } catch (error) {
    try { await first.query("ROLLBACK"); } catch {}
    try { await second.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    first.release();
    second.release();
  }
  const version = await admin.query("SELECT row_version FROM sst.tenants WHERE id = $1", [concurrencyTenant]);
  assert.equal(Number(version.rows[0]?.row_version), 3);
  console.log("Concorrência: duas conexões serializaram atualizações; row_version final = 3.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await admin.query("DELETE FROM sst.tenant_memberships WHERE tenant_id = ANY($1::text[])", [fixtureTenants]);
  await admin.query("DELETE FROM sst.tenants WHERE id = ANY($1::text[])", [fixtureTenants]);
  await app.end();
  await admin.end();
}
