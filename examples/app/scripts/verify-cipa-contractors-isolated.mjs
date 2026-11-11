import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

// Prova isolada da migration 0020 (NR-5 seção 5.8 e Anexo I — contratadas e construção).
// Container descartável; nunca lê os .env do projeto e nunca toca banco persistente.
const name = `sst-cipa-cont-${randomUUID().slice(0, 8)}`;
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
    await client.query("SET ROLE sst_hoje_app");
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
  await pool.query(sql("0020_cipa_contractors_and_construction.sql"));
  checks++;
  console.log("✓ migration 0020 aplicada em container descartável");

  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-a','Sintético A'),('tenant-b','Sintético B')`);
  await pool.query(`INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at)
    VALUES ('tenant-a','comp-1','Contratante Sintética','Contratante','C','c@exemplo.invalid','0','active',now(),now())`);
  await pool.query(`INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state)
    VALUES ('tenant-a','unit-1','comp-1','00000000000000','Unidade','Cidade/UF')`);
  await pool.query(`INSERT INTO sst.nr5_standards (id, edition, issuing_act, valid_from, source_url, source_hash, status)
    VALUES ('nr5-2022','NR-05 2022','Portaria MTP 4.219/2022','2023-03-20','https://exemplo.invalid/nr5.pdf',$1,'draft')`, [HASH]);
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,started_on,ends_on,status,created_by,created_at)
     VALUES ('tenant-a','term-central','comp-1','unit-1','nr5-2022',1,'centralized',3,120,'2026-02-01','2027-01-31','active','elias',now())`,
  ));
  checks++;
  console.log("✓ dados de apoio: contratante, unidade e CIPA centralizada");

  // 1. Arranjo 'named_representative' (5.8.2).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,created_by,created_at)
     VALUES ('tenant-a','scope-rep','comp-1','unit-1','12345678000199','Caldeiraria Sintética Ltda',3,8,'named_representative','Fora do Quadro I para o porte da contratada (5.8.2)','2026-03-01','elias',now())`,
  ));
  checks++;
  console.log("✓ contratada com representante nomeado registrada (5.8.2)");

  // 2. CIPA própria no local (5.8.1.1).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,created_by,created_at)
     VALUES ('tenant-a','scope-own','comp-1','unit-1','98765432000155','Montagem Sintética S.A.',4,45,'own_cipa_on_site','Contratante GR 4 e contratada no Quadro I (5.8.1.1)','2026-03-01','elias',now())`,
  ));
  checks++;
  console.log("✓ contratada com CIPA própria no local registrada (5.8.1.1)");

  // 3. CIPA centralizada exige referência ao mandato.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,created_by,created_at)
       VALUES ('tenant-a','scope-central-bad','comp-1','unit-1','11111111000111','X Ltda',2,30,'centralized_cipa','Sem referência','2026-03-01','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ CIPA centralizada sem mandato de referência recusada");

  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,centralized_term_id,service_started_on,created_by,created_at)
     VALUES ('tenant-a','scope-central','comp-1','unit-1','11111111000111','Serviços Sintéticos Ltda',2,70,'centralized_cipa','Total na UF enquadra no Quadro I (5.8.1)','term-central','2026-03-01','elias',now())`,
  ));
  checks++;
  console.log("✓ CIPA centralizada vinculada ao mandato aceita (5.8.1)");

  // 4. Dispensa por serviço curto exige data de término (5.8.1.1.1).
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,created_by,created_at)
       VALUES ('tenant-a','scope-short-bad','comp-1','unit-1','22222222000122','Parada Sintética',3,20,'exempt_short_service','Serviço curto','2026-03-01','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ dispensa por serviço curto sem data de término recusada (5.8.1.1.1)");

  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,service_ends_on,created_by,created_at)
     VALUES ('tenant-a','scope-short','comp-1','unit-1','22222222000122','Parada Sintética',3,20,'exempt_short_service','Parada de 120 dias (5.8.1.1.1)','2026-03-01','2026-06-29','elias',now())`,
  ));
  checks++;
  console.log("✓ dispensa de 180 dias com término registrado aceita");

  // 5. Um arranjo vigente por contratada no mesmo estabelecimento.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,created_by,created_at)
       VALUES ('tenant-a','scope-dup','comp-1','unit-1','12345678000199','Caldeiraria Sintética Ltda',3,9,'named_representative','Duplicado','2026-04-01','elias',now())`,
    )),
    { code: "23505" },
  );
  checks++;
  console.log("✓ segundo arranjo vigente para a mesma contratada recusado");

  // 6. Convite para reunião da CIPA da contratante (5.8.7).
  await asTenant("tenant-a", (client) => client.query(
    `UPDATE sst.cipa_contractor_scopes SET meeting_invitation_at=now(), meeting_invitation_channel='E-mail com confirmação' WHERE id='scope-rep'`,
  ));
  checks++;
  console.log("✓ convite para reunião da contratante registrado (5.8.7)");

  // 7. CNPJ inválido recusado.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_contractor_scopes (tenant_id,id,company_id,unit_id,contractor_cnpj,contractor_name,client_risk_grade,employees_on_site,arrangement,rationale,service_started_on,created_by,created_at)
       VALUES ('tenant-a','scope-cnpj','comp-1','unit-1','12.345.678/0001-99','CNPJ formatado',2,6,'named_representative','x','2026-03-01','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ CNPJ fora do formato de 14 dígitos recusado");

  // 8. Canteiro de obras (Anexo I 3.1).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_construction_sites (tenant_id,id,company_id,unit_id,standard_id,site_code,site_name,started_on,expected_end_on,term_id,employee_count,work_fronts,cpo_registered_on,cpo_sent_to_union_on,status,created_by,created_at)
     VALUES ('tenant-a','site-1','comp-1','unit-1','nr5-2022','OB-001','Obra Sintética Caldeiraria','2026-03-01','2027-03-01','term-central',60,3,'2026-03-02','2026-03-11','active','elias',now())`,
  ));
  checks++;
  console.log("✓ canteiro de obras com CIPA e 3 frentes criado (Anexo I 3.1 / 3.1.3)");

  // 9. Representantes por frente de trabalho — um pode cobrir mais de uma (3.1.3.1).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_site_representatives (tenant_id,id,site_id,worker_id,appointing_party,work_front,appointed_on,valid_until,training_completed_on,training_valid_until,training_organization,status)
     VALUES ('tenant-a','sr-1','site-1','w-front-1','responsible_organization','Frente A','2026-03-05','2027-03-05','2026-03-20','2028-03-20','Org. Sintética','active'),
            ('tenant-a','sr-2','site-1','w-front-1','responsible_organization','Frente B','2026-03-05','2027-03-05','2026-03-20','2028-03-20','Org. Sintética','active')`,
  ));
  const fronts = await asTenant("tenant-a", (client) => client.query(
    "SELECT worker_id, work_front FROM sst.cipa_site_representatives ORDER BY work_front",
  ));
  assert.deepEqual(fronts.rows.map((r) => [r.worker_id, r.work_front]), [["w-front-1", "Frente A"], ["w-front-1", "Frente B"]]);
  checks++;
  console.log("✓ mesmo representante cobrindo duas frentes (Anexo I 3.1.3.1)");

  // 10. Prestadora no canteiro com 5+ empregados nomeia representante (3.2).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_site_representatives (tenant_id,id,site_id,worker_id,appointing_party,appointed_on,valid_until,training_completed_on,training_valid_until,status)
     VALUES ('tenant-a','sr-contractor','site-1','w-cont-1','contractor','2026-03-05','2027-03-05','2026-03-22','2028-03-22','active')`,
  ));
  checks++;
  console.log("✓ representante nomeado pela contratada no canteiro (Anexo I 3.2)");

  // 11. Segundo representante ativo da mesma parte/frente recusado.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_site_representatives (tenant_id,id,site_id,worker_id,appointing_party,work_front,appointed_on,valid_until,status)
       VALUES ('tenant-a','sr-dup','site-1','w-outro','responsible_organization','Frente A','2026-04-05','2027-04-05','active')`,
    )),
    { code: "23505" },
  );
  checks++;
  console.log("✓ segundo representante ativo na mesma frente recusado");

  // 12. Treinamento sem data de conclusão recusado (Anexo I 3.5.1).
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_site_representatives (tenant_id,id,site_id,worker_id,appointing_party,work_front,appointed_on,valid_until,training_valid_until,status)
       VALUES ('tenant-a','sr-bad','site-1','w-x','contractor','Frente C','2026-04-05','2027-04-05','2028-04-05','active')`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ treinamento sem conclusão recusado no Anexo I");

  // 13. Conclusão da obra formalizada e comunicada ao sindicato (Anexo I 3.7.2).
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      "UPDATE sst.cipa_construction_sites SET status='completed' WHERE id='site-1'",
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ obra concluída sem data de conclusão recusada");

  await asTenant("tenant-a", (client) => client.query(
    `UPDATE sst.cipa_construction_sites SET status='completed', completed_on='2027-02-20', completion_report_document_id='doc-1', completion_sent_to_union_on='2027-02-25' WHERE id='site-1'`,
  ));
  checks++;
  console.log("✓ conclusão da obra registrada com documento e envio ao sindicato (Anexo I 3.7.2)");

  // 14. Obra concluída não volta a ativa.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_construction_sites SET status='active' WHERE id='site-1'")),
    { code: "55000" },
  );
  checks++;
  console.log("✓ obra concluída não pode voltar a ativa");

  // 15. Arranjo encerrado não reabre (5.8.5).
  await asTenant("tenant-a", (client) => client.query(
    "UPDATE sst.cipa_contractor_scopes SET status='ended', ended_on='2026-12-31' WHERE id='scope-own'",
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_contractor_scopes SET status='active' WHERE id='scope-own'")),
    { code: "55000" },
  );
  checks++;
  console.log("✓ arranjo encerrado não reabre (5.8.5)");

  // 16. Evento de auditoria imutável.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_contractor_events (tenant_id,id,target_kind,target_id,action,actor_user_id,reason,occurred_at)
     VALUES ('tenant-a','ev-1','contractor_scope','scope-rep','contractor.arrangement_defined','elias','Arranjo definido conforme 5.8.2',now())`,
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_contractor_events SET reason='alterado'")),
    { code: "42501" },
  );
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("DELETE FROM sst.cipa_contractor_events")),
    { code: "42501" },
  );
  // A role administradora não apaga direto: o DELETE de dados de tenant é barrado pela RLS,
  // que exige sst.tenant_id definido. A preservação do histórico é garantida pelo trigger.
  await assert.rejects(
    pool.query("DELETE FROM sst.cipa_contractor_events"),
    (error) => ["42501", "55000"].includes(error.code),
  );
  checks++;
  console.log("✓ auditoria de terceiros imutável");

  // 17. Isolamento por tenant.
  const visibleToB = await asTenant("tenant-b", (client) => client.query("SELECT * FROM sst.cipa_contractor_scopes"));
  assert.equal(visibleToB.rowCount, 0);
  checks++;
  console.log("✓ isolamento por tenant em contratadas e obras");

  console.log(`\nPROVA CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
} finally {
  if (pool) await pool.end().catch(() => {});
  try { docker(["rm", "-f", name]); } catch {}
}
