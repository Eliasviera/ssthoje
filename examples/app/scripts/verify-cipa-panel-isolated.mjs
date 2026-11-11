import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import pg from "pg";

// Prova isolada do painel de CIPA (src/lib/cipa-overview-read.ts) sobre PostgreSQL 17 descartável.
// Carrega o módulo TypeScript com o mesmo loader da suíte, apontando o pool para o container temporário.
const name = `sst-cipa-panel-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
let pool;
let checks = 0;
const sql = (file) => readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), "utf8");
const HASH = "c05059a8423db7dc334fe97813b5833009b1310d05d32331494180b7372a6c55";

// Módulos "server-only" e dependências do app não existem neste contexto isolado.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export default {};", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

async function asTenant(tenant, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('sst.tenant_id', $1, true)", [tenant]);
    const result = await operation(client);
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
  docker(["run", "--rm", "-d", "--name", name, "-e", `POSTGRES_PASSWORD=${password}`, "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  const mapping = docker(["port", name, "5432/tcp"]).split(/\r?\n/)[0];
  const port = Number(mapping.slice(mapping.lastIndexOf(":") + 1));
  assert.ok(Number.isInteger(port) && port > 0);
  pool = new pg.Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password, connectionTimeoutMillis: 1000, max: 4 });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await pool.query("SELECT 1"); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  assert.ok(ready, "PostgreSQL temporário indisponível");

  await pool.query(`CREATE SCHEMA sst; CREATE ROLE sst_hoje_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA sst TO sst_hoje_app`);
  await pool.query("CREATE DATABASE sst_hoje_dev");
  for (const file of [
    "0001_tenant_registry.sql", "0004_client_companies.sql", "0016_nr5_cipa_standard_catalog.sql",
    "0018_cipa_terms_and_members.sql", "0019_cipa_meetings_and_minutes.sql",
    "0020_cipa_contractors_and_construction.sql", "0021_cipa_member_training.sql",
  ]) {
    await pool.query(sql(file));
  }
  checks++;
  console.log("✓ schema completo da CIPA aplicado (0001/0004/0016/0018–0021)");

  // Dados sintéticos: mandato vencendo, sem vice, com reunião atrasada, faltas excessivas e contratada sem nomeação.
  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-a','Sintético A'),('tenant-b','Sintético B')`);
  await pool.query(`INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at)
    VALUES ('tenant-a','comp-1','Contratante Sintética Ltda','Contratante','C','c@exemplo.invalid','0','active',now(),now())`);
  await pool.query(`INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state)
    VALUES ('tenant-a','unit-1','comp-1','00000000000000','Unidade Caldeiraria','Cidade/UF')`);
  await pool.query(`INSERT INTO sst.nr5_standards (id, edition, issuing_act, valid_from, source_url, source_hash, status)
    VALUES ('nr5-2022','NR-05 2022','Portaria MTP 4.219/2022','2023-03-20','https://exemplo.invalid/nr5.pdf',$1,'draft')`, [HASH]);
  await pool.query(`INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,started_on,ends_on,status,created_by,created_at)
    VALUES ('tenant-a','term-1','comp-1','unit-1','nr5-2022',1,'elected',3,80,'2025-12-01','2026-11-30','active','elias',now())`);
  await pool.query(`INSERT INTO sst.cipa_members (tenant_id,id,term_id,worker_id,representation,role,seat,mandate_source,elected_at,possession_on,stability_until,status,training_completed_on,training_valid_until,training_hours)
    VALUES ('tenant-a','m-pres','term-1','w-pres','employer','president','titular','designated',NULL,'2025-12-01',NULL,'active','2025-11-20','2026-11-20',12),
           ('tenant-a','m-1','term-1','w-1','employee','member','titular','elected','2025-11-15','2025-12-01','2027-01-15','active',NULL,NULL,NULL)`);
  // Reunião ordinária há 3 meses (mensal atrasada) e faltas do membro m-1.
  await pool.query(`INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,held_at,status,created_by,created_at)
    VALUES ('tenant-a','meet-1','term-1','ordinary',1,'2026-08-10 14:00-03','2026-08-10 14:00-03','held','elias',now())`);
  await pool.query(`INSERT INTO sst.cipa_meeting_attendance (tenant_id,meeting_id,member_id,attendance,recorded_at)
    VALUES ('tenant-a','meet-1','m-1','absent',now())`);
  // Contratada que exige representante nomeado e não tem.
  await pool.query(`INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,created_by,created_at)
    VALUES ('tenant-a','scope-1','comp-1','unit-1','12345678000199','Caldeiraria Terceira Ltda',3,9,'named_representative','Fora do Quadro I (5.8.2)','2026-03-01','elias',now())`);
  checks++;
  console.log("✓ dados sintéticos criados (mandato, membros, reunião, faltas, contratada)");

  const { loadCipaOverviewInTransaction, loadCipaAlertsInTransaction, shiftDays, addMonths } =
    await import("../src/lib/cipa-overview-read.ts");

  // Utilitários de data
  assert.equal(shiftDays("2026-11-30", -60), "2026-10-01");
  assert.equal(addMonths("2026-08-10", 1), "2026-09-10");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  checks++;
  console.log("✓ utilitários de data corretos (60 dias e virada de mês)");

  const overview = await asTenant("tenant-a", (client) =>
    loadCipaOverviewInTransaction(client, { userId: "elias", tenantId: "tenant-a", membershipRole: "consultoria_admin" }, "2026-11-04"));

  assert.equal(overview.terms.length, 1);
  const term = overview.terms[0];
  assert.equal(term.companyName, "Contratante");
  assert.equal(term.unitName, "Unidade Caldeiraria");
  assert.equal(term.endsOn, "2026-11-30");
  assert.equal(term.electionDeadline, "2026-10-01");
  assert.equal(term.ballotDeadline, "2026-10-31");
  assert.equal(term.hasPresident, true);
  assert.equal(term.hasVice, false);
  assert.equal(term.membersActive, 2);
  checks++;
  console.log("✓ resumo do mandato com prazos de eleição calculados (5.5.1 / 5.5.3 f)");

  const codes = overview.alerts.map((alert) => alert.code);
  console.log("   alertas:", codes.join(", "));
  for (const expected of [
    "term.ending", "election.call_notice", "composition.missing_vice",
    "meeting.ordinary_overdue", "member.stability_ending", "member.training_expiring",
    "contractor.missing_named_representative",
  ]) {
    assert.ok(codes.includes(expected), `alerta ausente: ${expected}`);
  }
  checks++;
  console.log(`✓ ${codes.length} alertas gerados com os códigos esperados`);

  // Toda mensagem de alerta cita o item da norma.
  for (const alert of overview.alerts) {
    assert.match(alert.normItem, /^(5\.\d|[A-Z])/, `item normativo inválido em ${alert.code}`);
    assert.ok(alert.message.length > 10, `mensagem curta em ${alert.code}`);
  }
  checks++;
  console.log("✓ todos os alertas citam item da NR-5 e trazem mensagem");

  // Severidades
  const ending = overview.alerts.find((alert) => alert.code === "term.ending");
  // Mandato ainda vigente gera alerta de aviso; vencido gera crítico.
  assert.equal(ending.severity, "warning");
  assert.equal(ending.daysRemaining, 26);
  const retained = overview.alerts.find((alert) => alert.code === "term.retention_window");
  assert.equal(retained, undefined, "mandato vigente não deve gerar alerta de guarda");
  checks++;
  console.log("✓ severidade e dias restantes corretos (26 dias para o fim do mandato)");

  // Totais
  assert.equal(overview.totals.activeTerms, 1);
  assert.equal(overview.totals.membersActive, 2);
  assert.equal(overview.totals.meetingsHeldLast12Months, 1);
  assert.ok(overview.totals.criticalAlerts >= 2);
  checks++;
  console.log("✓ contadores do painel conferem");

  // Faltas: com 1 falta não há alerta de 5.6.6.
  assert.ok(!codes.includes("member.excess_absences"));
  // Simula 5 faltas.
  for (let i = 2; i <= 5; i++) {
    const month = String(i + 5).padStart(2, '0');
    await pool.query(`INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,held_at,status,created_by,created_at)
      VALUES ('tenant-a',$1,'term-1','ordinary',$2,($3 || ' 14:00-03')::timestamptz,($3 || ' 14:00-03')::timestamptz,'held','elias',now())`,
      [`meet-${i}`, i, `2026-${month}-10`]);
    await pool.query(`INSERT INTO sst.cipa_meeting_attendance (tenant_id,meeting_id,member_id,attendance,recorded_at)
      VALUES ('tenant-a',$1,'m-1','absent',now())`, [`meet-${i}`]);
  }
  const alertsAfter = await asTenant("tenant-a", (client) => loadCipaAlertsInTransaction(client, "tenant-a", "2026-11-04"));
  const absence = alertsAfter.find((alert) => alert.code === "member.excess_absences");
  assert.ok(absence, "alerta de faltas excessivas não apareceu com 5 faltas");
  assert.equal(absence.severity, "critical");
  assert.equal(absence.normItem, "5.6.6");
  checks++;
  console.log("✓ alerta de perda de mandato por faltas (5.6.6) dispara com mais de 4 faltas");

  // Isolamento: tenant-b não vê nada.
  const other = await asTenant("tenant-b", (client) =>
    loadCipaOverviewInTransaction(client, { userId: "x", tenantId: "tenant-b", membershipRole: "consultoria_admin" }, "2026-11-04"));
  assert.equal(other.terms.length, 0);
  assert.equal(other.alerts.length, 0);
  checks++;
  console.log("✓ isolamento por tenant: tenant-b vê painel vazio");

  // Guarda documental após encerrar o mandato (5.9.2).
  await pool.query(`UPDATE sst.cipa_terms SET status='ended', ended_on='2026-11-30', end_reason='Fim do mandato' WHERE id='term-1'`);
  const afterEnd = await asTenant("tenant-a", (client) => loadCipaAlertsInTransaction(client, "tenant-a", "2026-11-04"));
  const retention = afterEnd.find((alert) => alert.code === "term.retention_window");
  assert.ok(retention, "alerta de guarda documental ausente após encerrar o mandato");
  assert.equal(retention.normItem, "5.9.2");
  assert.ok(retention.daysRemaining > 1800);
  checks++;
  console.log("✓ prazo de guarda de 5 anos calculado após o término do mandato (5.9.2)");

  console.log(`\nPROVA CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
} finally {
  if (pool) await pool.end().catch(() => {});
  try { docker(["rm", "-f", name]); } catch {}
}
