import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { hashAccountPassword, hashInvitationToken, createInvitationToken } from "../src/lib/account-credentials.ts";

// Disposable PostgreSQL only. No app env, persistent DB, published port or volume.
const name = `sst-tenant-identity-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(24).toString("hex");
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
const emailDigest = value => createHash("sha256").update(value).digest("hex");
let pool;
let started = false;
let stage = "start";

async function apply(path) {
  await pool.query(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function asApp(userId, tenantId, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tenant_identity_candidate_app");
    await client.query("SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)", [userId, tenantId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  docker(["run", "--rm", "-d", "--name", name, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=sst_hoje_dev", "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  started = true;
  const port = Number(docker(["port", name, "5432/tcp"]).split(/\r?\n/)[0].split(":").at(-1));
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "sst_hoje_dev", max: 5, connectionTimeoutMillis: 1000 });
  for (let attempt = 0; ; attempt++) {
    try { await pool.query("SELECT 1"); break; }
    catch { if (attempt === 39) throw new Error("PostgreSQL descartável não ficou pronto."); await new Promise(done => setTimeout(done, 500)); }
  }
  await pool.query("CREATE SCHEMA sst");
  await apply("../db/migrations/0001_tenant_registry.sql");
  await apply("../db/migrations/0004_client_companies.sql");
  await apply("../../../schemas/tenant-authority-candidate.sql");
  await apply("../../../schemas/tenant-self-service-identity-candidate.sql");

  stage = "trusted provisioning";
  const ownerToken = createInvitationToken();
  const ownerHash = hashInvitationToken(ownerToken);
  const secondOwnerToken = createInvitationToken();
  const secondOwnerHash = hashInvitationToken(secondOwnerToken);
  const provisioner = await pool.connect();
  try {
    await provisioner.query("BEGIN");
    await provisioner.query("SET LOCAL ROLE tenant_identity_candidate_provisioner");
    await provisioner.query(
      "SELECT tenant_identity_candidate.provision_direct_client($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      ["tenant-cliente-a", "Cliente fictício A", "owner@example.test", "Proprietário fictício", ownerHash,
        new Date(Date.now() + 86_400_000), 3, 5, 50, 1_000_000],
    );
    await provisioner.query("SELECT tenant_identity_candidate.provision_direct_client($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      ["tenant-cliente-b", "Cliente fictício B", "owner-b@example.test", "Proprietário fictício B",
        secondOwnerHash, new Date(Date.now() + 86_400_000), 2, 5, 50, 1_000_000]);
    await provisioner.query("COMMIT");
  } catch (error) {
    await provisioner.query("ROLLBACK");
    throw error;
  } finally { provisioner.release(); }

  stage = "owner activation";
  const ownerPasswordHash = await hashAccountPassword("Senha fictícia segura proprietário!");
  const ownerId = await asApp("", "", async client => (await client.query(
    "SELECT tenant_identity_candidate.redeem_invitation($1,$2,$3,$4) AS user_id",
    [ownerHash, "owner@example.test", "Proprietário fictício", ownerPasswordHash],
  )).rows[0].user_id);

  stage = "second tenant owner activation";
  const secondOwnerPasswordHash = await hashAccountPassword("Senha fictícia segura proprietário B!");
  const secondOwnerId = await asApp("", "", async client => (await client.query(
    "SELECT tenant_identity_candidate.redeem_invitation($1,$2,$3,$4) AS user_id",
    [secondOwnerHash, "owner-b@example.test", "Proprietário fictício B", secondOwnerPasswordHash],
  )).rows[0].user_id);

  stage = "existing identity invitation acceptance";
  const existingIdentityToken = createInvitationToken();
  const existingIdentityHash = hashInvitationToken(existingIdentityToken);
  await asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
    ["owner-b@example.test", "cliente", existingIdentityHash, new Date(Date.now() + 86_400_000), "Acesso fictício entre tenants"],
  ));
  await assert.rejects(asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.accept_invitation($1)", [existingIdentityHash],
  )), /A conta autenticada não corresponde ao convite/);
  const concurrentAccepts = await Promise.allSettled([1, 2].map(() =>
    asApp(secondOwnerId, "tenant-cliente-a", client => client.query(
      "SELECT tenant_identity_candidate.accept_invitation($1) AS user_id", [existingIdentityHash],
    )),
  ));
  assert.equal(concurrentAccepts.filter(result => result.status === "fulfilled").length, 1);
  const acceptedExistingId = concurrentAccepts.find(result => result.status === "fulfilled").value.rows[0].user_id;
  assert.equal(acceptedExistingId, secondOwnerId);
  const replayDenials = concurrentAccepts.filter(result => result.status === "rejected");
  assert.equal(replayDenials.length, 1);
  assert.match(String(replayDenials[0].reason), /Convite expirado, já utilizado ou incompatível com a conta/);

  stage = "member invitation";
  const inviteToken = createInvitationToken();
  const inviteHash = hashInvitationToken(inviteToken);
  const inviteId = await asApp(ownerId, "tenant-cliente-a", async client => (await client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5) AS id",
    ["sst@example.test", "sst_tst", inviteHash, new Date(Date.now() + 86_400_000), "Acesso fictício de SST"],
  )).rows[0].id);
  assert.ok(inviteId);
  await assert.rejects(asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
    ["another@example.test", "cliente", emailDigest("another-token"), new Date(Date.now() + 86_400_000), "Sem assento"],
  )), /Limite de usuários ativos e convites pendentes/);
  await assert.rejects(asApp(ownerId, "tenant-cliente-b", client => client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
    ["cross-tenant@example.test", "cliente", emailDigest("cross-tenant-token"), new Date(Date.now() + 86_400_000), "Tentativa entre tenants"],
  )), /Administrador não autenticado no tenant/);
  await assert.rejects(asApp(ownerId, "tenant-cliente-b", client => client.query(
    "SELECT tenant_identity_candidate.revoke_invitation($1,$2)", [inviteId, "Tentativa entre tenants"],
  )), /Administrador não autenticado no tenant/);
  await asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.revoke_invitation($1,$2)", [inviteId, "Convite cancelado na prova"],
  ));

  stage = "member activation";
  const replacementToken = createInvitationToken();
  const replacementHash = hashInvitationToken(replacementToken);
  await asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
    ["sst@example.test", "sst_tst", replacementHash, new Date(Date.now() + 86_400_000), "Acesso fictício de SST"],
  ));
  const memberPasswordHash = await hashAccountPassword("Senha fictícia segura profissional!");
  const memberId = await asApp("", "", async client => (await client.query(
    "SELECT tenant_identity_candidate.redeem_invitation($1,$2,$3,$4) AS user_id",
    [replacementHash, "sst@example.test", "Profissional SST fictício", memberPasswordHash],
  )).rows[0].user_id);
  assert.notEqual(memberId, ownerId);

  stage = "one-time and quota denials";
  await assert.rejects(asApp("", "", client => client.query(
    "SELECT tenant_identity_candidate.redeem_invitation($1,$2,$3,$4)",
    [replacementHash, "sst@example.test", "Profissional SST fictício", memberPasswordHash],
  )), /Convite expirado, já utilizado ou incompatível/);
  await assert.rejects(asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
    ["other@example.test", "tenant_owner", emailDigest("bad-role-token"), new Date(Date.now() + 86_400_000), "Tentativa inválida"],
  )), /Sessão, papel, validade do convite/);
  await assert.rejects(asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
    ["third@example.test", "cliente", emailDigest("third-token"), new Date(Date.now() + 86_400_000), "Limite excedido"],
  )), /Limite de usuários ativos e convites pendentes/);
  await assert.rejects(asApp(memberId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
    ["unauthorized@example.test", "cliente", emailDigest("unauthorized-token"), new Date(Date.now() + 86_400_000), "Tentativa sem permissão"],
  )), /Somente o administrador do cliente pode convidar pessoas/);

  stage = "authentication lookup and isolation";
  const account = await asApp(memberId, "tenant-cliente-a", async client => (await client.query(
    "SELECT user_id,email,password_hash FROM tenant_identity_candidate.lookup_login_account($1)", ["SST@EXAMPLE.TEST"],
  )).rows[0]);
  assert.equal(account.user_id, memberId);
  assert.equal(account.email, "sst@example.test");
  assert.equal(account.password_hash, memberPasswordHash);
  assert.notEqual(account.password_hash, "Senha fictícia segura profissional!");
  const isolated = await asApp(memberId, "tenant-cliente-b", async client => (await client.query(
    "SELECT count(*)::int AS count FROM tenant_identity_candidate.tenant_profiles",
  )).rows[0].count);
  assert.equal(isolated, 1, "RLS deve mostrar somente o perfil do tenant de contexto");

  stage = "membership suspension";
  await asApp(ownerId, "tenant-cliente-a", client => client.query(
    "SELECT tenant_identity_candidate.suspend_member($1,$2)", [memberId, "Suspensão fictícia para prova"],
  ));
  const membershipStatus = await pool.query(
    "SELECT status FROM sst.tenant_memberships WHERE tenant_id='tenant-cliente-a' AND user_id=$1", [memberId],
  );
  assert.equal(membershipStatus.rows[0].status, "suspended");

  stage = "concurrent seat quota";
  const concurrentInvites = await Promise.allSettled(["concorrente-1", "concorrente-2"].map(label =>
    asApp(secondOwnerId, "tenant-cliente-b", client => client.query(
      "SELECT tenant_identity_candidate.invite_member($1,$2,$3,$4,$5)",
      [`${label}@example.test`, "cliente", emailDigest(`${label}-token`), new Date(Date.now() + 86_400_000), "Prova concorrente de cota"],
    )),
  ));
  assert.equal(concurrentInvites.filter(result => result.status === "fulfilled").length, 1);
  const quotaDenials = concurrentInvites.filter(result => result.status === "rejected");
  assert.equal(quotaDenials.length, 1);
  assert.match(String(quotaDenials[0].reason), /Limite de usuários ativos e convites pendentes/);

  stage = "direct access denials";
  await assert.rejects(asApp(memberId, "tenant-cliente-a", client => client.query(
    "SELECT * FROM tenant_identity_candidate.accounts",
  )), { code: "42501" });
  await assert.rejects(asApp(memberId, "tenant-cliente-a", client => client.query(
    "UPDATE tenant_identity_candidate.events SET reason='alterado' WHERE tenant_id=$1", ["tenant-cliente-a"],
  )), { code: "42501" });

  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM tenant_identity_candidate.accounts) AS accounts,
      (SELECT count(*)::int FROM sst.tenant_memberships WHERE tenant_id='tenant-cliente-a' AND status='active') AS memberships,
      (SELECT count(*)::int FROM tenant_identity_candidate.events WHERE tenant_id='tenant-cliente-a') AS audit_events,
      (SELECT count(*)::int FROM tenant_identity_candidate.invitations WHERE token_sha256=$1) AS token_hash_rows
  `, [replacementHash]);
  assert.deepEqual(counts.rows[0], { accounts: 3, memberships: 2, audit_events: 9, token_hash_rows: 1 });
  assert.equal(ownerToken.length, 43);
  assert.equal(secondOwnerToken.length, 43);
  assert.equal(inviteToken.length, 43);
  assert.equal(replacementToken.length, 43);
  assert.equal(existingIdentityToken.length, 43);
  console.log("Prova PostgreSQL descartável aprovada: convite autenticado para identidade existente, membership por tenant, isolamento, autorização, cota concorrente, suspensão, ativação única e RLS.");
} catch (error) {
  const diagnostic = String(error.stderr ?? error.message ?? "").replaceAll(password, "[redigido]").replaceAll(name, "[container descartável]");
  console.error(`Prova não concluída na etapa "${stage}" (${error.code ?? error.name}): ${diagnostic.trim()}${error.where ? `\n${error.where}` : ""}. Nenhum banco persistente foi utilizado.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (started) docker(["rm", "-f", name]);
}
  stage = "direct access denials";
