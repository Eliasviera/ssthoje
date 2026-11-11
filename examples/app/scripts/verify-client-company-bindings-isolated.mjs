import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { hashAccountPassword } from "../src/lib/account-credentials.ts";
import { clientCompanyPostgresCandidate } from "../src/lib/client-company-postgres-candidate.ts";
import { clientCompanyRequestCandidate } from "../src/lib/client-company-request-candidate.ts";

// Nao carrega .env, pool ativo, volumes ou dados existentes.
const name = `sst-company-bindings-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(32).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }).trim();
let pool; let started = false; let stage = "start";
const tenantId = "tenant-test";
async function apply(path) { await pool.query(await readFile(new URL(path, import.meta.url), "utf8")); }
async function role(userId, tenant, roleName, run) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    assert.ok(["tenant_identity_candidate_app", "client_company_candidate_app"].includes(roleName));
    await client.query(`SET LOCAL ROLE ${roleName}`);
    await client.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)", [userId, tenant]);
    const result = await run(client); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const repository = (userId, tenant = tenantId) => clientCompanyPostgresCandidate(pool, async () => ({ userId, tenantId: tenant }));
const command = (userId, companyId = "company-a", unitId = "unit-a") => ({ operation: "grant", userId, companyId, unitIds: [unitId], validUntil: "2099-01-01T00:00:00Z", expectedRevision: 0, reviewReference: "Revisão fictícia" });
try {
  docker(["run", "--rm", "-d", "--name", name, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=sst_hoje_dev", "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  started = true;
  const port = Number(docker(["port", name, "5432/tcp"]).split(/\r?\n/)[0].split(":").at(-1));
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", database: "sst_hoje_dev", password, max: 5, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; ; attempt++) {
    try { await pool.query("SELECT 1"); break; }
    catch { if (attempt === 39) throw new Error("disposable database unavailable"); await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  stage = "schemas";
  await pool.query("CREATE SCHEMA sst");
  for (const path of ["../db/migrations/0001_tenant_registry.sql", "../db/migrations/0004_client_companies.sql", "../../../schemas/tenant-authority-candidate.sql", "../../../schemas/tenant-self-service-identity-candidate.sql", "../../../schemas/client-company-bindings-candidate.sql"]) await apply(path);
  stage = "synthetic fixtures";
  await pool.query("INSERT INTO sst.tenants(id,name) VALUES ('tenant-test','Consultoria fictícia'),('tenant-other','Consultoria fictícia B')");
  await pool.query("INSERT INTO tenant_authority_candidate.tenant_profiles(tenant_id,operating_mode) VALUES ('tenant-test','consultancy')");
  await pool.query("INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,display_name) VALUES ('tenant-test','admin-test','consultoria_admin','Administrador fictício')");
  await pool.query(`INSERT INTO tenant_identity_candidate.tenant_profiles(tenant_id,operating_mode,platform_user_ceiling,platform_company_ceiling,platform_worker_ceiling,platform_storage_bytes_ceiling,user_limit,company_limit,worker_limit,storage_bytes_limit)
    VALUES ('tenant-test','consultancy',10,10,100,10000,10,10,100,10000)`);
  for (const suffix of ["a", "b"]) {
    await pool.query(`INSERT INTO sst.client_companies VALUES ($1,$2,$3,'','','','','active',now(),now())`, [tenantId, `company-${suffix}`, `Empresa fictícia ${suffix}`]);
    await pool.query("INSERT INTO sst.client_units(tenant_id,id,company_id,cnpj,name,city_state) VALUES ($1,$2,$3,$4,'Unidade fictícia','')", [tenantId, `unit-${suffix}`, `company-${suffix}`, suffix === "a" ? "00000000000000" : "11111111111111"]);
    await pool.query("INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,company_id,granted_by) VALUES ($1,'admin-test','tenant_admin',$2,'trusted-test')", [tenantId, `company-${suffix}`]);
  }
  stage = "activate two accounts through existing invitation function";
  const users = [];
  for (const suffix of ["a", "b"]) {
    const email = `client-${suffix}@example.invalid`;
    const digest = createHash("sha256").update(randomBytes(32)).digest("hex");
    await role("admin-test", tenantId, "tenant_identity_candidate_app", (client) => client.query("SELECT tenant_identity_candidate.invite_member($1,'cliente',$2,now()+interval '1 day','Teste sintético')", [email, digest]));
    const hash = await hashAccountPassword("Senha exclusivamente fictícia para prova!");
    const result = await role("", "", "tenant_identity_candidate_app", (client) => client.query("SELECT tenant_identity_candidate.redeem_invitation($1,$2,'Cliente fictício',$3) AS id", [digest, email, hash]));
    users.push(result.rows[0].id);
  }
  assert.notEqual(users[0], users[1]);
  const admin = repository("admin-test");
  stage = "concurrent first grants";
  const race = await Promise.allSettled([admin.change(command(users[0])), admin.change(command(users[0]))]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(race.filter((result) => result.status === "rejected").length, 1);
  await admin.change(command(users[1], "company-b", "unit-b"));
  assert.equal((await repository(users[0]).resolve()).companyId, "company-a");
  assert.equal((await repository(users[1]).resolve()).companyId, "company-b");
  assert.equal(await repository(users[0], "tenant-other").resolve(), null);
  const requestAccess = clientCompanyRequestCandidate(pool, async () => ({ userId: users[0], tenantId }));
  assert.equal((await requestAccess.access("dds.read")).companyScope.companyId, "company-a");
  for (const permission of ["dds.manage", "documents.read", "tenant.dashboard.read", "saas.tenants.manage", "unknown"]) assert.equal(await requestAccess.access(permission), null);
  assert.equal(await clientCompanyRequestCandidate(pool, async () => null).access("dds.read"), null);
  stage = "deny unauthorized commands";
  for (const input of [{ ...command(users[1]), expectedRevision: 1 }, { ...command(users[0]), expectedRevision: 1, unitIds: ["unit-b"] }, { ...command(users[0]), expectedRevision: 1, unitIds: ["unit-a", "unit-a"] }, { ...command(users[0]), expectedRevision: 1, validUntil: "2020-01-01" }]) await assert.rejects(admin.change(input));
  await assert.rejects(repository(users[0]).change(command(users[1])));
  await assert.rejects(repository("sst-demo-master").change(command(users[0])));
  await assert.rejects(repository("admin-test", "tenant-other").change(command(users[0])));
  await assert.rejects(clientCompanyPostgresCandidate(pool, async () => null).resolve());
  stage = "runtime role has no direct tables or mutation of history";
  for (const sql of ["SELECT * FROM client_company_candidate.bindings", "DELETE FROM client_company_candidate.events", "TRUNCATE client_company_candidate.events"]) await assert.rejects(role("admin-test", tenantId, "client_company_candidate_app", (client) => client.query(sql)));
  await assert.rejects(pool.query("UPDATE client_company_candidate.events SET action='revoke'"));
  stage = "rollback audit failure";
  await pool.query("CREATE FUNCTION client_company_candidate.fail_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER fail_test BEFORE INSERT ON client_company_candidate.events FOR EACH ROW EXECUTE FUNCTION client_company_candidate.fail_test()");
  await assert.rejects(admin.change({ ...command(users[0]), operation: "revoke", expectedRevision: 1 }));
  assert.equal((await repository(users[0]).resolve()).revision, 1);
  await pool.query("DROP TRIGGER fail_test ON client_company_candidate.events; DROP FUNCTION client_company_candidate.fail_test()");
  stage = "revocation and preserved session identity";
  await admin.change({ ...command(users[0]), operation: "revoke", expectedRevision: 1 });
  assert.equal(await repository(users[0]).resolve(), null);
  assert.equal((await repository(users[1]).resolve()).companyId, "company-b");
  assert.deepEqual((await pool.query("SELECT action FROM client_company_candidate.events WHERE user_id=$1 ORDER BY revision", [users[0]])).rows.map((row) => row.action), ["grant", "revoke"]);
  stage = "authority revocation and suspended identities";
  await pool.query("UPDATE tenant_authority_candidate.admin_grants SET active=false,revoked_by='trusted-test',revoked_at=now() WHERE company_id='company-b'");
  await assert.rejects(admin.change({ ...command(users[1], "company-b", "unit-b"), operation: "revoke", expectedRevision: 1 }));
  await pool.query("UPDATE tenant_identity_candidate.accounts SET status='suspended' WHERE user_id=$1", [users[1]]);
  assert.equal(await repository(users[1]).resolve(), null);
  const tables = await pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('client_company_candidate.bindings'::regclass,'client_company_candidate.events'::regclass)");
  assert.ok(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
  console.log(JSON.stringify({ passed: true, twoActivatedAccounts: true, concurrentFirstGrant: true, atomicAuditRollback: true, restrictedRole: true, revocation: true, activeDatabaseTouched: false }));
  if (["--verify-service-confirmation", "--serve-service-ui", "--verify-service-http"].some((flag) => process.argv.includes(flag))) {
    stage = "consultancy service confirmation";
    const { verifyConsultancyServiceCandidate } = await import("./verify-consultancy-service-candidate.mjs");
    const prepareBrowser = process.argv.includes("--serve-service-ui") || process.argv.includes("--verify-service-http");
    const setup = await verifyConsultancyServiceCandidate({ pool, users, tenantId, prepareBrowser });
    if (prepareBrowser) {
      stage = "consultancy service HTTP proof";
      const { startConsultancyServiceBrowserProof } = await import("./consultancy-service-browser-proof.mjs");
      await startConsultancyServiceBrowserProof({ pool, users, tenantId, setup,
        asIdentity: (callback) => role("", "", "tenant_identity_candidate_app", callback),
        autoStop: process.argv.includes("--verify-service-http"),
      });
    }
  }
  if (process.argv.includes("--serve-ui-proof") || process.argv.includes("--verify-http-proof")) {
    stage = "isolated browser proof";
    await pool.query("UPDATE tenant_identity_candidate.accounts SET status='active' WHERE user_id=$1", [users[1]]);
    await admin.change({ ...command(users[0]), expectedRevision: 2 });
    const { startClientCompanyBrowserProof } = await import("./client-company-browser-proof.mjs");
    await startClientCompanyBrowserProof({ pool, users, tenantId,
      asIdentity: (callback) => role("", "", "tenant_identity_candidate_app", callback),
      revokeA: () => admin.change({ ...command(users[0]), operation: "revoke", expectedRevision: 3 }),
      autoStop: process.argv.includes("--verify-http-proof"),
    });
  }
} catch (error) {
  console.error(JSON.stringify({ passed: false, stage, code: error.code ?? error.name,
    processExit: Number.isInteger(error.status) ? error.status : undefined,
    processSignal: typeof error.signal === "string" ? error.signal : undefined }));
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
  if (started) docker(["rm", "-f", name]);
}
