import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { recordIntegrationDecisionInTransaction, recordIntegrationScheduleInTransaction } from "../src/lib/third-party-integration-gate-operations.ts";

// Prova descartável: não lê env nem conecta ao banco persistente.
const name = `sst-thirdparty-gate-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(32).toString("base64url");
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
const stamp = "2026-10-16T12:00:00.000Z";
let pool, started = false, stage = "start", check = "", decisionId = "", scheduleId = "";

async function insertTenantFixture(client, tenant) {
  await client.query("INSERT INTO sst.tenants (id,name) VALUES ($1,'Consultoria fictícia')", [tenant]);
  await client.query(
    "INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at) VALUES ($1,'company','Empresa fictícia','','','','','active',now(),now())",
    [tenant],
  );
  await client.query("INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state) VALUES ($1,'unit','company','11111111000111','Unidade fictícia','Teste')", [tenant]);
}

async function setTenant(client, tenant) {
  await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenant]);
}

try {
  docker(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_USER=sst_isolated", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=sst_hoje_dev", "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  started = true;
  const port = Number(docker(["port", name, "5432/tcp"]).split(/\r?\n/)[0].split(":").at(-1));
  assert.ok(Number.isInteger(port) && port > 0);
  pool = new pg.Pool({ host: "127.0.0.1", port, user: "sst_isolated", password, database: "sst_hoje_dev", max: 3, connectionTimeoutMillis: 1000 });

  stage = "readiness";
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await pool.query("SELECT 1"); break; } catch { if (attempt === 39) throw new Error("POSTGRES_NOT_READY"); await new Promise(done => setTimeout(done, 500)); }
  }

  stage = "candidate-schema";
  await pool.query("CREATE SCHEMA sst");
  for (const file of ["0001_tenant_registry.sql", "0004_client_companies.sql"]) await pool.query(await readFile(resolve("db/migrations", file), "utf8"));
  await pool.query(await readFile(resolve("../../schemas/third-party-integration-gate-candidate.sql"), "utf8"));
  for (const tenant of ["tenant-a", "tenant-b"]) await insertTenantFixture(pool, tenant);

  stage = "write-and-atomic-audit";
  const runtime = await pool.connect();
  try {
    await runtime.query("SET ROLE sst_hoje_app");
    await runtime.query("BEGIN");
    await setTenant(runtime, "tenant-a");
    await runtime.query("INSERT INTO sst.third_party_requirement_sets (tenant_id,id,company_id,unit_id,revision,status,previous_set_id,created_by,created_at) VALUES ('tenant-a','requirements-1','company','unit',1,'active',NULL,'admin',$1)", [stamp]);
    await runtime.query("INSERT INTO sst.third_party_requirement_items (tenant_id,requirement_set_id,document_kind,medical_restricted) VALUES ('tenant-a','requirements-1','PGR',false)");
    await runtime.query("INSERT INTO sst.third_party_compliance_rules (tenant_id,id,title,document_kind,criteria,source_title,source_version,jurisdiction,valid_from,valid_until,reviewer,version,status,previous_rule_id,created_by,created_at) VALUES ('tenant-a','rule-1','Critério fictício','PGR','Critério de teste','Fonte fictícia','1','BR','2026-01-01',NULL,'Revisor fictício',1,'active',NULL,'reviewer',$1)", [stamp]);
    await runtime.query("INSERT INTO sst.third_party_document_evaluations (tenant_id,id,company_id,unit_id,receipt_id,document_kind,rule_id,rule_version,result,notes,evidence,evidence_document_id,responsible,next_step,evaluated_by,evaluator_role,evaluated_at,rule_snapshot,document_snapshot) VALUES ('tenant-a','evaluation-1','company','unit','receipt-1','PGR','rule-1',1,'atende','Nota fictícia','Evidência fictícia','','Revisor fictício','Acompanhar','reviewer','sst_tst',$1,$2,$3)", [stamp, { id: "rule-1", version: 1 }, { id: "receipt-1", kind: "PGR" }]);
    await runtime.query("COMMIT");

    await runtime.query("BEGIN");
    await setTenant(runtime, "tenant-a");
    await runtime.query("INSERT INTO sst.third_party_integration_decisions (tenant_id,id,scope_id,company_id,unit_id,requirement_set_id,fingerprint,notes,decided_by,decided_role,decided_at,decision_snapshot) VALUES ('tenant-a','decision-rollback','scope-1','company','unit','requirements-1',$1,'Decisão humana fictícia','reviewer','sst_tst',$2,$3)", ["a".repeat(64), stamp, { scopeId: "scope-1", fingerprint: "a".repeat(64) }]);
    await assert.rejects(runtime.query("INSERT INTO sst.third_party_integration_audit (tenant_id,id,action,target_id,actor_user_id,actor_role,occurred_at) VALUES ('tenant-a','audit-rollback','invalid.action','decision-rollback','reviewer','sst_tst',$1)", [stamp]), { code: "23514" });
    await runtime.query("ROLLBACK");
    await runtime.query("BEGIN READ ONLY"); await setTenant(runtime, "tenant-a");
    assert.equal((await runtime.query("SELECT * FROM sst.third_party_integration_decisions WHERE id = 'decision-rollback'")).rowCount, 0);
    await runtime.query("ROLLBACK");

    await runtime.query("BEGIN"); await setTenant(runtime, "tenant-a");
    stage = "server-role-gate";
    await assert.rejects(
      recordIntegrationDecisionInTransaction(runtime, { userId: "sst", tenantId: "tenant-a", role: "sst_tst" }, {
        scopeId: "scope-1", companyId: "company", unitId: "unit", requirementSetId: "requirements-1", fingerprint: "b".repeat(64), notes: "Decisão humana fictícia", snapshot: { scopeId: "scope-1", fingerprint: "b".repeat(64) },
      }),
      /administradora/,
    );
    stage = "write-and-atomic-audit";
    const decision = await recordIntegrationDecisionInTransaction(runtime, { userId: "admin", tenantId: "tenant-a", role: "consultoria_admin" }, {
      scopeId: "scope-1", companyId: "company", unitId: "unit", requirementSetId: "requirements-1", fingerprint: "b".repeat(64), notes: "Decisão humana fictícia", snapshot: { scopeId: "scope-1", fingerprint: "b".repeat(64) },
    });
    decisionId = decision.id;
    await runtime.query("COMMIT");

    stage = "schedule-and-atomic-audit";
    await assert.rejects(
      recordIntegrationScheduleInTransaction(runtime, { userId: "admin", tenantId: "tenant-a", role: "consultoria_admin" }, { decisionId, scheduledOn: "2026-02-30" }),
      /Data de agendamento inválida/,
    );
    await runtime.query("BEGIN"); await setTenant(runtime, "tenant-a");
    await runtime.query("INSERT INTO sst.third_party_integration_schedules (tenant_id,id,decision_id,scheduled_on,created_by,created_at) VALUES ('tenant-a','schedule-rollback',$1,'2026-10-20','reviewer',$2)", [decisionId, stamp]);
    await assert.rejects(runtime.query("INSERT INTO sst.third_party_integration_audit (tenant_id,id,action,target_id,actor_user_id,actor_role,occurred_at) VALUES ('tenant-a','schedule-audit-rollback','invalid.action','schedule-rollback','reviewer','sst_tst',$1)", [stamp]), { code: "23514" });
    await runtime.query("ROLLBACK");
    await runtime.query("BEGIN READ ONLY"); await setTenant(runtime, "tenant-a");
    assert.equal((await runtime.query("SELECT * FROM sst.third_party_integration_schedules WHERE id = 'schedule-rollback'")).rowCount, 0);
    await runtime.query("ROLLBACK");

    await runtime.query("BEGIN"); await setTenant(runtime, "tenant-a");
    const schedule = await recordIntegrationScheduleInTransaction(runtime, { userId: "admin", tenantId: "tenant-a", role: "consultoria_admin" }, { decisionId, scheduledOn: "2026-10-20" });
    scheduleId = schedule.id;
    await runtime.query("COMMIT");

    stage = "rls-and-history";
    check = "no-context";
    await runtime.query("BEGIN READ ONLY");
    assert.equal((await runtime.query("SELECT * FROM sst.third_party_integration_decisions")).rowCount, 0);
    check = "other-tenant-read";
    await setTenant(runtime, "tenant-b");
    assert.equal((await runtime.query("SELECT * FROM sst.third_party_integration_decisions")).rowCount, 0);
    await runtime.query("ROLLBACK");
    check = "history-update-denied";
    await runtime.query("BEGIN"); await setTenant(runtime, "tenant-a");
    await assert.rejects(runtime.query("UPDATE sst.third_party_integration_decisions SET notes = 'alterado' WHERE id = $1", [decisionId]), { code: "42501" });
    await runtime.query("ROLLBACK");
    check = "schedule-update-denied";
    await runtime.query("BEGIN"); await setTenant(runtime, "tenant-a");
    await assert.rejects(runtime.query("UPDATE sst.third_party_integration_schedules SET scheduled_on = '2026-10-21' WHERE id = $1", [scheduleId]), { code: "42501" });
    await runtime.query("ROLLBACK");
    check = "cross-tenant-write-denied";
    await runtime.query("BEGIN"); await setTenant(runtime, "tenant-a");
    await assert.rejects(runtime.query("INSERT INTO sst.third_party_integration_decisions (tenant_id,id,scope_id,company_id,unit_id,requirement_set_id,fingerprint,notes,decided_by,decided_role,decided_at,decision_snapshot) VALUES ('tenant-b','cross-tenant','scope','company','unit','requirements-1',$1,'Tentativa','reviewer','sst_tst',$2,$3)", ["c".repeat(64), stamp, { scopeId: "scope", fingerprint: "c".repeat(64) }]), error => ["42501", "23503"].includes(error?.code));
    await runtime.query("ROLLBACK");
    await runtime.query("RESET ROLE");
  } finally { runtime.release(); }
  console.log("Gate de Terceiros isolado: RLS, requisitos/critério/avaliação versionados, decisão com auditoria atômica, rollback e bloqueio entre consultorias aprovados.");
} catch (error) {
  console.error(`Verificação isolada do gate não concluída na etapa ${stage}/${check} (${typeof error?.code === "string" ? error.code : "verification-error"}). Banco ativo não utilizado.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (started) {
    try { docker(["rm", "-f", name]); }
    catch { console.error(`Remoção do container temporário ${name} não confirmada.`); process.exitCode = 1; }
  }
}
