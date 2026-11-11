import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

// Prova isolada da migration 0022 (SIPAT da CIPA).
// Container descartável; nunca lê os .env do projeto e nunca toca banco persistente.
const name = `sst-sipat-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
let pool;
let checks = 0;
const sql = (file) => readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), "utf8");
const HASH = "c05059a8423db7dc334fe97813b5833009b1310d05d32331494180b7372a6c55";

async function asTenant(tenant, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE sst_hoje_app");
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
  for (const file of ["0001_tenant_registry.sql", "0004_client_companies.sql", "0016_nr5_cipa_standard_catalog.sql", "0018_cipa_terms_and_members.sql"]) {
    await pool.query(sql(file));
  }
  await pool.query(sql("0022_sipat.sql"));
  checks++;
  console.log("✓ migration 0022 aplicada em container descartável");

  // Dados de apoio
  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-a','Sintético A')`);
  await pool.query(`INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at)
    VALUES ('tenant-a','comp-1','Empresa Sintética','Sintética','C','c@exemplo.invalid','0','active',now(),now())`);
  await pool.query(`INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state)
    VALUES ('tenant-a','unit-1','comp-1','00000000000000','Unidade','Cidade/UF')`);
  await pool.query(`INSERT INTO sst.nr5_standards (id, edition, issuing_act, valid_from, source_url, source_hash, status)
    VALUES ('nr5-2022','NR-05 2022','Portaria MTP 4.219/2022','2023-03-20','https://x.com/y.pdf',$1,'draft')`, [HASH]);
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,started_on,ends_on,status,created_by,created_at)
     VALUES ('tenant-a','term-1','comp-1','unit-1','nr5-2022',1,'elected',3,34,'2026-02-01','2027-01-31','active','elias',now())`,
  ));
  checks++;
  console.log("✓ mandato de apoio criado");

  // 1. Planejamento da SIPAT anual (5.3.1.i).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.sipat_weeks (tenant_id,id,term_id,year,theme,scheduled_from,scheduled_to,sesmt_partner,sesmt_partner_name,status,created_by,created_at)
     VALUES ('tenant-a','sipat-2026','term-1',2026,'SST é compromisso de todos','2026-10-19','2026-10-23',true,'SESMT Horizonte','planned','elias',now())`,
  ));
  checks++;
  console.log("✓ SIPAT 2026 planejada com SESMT em conjunto (5.3.1.i)");

  // 2. Uma SIPAT por ano por CIPA.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.sipat_weeks (tenant_id,id,term_id,year,theme,scheduled_from,scheduled_to,sesmt_partner,status,created_by,created_at)
       VALUES ('tenant-a','sipat-2026b','term-1',2026,'Outra','2026-11-01','2026-11-05',false,'planned','elias',now())`,
    )),
    { code: "23505" },
  );
  checks++;
  console.log("✓ segunda SIPAT no mesmo ano recusada (única por ano)");

  // 3. Datas coerentes.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.sipat_weeks (tenant_id,id,term_id,year,theme,scheduled_from,scheduled_to,sesmt_partner,status,created_by,created_at)
       VALUES ('tenant-a','sipat-bad','term-1',2027,'x','2026-12-10','2026-12-05',false,'planned','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ SIPAT com fim antes do início recusada");

  // 4. SESMT: parceiro exige nome.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.sipat_weeks (tenant_id,id,term_id,year,theme,scheduled_from,scheduled_to,sesmt_partner,sesmt_partner_name,status,created_by,created_at)
       VALUES ('tenant-a','sipat-bad2','term-1',2028,'x','2028-10-01','2028-10-05',true,'','planned','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ declarar participação do SESMT sem nome recusado");

  // 5. Atividades da programação.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.sipat_activities (tenant_id,id,week_id,starts_on,starts_at,duration_minutes,activity_type,title,speaker,location,target_audience,created_by,created_at)
     VALUES ('tenant-a','sipat-at-1','sipat-2026','2026-10-19','08:30',60,'palestra','Prevenção de acidentes: papel da liderança','Elias (engenheiro de segurança)','Auditório','Toda a equipe','elias',now()),
            ('tenant-a','sipat-at-2','sipat-2026','2026-10-20','09:00',120,'treinamento','Uso correto de EPI e CA','Técnico de segurança','Almoxarifado','Produção','elias',now()),
            ('tenant-a','sipat-at-3','sipat-2026','2026-10-21','14:00',45,'dinamica','Mapa de risco participativo','CIPA','Galpão','Operadores','elias',now())`,
  ));
  const at = await asTenant("tenant-a", (client) => client.query("SELECT count(*)::int AS n FROM sst.sipat_activities WHERE week_id='sipat-2026'"));
  assert.equal(at.rows[0].n, 3);
  checks++;
  console.log("✓ programação com 3 atividades (palestra, treinamento, dinâmica)");

  // 6. Atividade com duração inválida.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.sipat_activities (tenant_id,id,week_id,starts_on,starts_at,duration_minutes,activity_type,title,created_by,created_at)
       VALUES ('tenant-a','sipat-at-bad','sipat-2026','2026-10-22','10:00',0,'outra','x','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ atividade com duração zero recusada");

  // 7. Realização exige data.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.sipat_weeks SET status='held' WHERE id='sipat-2026'")),
    { code: "23514" },
  );
  checks++;
  console.log("✓ SIPAT marcada como realizada sem data recusada");

  await asTenant("tenant-a", (client) => client.query(
    `UPDATE sst.sipat_weeks SET status='held', held_on='2026-10-23', attendance=120, report_document_id='doc-sipat' WHERE id='sipat-2026'`,
  ));
  const held = await asTenant("tenant-a", (client) => client.query("SELECT status, attendance FROM sst.sipat_weeks WHERE id='sipat-2026'"));
  assert.deepEqual([held.rows[0].status, held.rows[0].attendance], ["held", 120]);
  checks++;
  console.log("✓ SIPAT realizada com 120 participantes");

  // 8. Realizada não volta a planejada.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.sipat_weeks SET status='planned' WHERE id='sipat-2026'")),
    { code: "55000" },
  );
  checks++;
  console.log("✓ SIPAT realizada não volta a planejada");

  // 9. Auditoria imutável.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.sipat_events (tenant_id,id,week_id,action,actor_user_id,reason,occurred_at)
     VALUES ('tenant-a','ev-1','sipat-2026','sipat.held','elias','Realizada conforme programação da CIPA',now())`,
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.sipat_events SET reason='x'")),
    { code: "42501" },
  );
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("DELETE FROM sst.sipat_events")),
    { code: "42501" },
  );
  checks++;
  console.log("✓ auditoria da SIPAT imutável");

  // 10. Isolamento por tenant + RLS.
  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-b','B')`);
  const visible = await asTenant("tenant-b", (client) => client.query("SELECT * FROM sst.sipat_weeks"));
  assert.equal(visible.rowCount, 0);
  await assert.rejects(
    asTenant("tenant-b", (client) => client.query(
      `INSERT INTO sst.sipat_weeks (tenant_id,id,term_id,year,theme,scheduled_from,scheduled_to,sesmt_partner,status,created_by,created_at)
       VALUES ('tenant-a','x','term-1',2029,'x','2029-10-01','2029-10-05',false,'planned','elias',now())`,
    )),
    { code: "42501" },
  );
  checks++;
  console.log("✓ isolamento por tenant da SIPAT confirmado");

  console.log(`\nPROVA CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
} finally {
  if (pool) await pool.end().catch(() => {});
  try { docker(["rm", "-f", name]); } catch {}
}
