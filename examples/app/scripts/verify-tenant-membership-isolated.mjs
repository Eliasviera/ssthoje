import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { assertCurrentTenantMembershipParity, TenantTransactionAccessError } from "../src/lib/tenant-membership-parity.ts";

const { Pool } = pg;
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const containerName = `sst-membership-rls-${suffix}`;
const databasePassword = randomBytes(32).toString("base64url");
const tenantA = `membership-test-${suffix}-a`;
const tenantB = `membership-test-${suffix}-b`;
const tenantSuspended = `membership-test-${suffix}-suspended`;
const userA = `actor-membership-test-${suffix}-a`;
const userSuspended = `actor-membership-test-${suffix}-suspended`;
let admin;
let runtime;
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

async function withRuntimeRole(context, operation) {
  const client = await runtime.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE sst_hoje_app");
    if (context.userId !== undefined) {
      await client.query("SELECT set_config('sst.user_id', $1, true)", [context.userId]);
    }
    if (context.tenantId !== undefined) {
      await client.query("SELECT set_config('sst.tenant_id', $1, true)", [context.tenantId]);
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

async function assertDenied(context, gucs, reason) {
  await withRuntimeRole(gucs, async (client) => {
    await assert.rejects(
      assertCurrentTenantMembershipParity(client, context),
      (error) => error instanceof TenantTransactionAccessError && error.statusCode === 403,
      reason,
    );
  });
}

try {
  stage = "start-temporary-postgres";
  docker([
    "run", "--rm", "-d", "--name", containerName,
    "-e", "POSTGRES_USER=sst_membership_test",
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
    user: "sst_membership_test",
    password: databasePassword,
    max: 2,
    connectionTimeoutMillis: 2000,
  };
  stage = "wait-for-temporary-postgres";
  await waitForDatabase(config);
  admin = new Pool(config);
  await admin.query("CREATE SCHEMA sst");

  stage = "apply-tenant-registry-migration";
  await admin.query(await readFile(join(process.cwd(), "db", "migrations", "0001_tenant_registry.sql"), "utf8"));
  await admin.query(
    `INSERT INTO sst.tenants (id, name, status)
     VALUES ($1, 'Tenant sintético A', 'active'),
            ($2, 'Tenant sintético B', 'active'),
            ($3, 'Tenant sintético suspenso', 'suspended')`,
    [tenantA, tenantB, tenantSuspended],
  );
  await admin.query(
    `INSERT INTO sst.tenant_memberships (tenant_id, user_id, role, status, display_name)
     VALUES ($1, $2, 'consultoria_admin', 'active', 'Usuário sintético A'),
            ($3, $2, 'sst_tst', 'active', 'Usuário sintético A no tenant B'),
            ($1, $4, 'consultoria_admin', 'suspended', 'Usuário sintético suspenso'),
            ($5, $2, 'consultoria_admin', 'active', 'Usuário sintético em tenant suspenso')`,
    [tenantA, userA, tenantB, userSuspended, tenantSuspended],
  );

  runtime = new Pool(config);
  stage = "verify-active-membership";
  await withRuntimeRole({ userId: userA, tenantId: tenantA }, async (client) => {
    await assertCurrentTenantMembershipParity(client, {
      userId: userA,
      tenantId: tenantA,
      membershipRole: "consultoria_admin",
    });
  });

  stage = "verify-fail-closed-cases";
  await assertDenied(
    { userId: userA, tenantId: tenantB, membershipRole: "sst_tst" },
    { userId: userA, tenantId: tenantA },
    "membership de outro tenant não pode passar pelo escopo RLS atual",
  );
  await assertDenied(
    { userId: `${userA}-missing`, tenantId: tenantA, membershipRole: "consultoria_admin" },
    { userId: `${userA}-missing`, tenantId: tenantA },
    "membership inexistente deve ser negada",
  );
  await assertDenied(
    { userId: userA, tenantId: tenantA, membershipRole: "consultoria_admin" },
    { userId: `${userA}-different`, tenantId: tenantA },
    "identidade divergente deve ser negada",
  );
  await assertDenied(
    { userId: userSuspended, tenantId: tenantA, membershipRole: "consultoria_admin" },
    { userId: userSuspended, tenantId: tenantA },
    "membership suspensa deve ser negada",
  );
  await assertDenied(
    { userId: userA, tenantId: tenantA, membershipRole: "cliente" },
    { userId: userA, tenantId: tenantA },
    "papel divergente deve ser negado",
  );
  await assertDenied(
    { userId: userA, tenantId: tenantSuspended, membershipRole: "consultoria_admin" },
    { userId: userA, tenantId: tenantSuspended },
    "tenant suspenso deve ser negado",
  );
  await assertDenied(
    { userId: userA, tenantId: tenantA, membershipRole: "consultoria_admin" },
    { userId: userA },
    "ausência de tenant no contexto deve ser negada",
  );
  await assertDenied(
    { userId: userA, tenantId: tenantA, membershipRole: "consultoria_admin" },
    { tenantId: tenantA },
    "ausência de usuário no contexto deve ser negada",
  );

  stage = "verify-empty-context";
  const noContext = await withRuntimeRole({}, async (client) => {
    const tenants = await client.query("SELECT id FROM sst.tenants");
    const memberships = await client.query("SELECT tenant_id FROM sst.tenant_memberships");
    return { tenantCount: tenants.rowCount, membershipCount: memberships.rowCount };
  });
  assert.deepEqual(noContext, { tenantCount: 0, membershipCount: 0 });

  console.log("Membership PostgreSQL: paridade, RLS e negação por ausência/divergência verificados em banco temporário.");
} catch (error) {
  console.error(`Falha na verificação isolada (${stage}): ${error instanceof Error ? error.message : "erro desconhecido"}`);
  process.exitCode = 1;
} finally {
  if (runtime) await runtime.end();
  if (admin) await admin.end();
  if (containerStarted) {
    try { docker(["rm", "-f", containerName]); }
    catch { process.exitCode = 1; }
  }
}
