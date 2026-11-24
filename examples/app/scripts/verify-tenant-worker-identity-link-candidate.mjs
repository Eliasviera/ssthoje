import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

// PostgreSQL descartável; sem .env, volume, porta pública ou banco persistente.
const container = `sst-worker-link-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(24).toString("hex");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const tenantA = `worker-link-${suffix}-a`;
const tenantB = `worker-link-${suffix}-b`;
const ownerA = `worker-link-owner-${suffix}`;
const reviewerA = `worker-link-reviewer-${suffix}`;
const workerA = `worker-link-person-${suffix}`;
const workerEmail = `person-${suffix}@example.test`;
const newWorker = `worker-register-${suffix}`;
const newWorkerEmail = `new-person-${suffix}@example.test`;
const tokenDigest = token => createHash("sha256").update(token).digest("hex");
const docker = args => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
}).trim();
let pool;
let started = false;
let stage = "start";

async function apply(path) {
  stage = `apply ${path}`;
  const sql = await readFile(new URL(path, import.meta.url), "utf8");
  try {
    await pool.query(sql);
  } catch (error) {
    const position = Number(error.position);
    const line = Number.isInteger(position) && position > 0
      ? sql.slice(0, position - 1).split("\n").length
      : null;
    const excerpt = Number.isInteger(position) && position > 0
      ? sql.slice(Math.max(0, position - 101), Math.min(sql.length, position + 100)).replace(/\s+/g, " ")
      : "posição não informada pelo servidor";
    error.message = `${error.message} [arquivo: ${path}; linha: ${line ?? "n/d"}; posição: ${Number.isInteger(position) ? position : "n/d"}; trecho: ${excerpt}]`;
    throw error;
  }
}

async function asApp(userId, tenantId, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tenant_worker_identity_candidate_app");
    await client.query(
      "SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)",
      [userId, tenantId],
    );
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

async function lookupLoginAccount(email) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tenant_identity_candidate_app");
    const result = await client.query(
      "SELECT * FROM tenant_identity_candidate.lookup_login_account($1)", [email],
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function invite(actor, workerId, email, reason = "Convite fictício da prova") {
  return asApp(actor, tenantA, async client => (await client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5) AS id",
    [workerId, email, tokenDigest(randomBytes(32)), new Date(Date.now() + 86_400_000), reason],
  )).rows[0].id);
}

async function accept(userId, tenantId, digest) {
  return asApp(userId, tenantId, client => client.query(
    "SELECT tenant_worker_identity_candidate.accept_invitation($1) AS id", [digest],
  ));
}

async function ownWorker(userId, tenantId) {
  return asApp(userId, tenantId, client => client.query(
    "SELECT * FROM tenant_worker_identity_candidate.read_own_worker()",
  ));
}

try {
  docker([
    "run", "--rm", "-d", "--name", container,
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", "POSTGRES_DB=sst_hoje_dev",
    "-p", "127.0.0.1::5432", "postgres:17-alpine",
  ]);
  started = true;
  const port = Number(docker(["port", container, "5432/tcp"]).split(/\r?\n/)[0].split(":").at(-1));
  pool = new pg.Pool({
    host: "127.0.0.1", port, user: "postgres", password,
    database: "sst_hoje_dev", max: 5, connectionTimeoutMillis: 1000,
  });
  for (let attempt = 0; ; attempt += 1) {
    try { await pool.query("SELECT 1"); break; }
    catch {
      if (attempt === 39) throw new Error("PostgreSQL descartável não ficou pronto.");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  stage = "apply prerequisite and candidate schemas";
  await pool.query("CREATE SCHEMA sst");
  await apply("../db/migrations/0001_tenant_registry.sql");
  await apply("../db/migrations/0004_client_companies.sql");
  await apply("../db/migrations/0005_pgr_risk_inventory.sql");
  await apply("../../../schemas/tenant-authority-candidate.sql");
  await apply("../../../schemas/tenant-self-service-identity-candidate.sql");
  await apply("../../../schemas/tenant-worker-quota-candidate.sql");
  await apply("../../../schemas/tenant-worker-identity-link-candidate.sql");

  stage = "seed synthetic tenant, users, company and workers";
  await pool.query(
    "INSERT INTO sst.tenants(id,name,status) VALUES ($1,'Tenant fictício A','active'),($2,'Tenant fictício B','active')",
    [tenantA, tenantB],
  );
  await pool.query(
    `INSERT INTO tenant_identity_candidate.tenant_profiles
      (tenant_id,operating_mode,platform_user_ceiling,platform_company_ceiling,
       platform_worker_ceiling,platform_storage_bytes_ceiling,user_limit,company_limit,
       worker_limit,storage_bytes_limit)
     VALUES ($1,'direct_client',10,10,10,1000000,10,10,10,1000000),
            ($2,'direct_client',10,10,10,1000000,10,10,10,1000000)`,
    [tenantA, tenantB],
  );
  await pool.query(
    "INSERT INTO tenant_authority_candidate.tenant_profiles(tenant_id,operating_mode) VALUES ($1,'direct_client'),($2,'direct_client')",
    [tenantA, tenantB],
  );
  await pool.query(
    `INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,status,display_name)
     VALUES ($1,$2,'cliente','active','Administrador fictício'),
            ($1,$3,'cliente','active','Revisor fictício')`,
    [tenantA, ownerA, reviewerA],
  );
  await pool.query(
    `INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,granted_by)
     VALUES ($1,$2,'tenant_owner','fixture'),($1,$2,'tenant_admin','fixture'),
            ($1,$3,'tenant_admin','fixture')`,
    [tenantA, ownerA, reviewerA],
  );
  const company = `company-${suffix}`;
  const unit = `unit-${suffix}`;
  await pool.query(
    `INSERT INTO sst.client_companies
      (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at)
     VALUES ($1,$2,'Empresa fictícia','','','','','active',clock_timestamp(),clock_timestamp())`,
    [tenantA, company],
  );
  await pool.query(
    "INSERT INTO sst.client_units(tenant_id,id,company_id,cnpj,name,city_state) VALUES ($1,$2,$3,'00000000000001','Unidade fictícia','Cidade/UF')",
    [tenantA, unit, company],
  );
  const selfWorker = `worker-admin-${suffix}`;
  await pool.query(
    `INSERT INTO tenant_worker_candidate.workers
      (tenant_id,id,company_id,unit_id,display_name,job_title,risk_categories)
     VALUES ($1,$2,$3,$4,'Pessoa trabalhadora fictícia','Função fictícia',ARRAY['Outro']),
            ($1,$5,$3,$4,'Administrador trabalhador fictício','Função fictícia',ARRAY['Outro']),
            ($1,$6,$3,$4,'Novo trabalhador fictício','Função fictícia',ARRAY['Outro'])`,
    [tenantA, workerA, company, unit, selfWorker, newWorker],
  );
  const fakeHash = () => `scrypt$32768$8$1$${randomBytes(16).toString("base64url")}$${randomBytes(64).toString("base64url")}`;
  const adminEmail = `owner-${suffix}@example.test`;
  const reviewerEmail = `reviewer-${suffix}@example.test`;
  await pool.query(
    `INSERT INTO tenant_identity_candidate.accounts(user_id,email,display_name,password_hash)
     VALUES ($1,$2,'Administrador fictício',$3),($4,$5,'Revisor fictício',$6),($7,$8,'Trabalhador fictício',$9)`,
    [ownerA, adminEmail, fakeHash(), reviewerA, reviewerEmail, fakeHash(), workerA, workerEmail, fakeHash()],
  );

  stage = "invitation cancellation and expiration recovery";
  const expiredDigest = tokenDigest(randomBytes(32));
  const expiredId = await asApp(ownerA, tenantA, async client => (await client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5) AS id",
    [workerA, workerEmail, expiredDigest, new Date(Date.now() + 86_400_000), "Convite que vencerá na prova"],
  )).rows[0].id);
  await pool.query(
    "UPDATE tenant_worker_identity_candidate.invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",
    [tenantA, expiredId],
  );
  const afterExpirationDigest = tokenDigest(randomBytes(32));
  const afterExpirationId = await asApp(ownerA, tenantA, async client => (await client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5) AS id",
    [workerA, workerEmail, afterExpirationDigest, new Date(Date.now() + 86_400_000), "Novo convite após expiração"],
  )).rows[0].id);
  const expiredState = await pool.query(
    "SELECT status FROM tenant_worker_identity_candidate.invitations WHERE tenant_id=$1 AND id=$2",
    [tenantA, expiredId],
  );
  assert.equal(expiredState.rows[0].status, "expired");
  await asApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.revoke_invitation($1,$2)",
    [afterExpirationId, "Cancelamento fictício do convite pendente"],
  ));
  await assert.rejects(accept(workerA, tenantA, afterExpirationDigest), /Convite indisponível ou expirado/);

  stage = "invitation authorization and tenant isolation";
  await assert.rejects(invite(reviewerA, `missing-${suffix}`, workerEmail), /Trabalhador ativo não encontrado/);
  const digest = tokenDigest(randomBytes(32));
  const invitationId = await asApp(ownerA, tenantA, async client => (await client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5) AS id",
    [workerA, workerEmail, digest, new Date(Date.now() + 86_400_000), "Convite inicial fictício"],
  )).rows[0].id);
  await assert.rejects(accept(workerA, tenantB, digest), /Convite indisponível ou expirado/);
  await assert.rejects(accept(reviewerA, tenantA, digest), /Conta ativa não corresponde ao e-mail convidado/);
  await assert.rejects(asApp(ownerA, tenantB, client => client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5)",
    [workerA, workerEmail, tokenDigest(randomBytes(32)), new Date(Date.now() + 86_400_000), "Escopo cruzado"],
  )), /Somente dono\/admin ativo/);

  stage = "acceptance stays pending and self-review is denied";
  await pool.query("UPDATE sst.tenants SET status='suspended' WHERE id=$1", [tenantA]);
  await assert.rejects(accept(workerA, tenantA, digest), /Tenant ativo é obrigatório/);
  await pool.query("UPDATE sst.tenants SET status='active' WHERE id=$1", [tenantA]);
  await accept(workerA, tenantA, digest);
  const accepted = await pool.query(
    "SELECT status,accepted_by FROM tenant_worker_identity_candidate.invitations WHERE tenant_id=$1 AND id=$2",
    [tenantA, invitationId],
  );
  assert.equal(accepted.rows[0].status, "accepted");
  assert.equal(accepted.rows[0].accepted_by, workerA);
  assert.equal((await ownWorker(workerA, tenantA)).rows.length, 0, "vínculo pendente não libera consulta");
  const selfDigest = tokenDigest(randomBytes(32));
  await asApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5)",
    [selfWorker, adminEmail, selfDigest, new Date(Date.now() + 86_400_000), "Convite fictício para provar auto-revisão"],
  ));
  await accept(ownerA, tenantA, selfDigest);
  await assert.rejects(asApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.review_link($1,true,$2,$3)",
    [selfWorker, "verificação fictícia", "Autoaprovação deve falhar"],
  )), /O próprio titular do vínculo não pode revisá-lo/);

  stage = "independent approval, own summary and revocation";
  await assert.rejects(asApp(reviewerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.review_link($1,$2,$3,$4)",
    [workerA, null, "protocolo fictício", "Decisão nula deve falhar"],
  )), /Revisão\/justificativa\/referência inválida/);
  await pool.query("UPDATE tenant_authority_candidate.tenant_profiles SET active=false WHERE tenant_id=$1", [tenantA]);
  await assert.rejects(asApp(reviewerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.review_link($1,true,$2,$3)",
    [workerA, "protocolo fictício", "Tenant sem autoridade não aprova"],
  )), /Tenant sem configuração de autoridade ativa/);
  await pool.query("UPDATE tenant_authority_candidate.tenant_profiles SET active=true WHERE tenant_id=$1", [tenantA]);
  await pool.query("UPDATE sst.tenants SET status='suspended' WHERE id=$1", [tenantA]);
  await assert.rejects(asApp(reviewerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.review_link($1,true,$2,$3)",
    [workerA, "protocolo fictício", "Tenant suspenso não aprova"],
  )), /Tenant ativo é obrigatório/);
  await pool.query("UPDATE sst.tenants SET status='active' WHERE id=$1", [tenantA]);
  await asApp(reviewerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.review_link($1,true,$2,$3)",
    [workerA, "protocolo fictício de conferência", "Identidade conferida por revisor independente"],
  ));
  const summary = await ownWorker(workerA, tenantA);
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].worker_id, workerA);
  assert.equal(summary.rows[0].display_name, "Pessoa trabalhadora fictícia");
  await pool.query("UPDATE sst.tenants SET status='suspended' WHERE id=$1", [tenantA]);
  await assert.rejects(ownWorker(workerA, tenantA), /Tenant ativo é obrigatório/);
  await pool.query("UPDATE sst.tenants SET status='active' WHERE id=$1", [tenantA]);
  assert.equal((await ownWorker(workerA, tenantB)).rows.length, 0, "consulta não atravessa tenant");
  await assert.rejects(asApp(workerA, tenantA, client => client.query(
    "SELECT * FROM tenant_worker_identity_candidate.links",
  )), { code: "42501" });
  await assert.rejects(asApp(ownerA, tenantA, client => client.query(
    "UPDATE tenant_worker_identity_candidate.events SET reason='alterado' WHERE tenant_id=$1", [tenantA],
  )), { code: "42501" });
  const eventRow = await pool.query(
    "SELECT id FROM tenant_worker_identity_candidate.events WHERE tenant_id=$1 AND worker_id=$2 LIMIT 1",
    [tenantA, workerA],
  );
  await assert.rejects(pool.query(
    "UPDATE tenant_worker_identity_candidate.events SET reason='alterado' WHERE tenant_id=$1 AND id=$2",
    [tenantA, eventRow.rows[0].id],
  ), /worker identity events are append-only/);
  await asApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.revoke_link($1,$2)", [workerA, "Revogação fictícia"],
  ));
  assert.equal((await ownWorker(workerA, tenantA)).rows.length, 0, "revogação encerra a consulta própria");

  stage = "reinvite after revocation or rejection and preserve history";
  const secondDigest = tokenDigest(randomBytes(32));
  await asApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5)",
    [workerA, workerEmail, secondDigest, new Date(Date.now() + 86_400_000), "Reconvite fictício após revogação"],
  ));
  await accept(workerA, tenantA, secondDigest);
  await asApp(reviewerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.review_link($1,false,NULL,$2)",
    [workerA, "Rejeição fictícia da segunda tentativa"],
  ));
  const thirdDigest = tokenDigest(randomBytes(32));
  await asApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5)",
    [workerA, workerEmail, thirdDigest, new Date(Date.now() + 86_400_000), "Novo convite após rejeição"],
  ));
  await accept(workerA, tenantA, thirdDigest);
  const counts = await pool.query(
    `SELECT count(*)::int AS events,
      (SELECT count(*)::int FROM tenant_worker_identity_candidate.links WHERE tenant_id=$1 AND worker_id=$2) AS link_history,
      (SELECT count(*)::int FROM tenant_worker_identity_candidate.links WHERE tenant_id=$1 AND worker_id=$2 AND status IN ('pending_review','active')) AS live_links
     FROM tenant_worker_identity_candidate.events WHERE tenant_id=$1 AND worker_id=$2`,
    [tenantA, workerA],
  );
  assert.ok(counts.rows[0].events >= 8);
  assert.equal(counts.rows[0].link_history, 3, "vínculos aprovado/revogado, rejeitado e novo pendente preservados");
  assert.equal(counts.rows[0].live_links, 1, "no máximo um vínculo vivo por trabalhador");

  stage = "new worker account registration without operational membership";
  const registrationDigest = tokenDigest(randomBytes(32));
  await asApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.create_invitation($1,$2,$3,$4,$5)",
    [newWorker, newWorkerEmail, registrationDigest, new Date(Date.now() + 86_400_000), "Convite para cadastro fictício"],
  ));
  const registrationPasswordHash = fakeHash();
  await assert.rejects(asApp("", tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.register_worker_from_invitation($1,$2,$3,$4)",
    [registrationDigest, `wrong-${suffix}@example.test`, "Pessoa fictícia", registrationPasswordHash],
  )), /Conta não corresponde ao e-mail convidado/);
  const newWorkerUserId = await asApp("", tenantA, async client => (await client.query(
    "SELECT tenant_worker_identity_candidate.register_worker_from_invitation($1,$2,$3,$4) AS user_id",
    [registrationDigest, newWorkerEmail, "Nova pessoa trabalhadora fictícia", registrationPasswordHash],
  )).rows[0].user_id);
  assert.match(newWorkerUserId, /^worker-/);
  const registeredAccount = await lookupLoginAccount(newWorkerEmail);
  assert.equal(registeredAccount.user_id, newWorkerUserId);
  assert.equal(registeredAccount.password_hash, registrationPasswordHash);
  const noOperationalMembership = await pool.query(
    "SELECT count(*)::int AS count FROM sst.tenant_memberships WHERE tenant_id=$1 AND user_id=$2",
    [tenantA, newWorkerUserId],
  );
  assert.equal(noOperationalMembership.rows[0].count, 0, "conta de trabalhador não recebe membership de operação");
  assert.equal((await ownWorker(newWorkerUserId, tenantA)).rows.length, 0, "conta nova fica sem Passaporte até revisão");
  const pendingPortalLinks = await asApp(newWorkerUserId, tenantB, client => client.query(
    "SELECT * FROM tenant_worker_identity_candidate.list_my_worker_links()",
  ));
  assert.equal(pendingPortalLinks.rows.length, 1);
  assert.equal(pendingPortalLinks.rows[0].link_tenant_id, tenantA, "conta só lista seus próprios vínculos, mesmo ao escolher outro tenant");
  assert.equal(pendingPortalLinks.rows[0].link_status, "pending_review");
  await asApp(reviewerA, tenantA, client => client.query(
    "SELECT tenant_worker_identity_candidate.review_link($1,true,$2,$3)",
    [newWorker, "protocolo fictício de identidade", "Conferência humana independente da conta nova"],
  ));
  const registeredWorkerSummary = await ownWorker(newWorkerUserId, tenantA);
  assert.equal(registeredWorkerSummary.rows.length, 1);
  assert.equal(registeredWorkerSummary.rows[0].worker_id, newWorker);
  const activePortalLinks = await asApp(newWorkerUserId, tenantA, client => client.query(
    "SELECT * FROM tenant_worker_identity_candidate.list_my_worker_links()",
  ));
  assert.equal(activePortalLinks.rows[0].link_status, "active");
  console.log("Prova PostgreSQL descartável aprovada: convite/aceite, tenant, e-mail, cadastro de conta sem membership operacional, revisão independente, autoaprovação negada, consulta própria, revogação, reconvite, histórico, RLS e DML direto negado.");
} catch (error) {
  const diagnostic = String(error.stderr ?? error.message ?? "")
    .replaceAll(password, "[redigido]")
    .replaceAll(container, "[container descartável]");
  console.error(`Prova não concluída na etapa "${stage}" (${error.code ?? error.name}): ${diagnostic.trim()}${error.where ? `\n${error.where}` : ""}. Nenhum banco persistente foi utilizado.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (started) docker(["rm", "-f", container]);
}