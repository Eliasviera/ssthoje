import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

// Prova isolada da migration 0016 (catálogo NR-5 / CIPA).
// Container descartável; nunca lê os .env do projeto e nunca toca banco persistente.
const name = `sst-nr5-proof-${randomUUID().slice(0, 8)}`;
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
  await pool.query(sql("0001_tenant_registry.sql"));
  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-a','Sintético A'),('tenant-b','Sintético B') ON CONFLICT (id) DO NOTHING`);
  await pool.query(sql("0016_nr5_cipa_standard_catalog.sql"));
  checks++;
  console.log("✓ migration 0016 aplicada em container descartável");

  // 1. Edição entra como rascunho.
  await pool.query(
    `INSERT INTO sst.nr5_standards (id, edition, issuing_act, issued_at, valid_from, source_url, source_hash, status)
     VALUES ('nr5-2022','NR-05 atualizada 2022','Portaria MTP nº 4.219, de 20/12/2022','2022-12-22','2023-03-20','https://exemplo.invalid/nr5.pdf',$1,'draft')`,
    [HASH],
  );
  checks++;
  console.log("✓ edição da NR-5 inserida como rascunho");

  // 2. Publicação sem revisor é recusada.
  await assert.rejects(
    pool.query("UPDATE sst.nr5_standards SET status='active' WHERE id='nr5-2022'"),
    { code: "23514" },
  );
  checks++;
  console.log("✓ publicação sem conferência humana recusada");

  // 3. Quadro I — faixas do grau de risco 1 e 3 (amostra sintética, não é a norma inteira).
  await pool.query(
    `INSERT INTO sst.nr5_dimension_bands (id, standard_id, risk_grade, employees_from, employees_to, effective_members, substitute_members, notes)
     VALUES ('g1-0-19','nr5-2022',1,0,19,1,1,''),
            ('g1-20-29','nr5-2022',1,20,29,1,1,''),
            ('g3-101-120','nr5-2022',3,101,120,3,2,''),
            ('g3-2501-5000','nr5-2022',3,2501,5000,8,6,'')`,
  );
  const bands = await pool.query("SELECT * FROM sst.nr5_dimension_bands WHERE risk_grade=3 ORDER BY employees_from");
  assert.equal(bands.rowCount, 2);
  assert.equal(bands.rows[1].effective_members, 8);
  checks++;
  console.log("✓ Quadro I gravado por grau de risco e faixa de empregados");

  // 4. Grau de risco inválido recusado.
  await assert.rejects(
    pool.query(
      `INSERT INTO sst.nr5_dimension_bands (id, standard_id, risk_grade, employees_from, effective_members, substitute_members)
       VALUES ('g5','nr5-2022',5,0,1,1)`,
    ),
    { code: "23514" },
  );
  checks++;
  console.log("✓ grau de risco fora de 1–4 recusado");

  // 5. Treinamento por grau de risco (5.7.4) e representante nomeado.
  await pool.query(
    `INSERT INTO sst.nr5_training_requirements (id, standard_id, audience, risk_grade, min_hours, distance_learning_allowed, deadline_days_after_possession, reuse_within_months, source_item)
     VALUES ('tr-g1','nr5-2022','cipa_member',1,8,true,30,24,'5.7.1.1/5.7.3/5.7.4'),
            ('tr-g2','nr5-2022','cipa_member',2,12,false,30,24,'5.7.1.1/5.7.3/5.7.4'),
            ('tr-g3','nr5-2022','cipa_member',3,16,false,30,24,'5.7.1.1/5.7.3/5.7.4'),
            ('tr-g4','nr5-2022','cipa_member',4,20,false,30,24,'5.7.1.1/5.7.3/5.7.4'),
            ('tr-rep','nr5-2022','named_representative',NULL,8,true,NULL,24,'5.7.4.3/Anexo I 3.5.1')`,
  );
  const training = await pool.query("SELECT risk_grade, min_hours FROM sst.nr5_training_requirements WHERE audience='cipa_member' ORDER BY risk_grade");
  assert.deepEqual(training.rows.map((row) => [row.risk_grade, Number(row.min_hours)]), [[1, 8], [2, 12], [3, 16], [4, 20]]);
  checks++;
  console.log("✓ cargas horárias de treinamento por grau de risco gravadas (8/12/16/20)");

  // 6. Prazos do processo eleitoral (5.5.1, 5.5.3).
  await pool.query(
    `INSERT INTO sst.nr5_election_rules (id, standard_id, code, description, min_days, source_item)
     VALUES ('el-convocacao','nr5-2022','election.call_notice','Convocação mínima antes do término do mandato',60,'5.5.1'),
            ('el-inscricao','nr5-2022','election.registration','Período mínimo de inscrição',15,'5.5.3 b'),
            ('el-eleicao','nr5-2022','election.ballot','Eleição mínima antes do término do mandato',30,'5.5.3 f')`,
  );
  const rules = await pool.query("SELECT code, min_days FROM sst.nr5_election_rules ORDER BY min_days");
  assert.deepEqual(rules.rows.map((row) => [row.code, row.min_days]), [
    ["election.registration", 15], ["election.ballot", 30], ["election.call_notice", 60],
  ]);
  checks++;
  console.log("✓ prazos eleitorais gravados (15 inscrição / 30 eleição / 60 convocação)");

  // 7. Publicação com conferência humana.
  await pool.query(
    `UPDATE sst.nr5_standards SET status='active', reviewer='Elias (engenheiro)', reviewed_at=now(), published_by='Elias', published_at=now() WHERE id='nr5-2022'`,
  );
  checks++;
  console.log("✓ edição publicada com revisor e data");

  // 8. Só uma edição vigente da NR-5.
  await pool.query(
    `INSERT INTO sst.nr5_standards (id, edition, issuing_act, valid_from, source_url, source_hash, status)
     VALUES ('nr5-2027','NR-05 2027','Portaria fictícia','2027-01-01','https://exemplo.invalid/x.pdf',$1,'draft')`,
    [HASH],
  );
  await assert.rejects(
    pool.query(
      `UPDATE sst.nr5_standards SET status='active', reviewer='X', reviewed_at=now(), published_by='X', published_at=now() WHERE id='nr5-2027'`,
    ),
    { code: "23505" },
  );
  checks++;
  console.log("✓ duas edições vigentes da NR-5 recusadas");

  // 9. Conferência por tenant, com RLS e isolamento.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.nr5_standard_reviews (tenant_id, id, standard_id, reviewer, decision, source_hash, method, notes, reviewed_at)
     VALUES ('tenant-a','rev-1','nr5-2022','Elias (engenheiro)','approved',$1,'manual_transcription','Quadro I conferido',now())`,
    [HASH],
  ));
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.nr5_dimension_band_entries (tenant_id, review_id, band_id, snapshot)
     VALUES ('tenant-a','rev-1','g3-101-120','{"effective":3,"substitute":2}'::jsonb)`,
  ));
  const visibleToB = await asTenant("tenant-b", (client) => client.query("SELECT * FROM sst.nr5_standard_reviews"));
  assert.equal(visibleToB.rowCount, 0);
  checks++;
  console.log("✓ conferência gravada e isolada por tenant (tenant-b vê 0)");

  // 10. Gravação cross-tenant recusada.
  await assert.rejects(
    asTenant("tenant-b", (client) => client.query(
      `INSERT INTO sst.nr5_standard_reviews (tenant_id, id, standard_id, reviewer, decision, source_hash, method, reviewed_at)
       VALUES ('tenant-a','rev-x','nr5-2022','Intruso','approved',$1,'manual_transcription',now())`,
      [HASH],
    )),
    { code: "42501" },
  );
  checks++;
  console.log("✓ gravação cross-tenant recusada pela RLS");

  // 11. Histórico imutável e catálogo não apagável.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.nr5_standard_reviews SET notes='alterado'")),
    { code: "42501" },
  );
  await assert.rejects(pool.query("DELETE FROM sst.nr5_standard_reviews"), { code: "55000" });
  await assert.rejects(pool.query("DELETE FROM sst.nr5_standards"), { code: "55000" });
  checks++;
  console.log("✓ histórico append-only e catálogo não apagável");

  // 12. Fonte sem SHA-256 válido recusada.
  await assert.rejects(
    pool.query(
      `INSERT INTO sst.nr5_standards (id, edition, issuing_act, valid_from, source_url, source_hash, status)
       VALUES ('nr5-sem-hash','x','y','2024-01-01','','abc','draft')`,
    ),
    { code: "23514" },
  );
  checks++;
  console.log("✓ fonte sem SHA-256 válido recusada");

  console.log(`\nPROVA CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
} finally {
  if (pool) await pool.end().catch(() => {});
  try { docker(["rm", "-f", name]); } catch {}
}
