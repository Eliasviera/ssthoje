import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const containerName = `sst-demo-trial-${suffix}`;
const databasePassword = randomBytes(32).toString("base64url");
const tenantApproved = `trial-test-${suffix}-approved`;
const tenantDenied = `trial-test-${suffix}-denied`;
const tenantRaceA = `trial-test-${suffix}-race-a`;
const tenantRaceB = `trial-test-${suffix}-race-b`;
const tenantPolicy = `trial-test-${suffix}-policy`;
const approvedInvitation = randomUUID();
const deniedInvitation = randomUUID();
const raceInvitation = randomUUID();
let admin;
let containerStarted = false;
let stage = "start";

function docker(args) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
}

async function waitForDatabase(config) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = new Pool({ ...config, max: 1, connectionTimeoutMillis: 750 });
    try {
      await probe.query("SELECT 1");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await probe.end();
    }
  }
  throw new Error("temporary postgres readiness timeout");
}

async function expectRejected(operation, message) {
  await assert.rejects(operation, undefined, message);
}

async function raceUpdates(updates) {
  let arrived = 0;
  let releaseBarrier;
  const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
  const outcomes = await Promise.all(updates.map(async ({ sql, values }) => {
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      arrived += 1;
      if (arrived === updates.length) releaseBarrier();
      await barrier;
      await client.query(sql, values);
      await client.query("COMMIT");
      return { accepted: true, code: null };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      return { accepted: false, code: typeof error?.code === "string" ? error.code : "unknown" };
    } finally {
      client.release();
    }
  }));
  return outcomes;
}

async function readAsSyntheticRole({ userId, tenantId } = {}) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE demo_trial_test_reader");
    if (userId !== undefined) {
      await client.query("SELECT set_config('sst.user_id', $1, true)", [userId]);
    }
    if (tenantId !== undefined) {
      await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantId]);
    }
    const invitations = await client.query("SELECT count(*)::integer AS count FROM sst.demo_invitations");
    const trials = await client.query("SELECT count(*)::integer AS count FROM sst.demo_trials");
    const audit = await client.query("SELECT count(*)::integer AS count FROM sst.demo_trial_audit");
    await client.query("COMMIT");
    return {
      invitations: invitations.rows[0].count,
      trials: trials.rows[0].count,
      audit: audit.rows[0].count,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function writeAsSyntheticRole({ userId, tenantId }, operation) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE demo_trial_test_writer");
    if (userId !== undefined) {
      await client.query("SELECT set_config('sst.user_id', $1, true)", [userId]);
    }
    if (tenantId !== undefined) {
      await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantId]);
    }
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

