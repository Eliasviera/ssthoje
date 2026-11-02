import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { createClientCompanyInTransaction, listClientCompaniesInTransaction, setClientCompanyStatusInTransaction } from "../src/lib/client-postgres-operations.ts";

const { Pool } = pg;
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const containerName = `sst-clients-rls-${suffix}`;
const databasePassword = randomBytes(32).toString("base64url");
const tenantA = `clients-test-${suffix}-a`;
const tenantB = `clients-test-${suffix}-b`;
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

async function applyMigration(fileName) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(join(process.cwd(), "db", "migrations", fileName), "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function asTenant(context, operation) {
  const client = await runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE sst_hoje_app");
    await client.query("SELECT set_config('sst.user_id', $1, true)", [context.userId]);
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [context.tenantId]);
    const result = await operation(client, context);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function company(tenantId, suffixLetter, cnpj) {
  return {
    tenantId,
    legalName: `Empresa fictícia ${suffixLetter}`,
    tradeName: `Teste ${suffixLetter}`,
    contactName: `Contato fictício ${suffixLetter}`,
    contactEmail: "",
    contactPhone: "",
    units: [{ cnpj, name: `Unidade ${suffixLetter}`, cityState: "Cidade de teste/UF" }],
  };
}

try {
  stage = "start-temporary-postgres";
  docker([
    "run", "--rm", "-d", "--name", containerName,
    "-e", "POSTGRES_USER=sst_clients_test",
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
    user: "sst_clients_test",
    password: databasePassword,
    max: 3,
    connectionTimeoutMillis: 2000,
  };
  stage = "wait-for-temporary-postgres";
  await waitForDatabase(config);
  admin = new Pool(config);
  await admin.query("CREATE SCHEMA sst");

  stage = "apply-tenant-and-company-migrations";
  await applyMigration("0001_tenant_registry.sql");
  await applyMigration("0004_client_companies.sql");
  await admin.query("INSERT INTO sst.tenants (id, name) VALUES ($1, $2), ($3, $4)", [
    tenantA, "Tenant fictício A", tenantB, "Tenant fictício B",
  ]);

  runtime = new Pool(config);
  const contextA = { tenantId: tenantA, userId: "actor-client-test-a", role: "consultoria_admin" };
  const contextB = { tenantId: tenantB, userId: "actor-client-test-b", role: "consultoria_admin" };

  stage = "create-company-under-runtime-role";
  const companyA = await asTenant(contextA, (client, context) =>
    createClientCompanyInTransaction(client, context, company(tenantA, "A", "11111111111111")));
  const companyB = await asTenant(contextB, (client, context) =>
    createClientCompanyInTransaction(client, context, company(tenantB, "B", "22222222222222")));
  assert.equal(companyA.tenantId, tenantA);
  assert.equal(companyB.tenantId, tenantB);
  assert.equal(companyA.units.length, 1);
  assert.equal(companyB.units.length, 1);

  stage = "verify-tenant-read-isolation";
  const listedA = await asTenant(contextA, (client, context) =>
    listClientCompaniesInTransaction(client, context.tenantId));
  assert.deepEqual(listedA.map((entry) => entry.id), [companyA.id]);
  assert.equal(listedA[0].units[0].cnpj, "11111111111111");
  const noTenantClient = await runtime.connect();
  try {
    await noTenantClient.query("BEGIN");
    await noTenantClient.query("SET LOCAL ROLE sst_hoje_app");
    const noTenantContext = await noTenantClient.query("SELECT id FROM sst.client_companies");
    assert.equal(noTenantContext.rowCount, 0);
    await noTenantClient.query("COMMIT");
  } catch (error) {
    try { await noTenantClient.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    noTenantClient.release();
  }

  stage = "verify-cross-tenant-write-is-denied";
  await assert.rejects(
    asTenant(contextA, async (client) => {
      await client.query(
        `INSERT INTO sst.client_companies
         (tenant_id, id, legal_name, trade_name, contact_name, contact_email, contact_phone, status, created_at, updated_at)
         VALUES ($1, $2, 'Forged', '', '', '', '', 'active', now(), now())`,
        [tenantB, `forged-${suffix}`],
      );
    }),
    { code: "42501" },
  );

  stage = "verify-status-and-audit-transaction";
  const archived = await asTenant(contextA, (client, context) =>
    setClientCompanyStatusInTransaction(client, context, companyA.id, "archived"));
  assert.equal(archived?.status, "archived");
  const audit = await admin.query(
    "SELECT action, target_id FROM sst.client_audit_history WHERE tenant_id = $1 ORDER BY occurred_at, id",
    [tenantA],
  );
  assert.deepEqual(audit.rows.map((row) => row.action), ["client.created", "client.status_changed"]);
  assert.ok(audit.rows.every((row) => row.target_id === companyA.id));

  console.log("Cadastro PostgreSQL de empresas/unidades: RLS, gravação transacional e auditoria verificados em banco temporário.");
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
