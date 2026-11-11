import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { consultancyServicePostgresCandidate } from "../src/lib/consultancy-service-postgres-candidate.ts";
import { hashAccountPassword } from "../src/lib/account-credentials.ts";

// Recebe apenas o pool do contêiner descartável criado pelo verificador pai.
export async function verifyConsultancyServiceCandidate({ pool, users, tenantId, prepareBrowser = false }) {
  for (const path of ["../db/migrations/0005_pgr_risk_inventory.sql", "../../../schemas/operational-authority-grants-candidate.sql", "../../../schemas/consultancy-service-confirmation-candidate.sql"]) await pool.query(await readFile(new URL(path, import.meta.url), "utf8"));
  const repo = (userId, tenant = tenantId) => consultancyServicePostgresCandidate(pool, async () => ({ userId, tenantId: tenant }));
  const consultant = repo("admin-test");
  const client = repo(users[0]);
  const clientB = repo(users[1]);
  const registrar = randomUUID();
  await pool.query("UPDATE tenant_identity_candidate.accounts SET status='active' WHERE user_id=ANY($1)", [users]);
  await pool.query("INSERT INTO tenant_identity_candidate.accounts(user_id,email,display_name,password_hash) VALUES('admin-test','consultant@example.invalid','Consultor fictício',$1)", [await hashAccountPassword("Senha fictícia exclusiva da prova de prestação!")]);
  await pool.query(`INSERT INTO operational_authority_candidate.client_registrars(tenant_id,id,user_id,company_id,unit_id,designated_by,designation_reference)
    VALUES($1,$2,$3,'company-a','unit-a','admin-test','Designação exclusivamente sintética')`, [tenantId, registrar, users[0]]);
  await pool.query(`INSERT INTO operational_authority_candidate.registrar_events(tenant_id,registrar_id,event_type,actor_user_id,reason,snapshot)
    VALUES($1,$2,'designated','admin-test','Conferência fictícia','{}')`, [tenantId, registrar]);
  const proposal = () => consultant.propose({ companyId: "company-a", unitId: "unit-a", description: "Prestação fictícia de consultoria SST; unidade A", validUntil: "2099-01-01" });
  const id = await proposal();
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), false);
  // Designacao M22 sozinha nao satisfaz a finalidade de confirmar prestacao.
  await assert.rejects(client.decide({ proposalId: id, expectedRevision: 1, choice: "confirmed", authorityReviewId: randomUUID() }));
  // O runtime nao pode conferir a propria representacao ou inserir evidencia.
  const direct = async (sql, values = []) => {
    const c = await pool.connect();
    try { await c.query("BEGIN"); await c.query("SET LOCAL ROLE consultancy_service_candidate_app"); await c.query(sql, values); await c.query("COMMIT"); }
    catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  };
  await assert.rejects(direct("SELECT consultancy_service_candidate.review_authority($1,'teste',$2,'2099-01-01')", [registrar, "a".repeat(64)]));
  const verifier = await pool.connect();
  let review;
  try {
    await verifier.query("BEGIN"); await verifier.query("SET LOCAL ROLE consultancy_service_candidate_verifier");
    await verifier.query("SELECT set_config('sst.user_id','admin-test',true),set_config('sst.tenant_id',$1,true)", [tenantId]);
    review = (await verifier.query("SELECT consultancy_service_candidate.review_authority($1,'Evidência fictícia revisada',$2,'2099-01-01') AS id", [registrar, "a".repeat(64)])).rows[0].id;
    await verifier.query("COMMIT");
  } catch (error) { await verifier.query("ROLLBACK"); throw error; } finally { verifier.release(); }
  const decision = { proposalId: id, expectedRevision: 1, choice: "confirmed", authorityReviewId: review };
  const expiredReview = randomUUID();
  await pool.query(`INSERT INTO consultancy_service_candidate.authority_reviews(tenant_id,id,registrar_id,company_id,unit_id,reviewed_by,evidence_reference,evidence_sha256,valid_from,valid_until)
    VALUES($1,$2,$3,'company-a','unit-a','admin-test','Evidência fictícia vencida',$4,'2020-01-01','2021-01-01')`, [tenantId, expiredReview, registrar, "b".repeat(64)]);
  await assert.rejects(client.decide({ ...decision, authorityReviewId: expiredReview }));
  const preview = await client.preview(id, review);
  assert.equal(preview.companyId, "company-a"); assert.equal(preview.unitId, "unit-a"); assert.equal(preview.revision, 1);
  assert.equal(preview.description, "Prestação fictícia de consultoria SST; unidade A");
  await assert.rejects(clientB.preview(id, review));
  await assert.rejects(consultant.decide(decision));
  await assert.rejects(repo("sst-demo-master").decide(decision));
  await assert.rejects(clientB.decide(decision));
  await assert.rejects(repo(users[0], "tenant-other").decide(decision));
  const race = await Promise.allSettled([client.decide(decision), client.decide(decision)]);
  assert.equal(race.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(race.filter((row) => row.status === "rejected").length, 1);
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), true);
  assert.equal(await consultant.canUse("company-a", "unit-a", "checklist.read"), true);
  assert.equal(await consultant.canUse("company-a", "unit-a", "deviation.report"), true);
  await pool.query("UPDATE tenant_authority_candidate.tenant_profiles SET active=false WHERE tenant_id=$1", [tenantId]);
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), false);
  await pool.query("UPDATE tenant_authority_candidate.tenant_profiles SET active=true WHERE tenant_id=$1", [tenantId]);
  await pool.query("UPDATE tenant_identity_candidate.accounts SET status='suspended' WHERE user_id=$1", [users[0]]);
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), false);
  await pool.query("UPDATE tenant_identity_candidate.accounts SET status='active' WHERE user_id=$1", [users[0]]);
  for (const permission of ["documents.read", "dds.manage", "medical.review", "saas.tenants.manage"]) assert.equal(await consultant.canUse("company-a", "unit-a", permission), false);
  assert.equal(await consultant.canUse("company-b", "unit-b", "dds.read"), false);
  assert.equal(await consultant.canUse("company-a", "unit-b", "dds.read"), false);
  assert.equal(await repo("admin-test", "tenant-other").canUse("company-a", "unit-a", "dds.read"), false);
  for (const sql of ["SELECT * FROM consultancy_service_candidate.authority_reviews", "UPDATE consultancy_service_candidate.proposals SET description='adulterado'", "DELETE FROM consultancy_service_candidate.events", "TRUNCATE consultancy_service_candidate.events"]) await assert.rejects(direct(sql));
  await assert.rejects(pool.query("UPDATE consultancy_service_candidate.events SET action='revoked'"));
  // Falha de auditoria deve preservar a revisao vigente.
  await pool.query("CREATE FUNCTION consultancy_service_candidate.fail_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fail_test BEFORE INSERT ON consultancy_service_candidate.events FOR EACH ROW EXECUTE FUNCTION consultancy_service_candidate.fail_test()");
  await assert.rejects(client.decide({ ...decision, expectedRevision: 2, choice: "revoked" }));
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), true);
  await pool.query("DROP TRIGGER fail_test ON consultancy_service_candidate.events; DROP FUNCTION consultancy_service_candidate.fail_test()");
  await client.decide({ ...decision, expectedRevision: 2, choice: "revoked" });
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), false);
  assert.deepEqual((await pool.query("SELECT action FROM consultancy_service_candidate.events WHERE proposal_id=$1 ORDER BY revision", [id])).rows.map((row) => row.action), ["proposed", "confirmed", "revoked"]);
  const rejected = await proposal();
  await client.decide({ ...decision, proposalId: rejected, choice: "rejected" });
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), false);
  await assert.rejects(client.decide({ ...decision, proposalId: rejected, expectedRevision: 2 }));
  const next = await proposal();
  await client.decide({ ...decision, proposalId: next });
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), true);
  await pool.query("UPDATE tenant_identity_candidate.accounts SET status='suspended' WHERE user_id='admin-test'");
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), false);
  await pool.query("UPDATE tenant_identity_candidate.accounts SET status='active' WHERE user_id='admin-test'");
  const pending = await proposal();
  // Revogar o representante cancela sua finalidade de confirmacao.
  await pool.query("INSERT INTO operational_authority_candidate.registrar_events(tenant_id,registrar_id,event_type,actor_user_id,reason,snapshot) VALUES($1,$2,'revoked','admin-test','Revogação fictícia','{}')", [tenantId, registrar]);
  assert.equal(await consultant.canUse("company-a", "unit-a", "dds.read"), false);
  await assert.rejects(client.decide({ ...decision, proposalId: pending }));
  console.log(JSON.stringify({ serviceConfirmationPassed: true, companyRepresentativeRequired: true, selfApprovalDenied: true, isolatedScopes: true, concurrentConfirmation: true, auditRollback: true, rejectionAndRevocation: true, activeDatabaseTouched: false }));
  if (prepareBrowser) {
    // Nova designacao sintetica: nao altera nem apaga a designacao revogada.
    const browserRegistrar = randomUUID();
    await pool.query(`INSERT INTO operational_authority_candidate.client_registrars(tenant_id,id,user_id,company_id,unit_id,designated_by,designation_reference)
      VALUES($1,$2,$3,'company-a','unit-a','admin-test','Nova designação fictícia do ensaio visual')`, [tenantId, browserRegistrar, users[0]]);
    await pool.query("INSERT INTO operational_authority_candidate.registrar_events(tenant_id,registrar_id,event_type,actor_user_id,reason,snapshot) VALUES($1,$2,'designated','admin-test','Revisão fictícia para prova visual','{}')", [tenantId, browserRegistrar]);
    const operator = await pool.connect();
    let browserReview;
    try {
      await operator.query("BEGIN"); await operator.query("SET LOCAL ROLE consultancy_service_candidate_verifier");
      await operator.query("SELECT set_config('sst.user_id','admin-test',true),set_config('sst.tenant_id',$1,true)", [tenantId]);
      browserReview = (await operator.query("SELECT consultancy_service_candidate.review_authority($1,'Evidência fictícia para ensaio visual',$2,'2099-01-01') AS id", [browserRegistrar, "c".repeat(64)])).rows[0].id;
      await operator.query("COMMIT");
    } catch (error) { await operator.query("ROLLBACK"); throw error; } finally { operator.release(); }
    await client.decide({ ...decision, proposalId: next, expectedRevision: 2, choice: "revoked", authorityReviewId: browserReview });
    return { proposalId: pending, authorityReviewId: browserReview, createProposal: proposal };
  }
}