try {
  stage = "start-temporary-postgres";
  docker([
    "run", "--rm", "-d", "--name", containerName,
    "-e", "POSTGRES_USER=sst_demo_trial_test",
    "-e", `POSTGRES_PASSWORD=${databasePassword}`,
    "-e", "POSTGRES_DB=sst_hoje_dev",
    "-p", "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);
  containerStarted = true;
  stage = "discover-temporary-port";
  const portLine = docker(["port", containerName, "5432/tcp"]).split(/\r?\n/)[0];
  const port = Number(portLine.slice(portLine.lastIndexOf(":") + 1));
  if (!Number.isInteger(port) || port < 1) throw new Error("temporary postgres port unavailable");
  const config = {
    host: "127.0.0.1",
    port,
    database: "sst_hoje_dev",
    user: "sst_demo_trial_test",
    password: databasePassword,
    max: 2,
    connectionTimeoutMillis: 2000,
  };
  stage = "wait-for-temporary-postgres";
  await waitForDatabase(config);
  admin = new Pool(config);
  await admin.query("CREATE SCHEMA sst");

  stage = "apply-required-migrations";
  for (const fileName of ["0001_tenant_registry.sql", "0013_demo_trial_lifecycle.sql"]) {
    await admin.query(await readFile(join(process.cwd(), "db", "migrations", fileName), "utf8"));
  }

  stage = "verify-rls-and-runtime-grants";
  const security = await admin.query(`
    SELECT tables.table_name,
           relations.relrowsecurity AS row_security,
           relforcerowsecurity AS force_row_security,
           has_table_privilege('sst_hoje_app', format('sst.%I', table_name), 'SELECT') AS app_can_select,
           has_table_privilege('sst_hoje_app', format('sst.%I', table_name), 'INSERT') AS app_can_insert
      FROM information_schema.tables AS tables
      JOIN pg_catalog.pg_class AS relations
        ON relations.oid = format('sst.%I', tables.table_name)::regclass
     WHERE tables.table_schema = 'sst'
       AND tables.table_name IN ('demo_invitations', 'demo_trials', 'demo_trial_audit')
     ORDER BY table_name
  `);
  assert.equal(security.rowCount, 3);
  assert.ok(security.rows.every((row) => row.row_security && row.force_row_security));
  assert.ok(security.rows.every((row) => !row.app_can_select && !row.app_can_insert));

  stage = "create-isolated-policy-test-role";
  await admin.query("CREATE ROLE demo_trial_test_reader NOLOGIN NOSUPERUSER NOBYPASSRLS");
  await admin.query("GRANT USAGE ON SCHEMA sst TO demo_trial_test_reader");
  await admin.query("GRANT SELECT ON sst.demo_invitations, sst.demo_trials, sst.demo_trial_audit TO demo_trial_test_reader");
  await admin.query("CREATE ROLE demo_trial_test_writer NOLOGIN NOSUPERUSER NOBYPASSRLS");
  await admin.query("GRANT USAGE ON SCHEMA sst TO demo_trial_test_writer");
  await admin.query("GRANT SELECT, INSERT, UPDATE, DELETE ON sst.demo_invitations, sst.demo_trials, sst.demo_trial_audit TO demo_trial_test_writer");

  stage = "insert-synthetic-tenants";
  await admin.query(
    `INSERT INTO sst.tenants (id, name)
     VALUES ($1, 'Tenant sintético extensão aprovada'),
            ($2, 'Tenant sintético extensão negada'),
            ($3, 'Tenant sintético corrida A'),
            ($4, 'Tenant sintético corrida B'),
            ($5, 'Tenant sintético teste RLS de escrita')`,
    [tenantApproved, tenantDenied, tenantRaceA, tenantRaceB, tenantPolicy],
  );
  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  stage = "verify-approved-extension-cycle";
  await admin.query(
    "INSERT INTO sst.demo_invitations (id, token_hash, created_by, created_at) VALUES ($1, $2, 'master-sintetico', $3)",
    [approvedInvitation, randomBytes(32).toString("hex"), activatedAt],
  );
  await admin.query(
    `UPDATE sst.demo_invitations
        SET status = 'activated', activated_by = 'testador-sintetico',
            activated_at = $2, activated_tenant_id = $3
      WHERE id = $1`,
    [approvedInvitation, activatedAt, tenantApproved],
  );
  await admin.query(
    `INSERT INTO sst.demo_trials (tenant_id, invitation_id, activated_by, activated_at, expires_at)
     VALUES ($1, $2, 'testador-sintetico', $3, $4)`,
    [tenantApproved, approvedInvitation, activatedAt, expiresAt],
  );
  await admin.query(
    `UPDATE sst.demo_trials
        SET extension_status = 'pending', extension_requested_by = 'testador-sintetico',
            extension_requested_at = $2
      WHERE tenant_id = $1`,
    [tenantApproved, new Date()],
  );
  const approvedAt = new Date();
  await admin.query(
    `UPDATE sst.demo_trials
        SET extension_status = 'approved', extension_decided_by = 'master-sintetico',
            extension_decided_at = $2, extended_at = $2,
            expires_at = activated_at + interval '60 days'
      WHERE tenant_id = $1`,
    [tenantApproved, approvedAt],
  );
  const approvedTrial = await admin.query(
    "SELECT extension_status, expires_at = activated_at + interval '60 days' AS sixty_days FROM sst.demo_trials WHERE tenant_id = $1",
    [tenantApproved],
  );
  assert.deepEqual(approvedTrial.rows[0], { extension_status: "approved", sixty_days: true });

  stage = "verify-denied-extension-cycle";
  await admin.query(
    "INSERT INTO sst.demo_invitations (id, token_hash, created_by, created_at) VALUES ($1, $2, 'master-sintetico', $3)",
    [deniedInvitation, randomBytes(32).toString("hex"), activatedAt],
  );
  await admin.query(
    `UPDATE sst.demo_invitations
        SET status = 'activated', activated_by = 'testador-sintetico',
            activated_at = $2, activated_tenant_id = $3
      WHERE id = $1`,
    [deniedInvitation, activatedAt, tenantDenied],
  );
  await admin.query(
    `INSERT INTO sst.demo_trials (tenant_id, invitation_id, activated_by, activated_at, expires_at)
     VALUES ($1, $2, 'testador-sintetico', $3, $4)`,
    [tenantDenied, deniedInvitation, activatedAt, expiresAt],
  );
  await admin.query(
    `UPDATE sst.demo_trials
        SET extension_status = 'pending', extension_requested_by = 'testador-sintetico',
            extension_requested_at = $2
      WHERE tenant_id = $1`,
    [tenantDenied, new Date()],
  );
  await admin.query(
    `UPDATE sst.demo_trials
        SET extension_status = 'denied', extension_decided_by = 'master-sintetico',
            extension_decided_at = $2
      WHERE tenant_id = $1`,
    [tenantDenied, new Date()],
  );
  const deniedTrial = await admin.query(
    "SELECT extension_status, expires_at = activated_at + interval '30 days' AS thirty_days FROM sst.demo_trials WHERE tenant_id = $1",
    [tenantDenied],
  );
  assert.deepEqual(deniedTrial.rows[0], { extension_status: "denied", thirty_days: true });
  await expectRejected(
    admin.query("UPDATE sst.demo_trials SET extension_status = 'pending' WHERE tenant_id = $1", [tenantDenied]),
    "trial negado não deve aceitar segunda solicitação",
  );

  stage = "verify-concurrent-single-use-activation";
  await admin.query(
    "INSERT INTO sst.demo_invitations (id, token_hash, created_by, created_at) VALUES ($1, $2, 'master-sintetico', $3)",
    [raceInvitation, randomBytes(32).toString("hex"), activatedAt],
  );
  const activationOutcomes = await raceUpdates([
    {
      sql: `UPDATE sst.demo_invitations
               SET status = 'activated', activated_by = 'testador-sintetico-a',
                   activated_at = $2, activated_tenant_id = $3
             WHERE id = $1`,
      values: [raceInvitation, activatedAt, tenantRaceA],
    },
    {
      sql: `UPDATE sst.demo_invitations
               SET status = 'activated', activated_by = 'testador-sintetico-b',
                   activated_at = $2, activated_tenant_id = $3
             WHERE id = $1`,
      values: [raceInvitation, activatedAt, tenantRaceB],
    },
  ]);
  assert.equal(activationOutcomes.filter((outcome) => outcome.accepted).length, 1);
  assert.deepEqual(activationOutcomes.map((outcome) => outcome.code).filter(Boolean), ["55000"]);
  const activatedInvitationState = await admin.query(
    "SELECT activated_tenant_id FROM sst.demo_invitations WHERE id = $1 AND status = 'activated'",
    [raceInvitation],
  );
  assert.equal(activatedInvitationState.rowCount, 1);
  const raceTenantId = activatedInvitationState.rows[0].activated_tenant_id;
  await admin.query(
    `INSERT INTO sst.demo_trials (tenant_id, invitation_id, activated_by, activated_at, expires_at)
     VALUES ($1, $2, 'testador-sintetico', $3, $4)`,
    [raceTenantId, raceInvitation, activatedAt, expiresAt],
  );

  stage = "verify-concurrent-single-extension-request";
  const extensionOutcomes = await raceUpdates([
    {
      sql: `UPDATE sst.demo_trials
               SET extension_status = 'pending', extension_requested_by = 'testador-sintetico-a',
                   extension_requested_at = $2
             WHERE tenant_id = $1`,
      values: [raceTenantId, new Date()],
    },
    {
      sql: `UPDATE sst.demo_trials
               SET extension_status = 'pending', extension_requested_by = 'testador-sintetico-b',
                   extension_requested_at = $2
             WHERE tenant_id = $1`,
      values: [raceTenantId, new Date()],
    },
  ]);
  assert.equal(extensionOutcomes.filter((outcome) => outcome.accepted).length, 1);
  assert.deepEqual(extensionOutcomes.map((outcome) => outcome.code).filter(Boolean), ["55000"]);
  const raceTrial = await admin.query(
    "SELECT extension_status FROM sst.demo_trials WHERE tenant_id = $1",
    [raceTenantId],
  );
  assert.deepEqual(raceTrial.rows[0], { extension_status: "pending" });

  stage = "verify-single-use-and-append-only-audit";
  await expectRejected(
    admin.query("UPDATE sst.demo_invitations SET status = 'revoked', revoked_by = 'master', revoked_at = now() WHERE id = $1", [approvedInvitation]),
    "convite ativado não deve permitir nova transição",
  );
  await admin.query(
    `INSERT INTO sst.demo_trial_audit (id, tenant_id, invitation_id, actor_user_id, action, occurred_at)
     VALUES ($1, $2, $3, 'master-sintetico', 'trial_extension_approved', now())`,
    [randomUUID(), tenantApproved, approvedInvitation],
  );
  await expectRejected(
    admin.query("UPDATE sst.demo_trial_audit SET action = 'trial_extension_denied' WHERE tenant_id = $1", [tenantApproved]),
    "auditoria não deve permitir UPDATE",
  );
  await expectRejected(
    admin.query("DELETE FROM sst.demo_trial_audit WHERE tenant_id = $1", [tenantApproved]),
    "auditoria não deve permitir DELETE",
  );
  await expectRejected(
    admin.query("TRUNCATE sst.demo_trial_audit"),
    "auditoria não deve permitir TRUNCATE",
  );
  const preservedAudit = await admin.query(
    "SELECT count(*)::integer AS count FROM sst.demo_trial_audit WHERE tenant_id = $1",
    [tenantApproved],
  );
  assert.equal(preservedAudit.rows[0].count, 1);

  stage = "verify-master-and-tenant-read-rls";
  assert.deepEqual(await readAsSyntheticRole(), { invitations: 0, trials: 0, audit: 0 });
  assert.deepEqual(
    await readAsSyntheticRole({ userId: "testador-sintetico", tenantId: tenantApproved }),
    { invitations: 0, trials: 1, audit: 1 },
  );
  assert.deepEqual(
    await readAsSyntheticRole({ userId: "testador-sintetico", tenantId: tenantDenied }),
    { invitations: 0, trials: 1, audit: 0 },
  );
  assert.deepEqual(
    await readAsSyntheticRole({ userId: "sst-demo-master" }),
    { invitations: 3, trials: 3, audit: 1 },
  );

  stage = "verify-master-only-invitation-write";
  await assert.rejects(
    writeAsSyntheticRole({ userId: "testador-sintetico", tenantId: tenantPolicy }, (client) =>
      client.query(
        "INSERT INTO sst.demo_invitations (id, token_hash, created_by, created_at) VALUES ($1, $2, 'testador-sintetico', now())",
        [randomUUID(), randomBytes(32).toString("hex")],
      )),
    { code: "42501" },
  );
  const policyInvitation = randomUUID();
  await writeAsSyntheticRole({ userId: "sst-demo-master" }, async (client) => {
    await client.query(
      "INSERT INTO sst.demo_invitations (id, token_hash, created_by, created_at) VALUES ($1, $2, 'sst-demo-master', $3)",
      [policyInvitation, randomBytes(32).toString("hex"), activatedAt],
    );
    await client.query(
      `UPDATE sst.demo_invitations
          SET status = 'activated', activated_by = 'testador-sintetico',
              activated_at = $2, activated_tenant_id = $3
        WHERE id = $1`,
      [policyInvitation, activatedAt, tenantPolicy],
    );
  });

  stage = "verify-tenant-scoped-trial-and-audit-writes";
  await writeAsSyntheticRole({ userId: "testador-sintetico", tenantId: tenantPolicy }, async (client) => {
    await client.query(
      `INSERT INTO sst.demo_trials (tenant_id, invitation_id, activated_by, activated_at, expires_at)
       VALUES ($1, $2, 'testador-sintetico', $3, $4)`,
      [tenantPolicy, policyInvitation, activatedAt, expiresAt],
    );
    await client.query(
      `INSERT INTO sst.demo_trial_audit (id, tenant_id, invitation_id, actor_user_id, action, occurred_at)
       VALUES ($1, $2, $3, 'testador-sintetico', 'invitation_activated', now())`,
      [randomUUID(), tenantPolicy, policyInvitation],
    );
  });
  await assert.rejects(
    writeAsSyntheticRole({ userId: "testador-sintetico", tenantId: tenantPolicy }, (client) =>
      client.query(
        `INSERT INTO sst.demo_trials (tenant_id, invitation_id, activated_by, activated_at, expires_at)
         VALUES ($1, $2, 'testador-sintetico', $3, $4)`,
        [tenantDenied, deniedInvitation, activatedAt, expiresAt],
      )),
    { code: "42501" },
  );
  const crossTenantUpdate = await writeAsSyntheticRole(
    { userId: "testador-sintetico", tenantId: tenantPolicy },
    (client) => client.query(
      "UPDATE sst.demo_trials SET extension_status = 'pending', extension_requested_by = 'testador-sintetico', extension_requested_at = now() WHERE tenant_id = $1",
      [tenantDenied],
    ),
  );
  assert.equal(crossTenantUpdate.rowCount, 0);
  assert.deepEqual(
    await readAsSyntheticRole({ userId: "testador-sintetico", tenantId: tenantPolicy }),
    { invitations: 0, trials: 1, audit: 1 },
  );

  console.log("Trial demo PostgreSQL: migração, RLS de leitura/escrita por Master/tenant, grants restritos, concorrência e auditoria imutável verificados em banco temporário.");
} catch (error) {
  console.error(`Falha na verificação isolada (${stage}): ${error instanceof Error ? error.message : "erro desconhecido"}`);
  process.exitCode = 1;
} finally {
  if (admin) await admin.end();
  if (containerStarted) {
    try { docker(["rm", "-f", containerName]); }
    catch { process.exitCode = 1; }
  }
}
