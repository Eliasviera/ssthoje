import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

// Prova isolada da migration 0019 (CIPA: reuniões, atas, assinaturas e ações).
// Container descartável; nunca lê os .env do projeto e nunca toca banco persistente.
const name = `sst-cipa-meet-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
let pool;
let checks = 0;
const sql = (file) => readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), "utf8");
const HASH = "c05059a8423db7dc334fe97813b5833009b1310d05d32331494180b7372a6c55";
const contentHash = (text) => createHash("sha256").update(text).digest("hex");

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
  await pool.query(sql("0019_cipa_meetings_and_minutes.sql"));
  checks++;
  console.log("✓ migration 0019 aplicada em container descartável");

  // Dados de apoio.
  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-a','Sintético A'),('tenant-b','Sintético B')`);
  await pool.query(`INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at)
    VALUES ('tenant-a','comp-1','Empresa Sintética','Sintética','C','c@exemplo.invalid','0','active',now(),now())`);
  await pool.query(`INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state)
    VALUES ('tenant-a','unit-1','comp-1','00000000000000','Unidade','Cidade/UF')`);
  await pool.query(`INSERT INTO sst.nr5_standards (id, edition, issuing_act, valid_from, source_url, source_hash, status)
    VALUES ('nr5-2022','NR-05 2022','Portaria MTP 4.219/2022','2023-03-20','https://exemplo.invalid/nr5.pdf',$1,'draft')`, [HASH]);
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,started_on,ends_on,status,created_by,created_at)
     VALUES ('tenant-a','term-1','comp-1','unit-1','nr5-2022',1,'elected',3,60,'2026-02-01','2027-01-31','active','elias',now())`,
  ));
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_members (tenant_id,id,term_id,worker_id,representation,role,seat,mandate_source,elected_at,possession_on)
     VALUES ('tenant-a','m-pres','term-1','w1','employer','president','titular','designated',NULL,'2026-02-01'),
            ('tenant-a','m-vice','term-1','w2','employee','vice_president','titular','elected','2026-01-15','2026-02-01'),
            ('tenant-a','m-1','term-1','w3','employee','member','titular','elected','2026-01-15','2026-02-01')`,
  ));
  checks++;
  console.log("✓ mandato e membros sintéticos criados");

  // 1. Reunião ordinária mensal (5.6.1).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,modality,secretary_member_id,status,created_by,created_at)
     VALUES ('tenant-a','meet-1','term-1','ordinary',1,'2026-03-10 14:00-03','hybrid','m-1','scheduled','elias',now())`,
  ));
  checks++;
  console.log("✓ reunião ordinária agendada (5.6.1) com secretário e modalidade híbrida (5.6.5 / 5.6.2)");

  // 2. Extraordinária exige gatilho (5.6.4).
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,status,created_by,created_at)
       VALUES ('tenant-a','meet-bad','term-1','extraordinary',2,'2026-03-12 09:00-03','scheduled','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ extraordinária sem gatilho recusada (5.6.4)");

  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,extraordinary_reason,status,created_by,created_at)
     VALUES ('tenant-a','meet-2','term-1','extraordinary',2,'2026-03-12 09:00-03','serious_or_fatal_accident','scheduled','elias',now())`,
  ));
  checks++;
  console.log("✓ extraordinária com gatilho de acidente grave aceita (5.6.4 a)");

  // 3. Sequência única no mandato.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_meetings (tenant_id,id,term_id,meeting_type,sequence,scheduled_for,status,created_by,created_at)
       VALUES ('tenant-a','meet-dup','term-1','ordinary',1,'2026-04-10 14:00-03','scheduled','elias',now())`,
    )),
    { code: "23505" },
  );
  checks++;
  console.log("✓ duas reuniões com a mesma sequência recusadas");

  // 4. Realizar a reunião exige data.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_meetings SET status='held' WHERE id='meet-1'")),
    { code: "23514" },
  );
  checks++;
  console.log("✓ reunião marcada como realizada sem data recusada");

  await asTenant("tenant-a", (client) => client.query(
    `UPDATE sst.cipa_meetings SET status='held', held_at='2026-03-10 14:05-03', decision_mode='consensus' WHERE id='meet-1'`,
  ));
  checks++;
  console.log("✓ reunião realizada com decisão por consenso (5.6.8)");

  // 5. Presenças: falta justificada exige justificativa.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_meeting_attendance (tenant_id,meeting_id,member_id,attendance,recorded_at)
       VALUES ('tenant-a','meet-1','m-vice','absent_justified',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ falta justificada sem justificativa recusada");

  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_meeting_attendance (tenant_id,meeting_id,member_id,attendance,justification,recorded_at)
     VALUES ('tenant-a','meet-1','m-pres','present','',now()),
            ('tenant-a','meet-1','m-vice','absent','',now()),
            ('tenant-a','meet-1','m-1','remote','',now())`,
  ));
  const attendance = await asTenant("tenant-a", (client) => client.query(
    "SELECT member_id, attendance FROM sst.cipa_meeting_attendance ORDER BY member_id",
  ));
  assert.deepEqual(attendance.rows.map((r) => [r.member_id, r.attendance]), [["m-1", "remote"], ["m-pres", "present"], ["m-vice", "absent"]]);
  checks++;
  console.log("✓ presenças registradas, incluindo remota (5.6.2)");

  // 6. Ata: uma vigente por reunião.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_minutes (tenant_id,id,meeting_id,revision,content,written_by,status,created_at)
     VALUES ('tenant-a','min-1','meet-1',1,'Ata da 1ª reunião ordinária com pauta sintética.','m-1','draft',now())`,
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_minutes (tenant_id,id,meeting_id,revision,content,written_by,status,created_at)
       VALUES ('tenant-a','min-2','meet-1',2,'Segunda ata simultânea.','m-1','draft',now())`,
    )),
    { code: "23505" },
  );
  checks++;
  console.log("✓ apenas uma ata vigente por reunião");

  // 7. Ata finalizada não pode ser reescrita (nova revisão).
  await asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_minutes SET status='final' WHERE id='min-1'"));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_minutes SET content='Conteúdo trocado' WHERE id='min-1'")),
    { code: "55000" },
  );
  checks++;
  console.log("✓ ata finalizada não pode ser reescrita");

  // 8. Assinaturas dos presentes (5.6.3), com hash do conteúdo.
  const hash = contentHash("Ata da 1ª reunião ordinária com pauta sintética.");
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_minute_signatures (tenant_id,minute_id,signer_kind,member_id,signer_name,signed_at,content_hash)
     VALUES ('tenant-a','min-1','member','m-pres','Presidente Sintético',now(),$1),
            ('tenant-a','min-1','member','m-1','Membro Sintético',now(),$1),
            ('tenant-a','min-1','invited',NULL,'Convidado Sintético',now(),$1)`,
    [hash],
  ));
  const signatures = await asTenant("tenant-a", (client) => client.query("SELECT count(*)::int AS total FROM sst.cipa_minute_signatures"));
  assert.equal(signatures.rows[0].total, 3);
  checks++;
  console.log("✓ ata assinada por membros e convidado, com hash do conteúdo");

  // 9. Assinatura 'member' exige member_id.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_minute_signatures (tenant_id,minute_id,signer_kind,member_id,signer_name,signed_at,content_hash)
       VALUES ('tenant-a','min-1','member',NULL,'Sem vínculo',now(),$1)`,
      [hash],
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ assinatura de membro sem vínculo recusada");

  // 10. Ações com responsável e prazo; concluir exige data.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_actions (tenant_id,id,meeting_id,description,responsible_member_id,due_on,status,created_at)
     VALUES ('tenant-a','act-1','meet-1','Revisar mapa de risco da área sintética','m-1','2026-04-10','open',now())`,
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_actions SET status='done' WHERE id='act-1'")),
    { code: "23514" },
  );
  checks++;
  console.log("✓ ação concluída sem data de conclusão recusada");

  await asTenant("tenant-a", (client) => client.query(
    "UPDATE sst.cipa_actions SET status='done', completed_on='2026-04-05' WHERE id='act-1'",
  ));
  checks++;
  console.log("✓ ação concluída com data");

  // 11. Ação sem responsável identificável recusada.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_actions (tenant_id,id,meeting_id,description,status,created_at)
       VALUES ('tenant-a','act-bad','meet-1','Ação sem responsável','open',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ ação sem responsável recusada");

  // 12. Evento de perda de mandato por faltas (5.6.6), imutável.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_meeting_events (tenant_id,id,meeting_id,action,subject_member_id,actor_user_id,reason,occurred_at)
     VALUES ('tenant-a','ev-1','meet-1','mandate.lost_by_absence','m-vice','elias','Mais de quatro faltas ordinárias sem justificativa',now())`,
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_meeting_events SET reason='alterado'")),
    { code: "42501" },
  );
  await assert.rejects(pool.query("DELETE FROM sst.cipa_meeting_events"), { code: "55000" });
  checks++;
  console.log("✓ evento de perda de mandato gravado e imutável (5.6.6)");

  // 13. Divulgação das deliberações (5.6.3.2).
  await asTenant("tenant-a", (client) => client.query(
    `UPDATE sst.cipa_meetings SET deliberations_published_at=now(), deliberations_channel='Quadro de avisos + e-mail' WHERE id='meet-1'`,
  ));
  checks++;
  console.log("✓ deliberações publicadas com canal registrado (5.6.3.2)");

  // 14. Reunião realizada não volta a agendada.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_meetings SET status='scheduled' WHERE id='meet-1'")),
    { code: "55000" },
  );
  checks++;
  console.log("✓ reunião realizada não volta a agendada");

  // 15. Isolamento por tenant.
  const visibleToB = await asTenant("tenant-b", (client) => client.query("SELECT * FROM sst.cipa_meetings"));
  assert.equal(visibleToB.rowCount, 0);
  checks++;
  console.log("✓ isolamento por tenant nas reuniões");

  // 16. Contagem de faltas para alerta de 5.6.6 (regra de leitura, não de banco).
  const absences = await asTenant("tenant-a", (client) => client.query(
    `SELECT m.member_id, count(*)::int AS faltas
       FROM sst.cipa_meeting_attendance m
       JOIN sst.cipa_meetings mt ON mt.tenant_id = m.tenant_id AND mt.id = m.meeting_id
      WHERE m.attendance = 'absent' AND mt.meeting_type = 'ordinary' AND mt.status = 'held'
      GROUP BY m.member_id`,
  ));
  assert.deepEqual(absences.rows.map((r) => [r.member_id, r.faltas]), [["m-vice", 1]]);
  checks++;
  console.log("✓ contagem de faltas em ordinárias consultável para o alerta de 5.6.6");

  console.log(`\nPROVA CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
} finally {
  if (pool) await pool.end().catch(() => {});
  try { docker(["rm", "-f", name]); } catch {}
}
