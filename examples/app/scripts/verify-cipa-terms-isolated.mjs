import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

// Prova isolada da migration 0018 (CIPA: mandato, membros e representante nomeado).
// Container descartável; nunca lê os .env do projeto e nunca toca banco persistente.
const name = `sst-cipa-term-${randomUUID().slice(0, 8)}`;
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

const addMember = (client, overrides = {}) => {
  const row = {
    tenant_id: "tenant-a", id: overrides.id ?? `m-${randomUUID().slice(0, 6)}`, term_id: "term-1",
    worker_id: overrides.worker_id ?? `w-${randomUUID().slice(0, 6)}`,
    representation: "employee", role: "member", seat: "titular",
    mandate_source: "elected", elected_at: "2026-01-15", possession_on: "2026-02-01",
    stability_until: "2028-02-01", ...overrides,
  };
  return client.query(
    `INSERT INTO sst.cipa_members (tenant_id, id, term_id, worker_id, representation, role, seat, mandate_source, elected_at, possession_on, stability_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [row.tenant_id, row.id, row.term_id, row.worker_id, row.representation, row.role, row.seat,
     row.mandate_source, row.elected_at, row.possession_on, row.stability_until],
  );
};

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
  for (const file of ["0001_tenant_registry.sql", "0004_client_companies.sql", "0016_nr5_cipa_standard_catalog.sql"]) {
    await pool.query(sql(file));
  }
  await pool.query(sql("0018_cipa_terms_and_members.sql"));
  checks++;
  console.log("✓ migration 0018 aplicada em container descartável");

  // Dados de apoio sintéticos.
  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-a','Sintético A'),('tenant-b','Sintético B')`);
  await pool.query(`INSERT INTO sst.client_companies (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at)
    VALUES ('tenant-a','comp-1','Empresa Sintética Ltda','Sintética','Contato','c@exemplo.invalid','0','active',now(),now())`);
  await pool.query(`INSERT INTO sst.client_units (tenant_id,id,company_id,cnpj,name,city_state)
    VALUES ('tenant-a','unit-1','comp-1','00000000000000','Unidade Sintética','Cidade/UF')`);
  await pool.query(`INSERT INTO sst.nr5_standards (id, edition, issuing_act, valid_from, source_url, source_hash, status)
    VALUES ('nr5-2022','NR-05 atualizada 2022','Portaria MTP 4.219/2022','2023-03-20','https://exemplo.invalid/nr5.pdf',$1,'draft')`, [HASH]);
  await pool.query(`INSERT INTO sst.nr5_dimension_bands (id, standard_id, risk_grade, employees_from, employees_to, effective_members, substitute_members)
    VALUES ('g3-51-80','nr5-2022',3,51,80,2,2)`);
  checks++;
  console.log("✓ dados de apoio sintéticos criados");

  // 1. Mandato entra como rascunho.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,dimension_band_id,started_on,ends_on,possession_on,status,created_by,created_at)
     VALUES ('tenant-a','term-1','comp-1','unit-1','nr5-2022',1,'elected',3,60,'g3-51-80','2026-02-01','2027-01-31','2026-02-01','draft','elias',now())`,
  ));
  checks++;
  console.log("✓ mandato de 1 ano criado em rascunho (5.4.6)");

  // 2. Vigência: ends_on precisa ser posterior a started_on.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,started_on,ends_on,status,created_by,created_at)
       VALUES ('tenant-a','term-bad','comp-1','unit-1','nr5-2022',9,'elected',3,60,'2026-02-01','2025-02-01','draft','elias',now())`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ mandato com fim anterior ao início recusado");

  // 3. Ativação do mandato.
  await asTenant("tenant-a", (client) => client.query(
    "UPDATE sst.cipa_terms SET status='active' WHERE id='term-1'",
  ));
  checks++;
  console.log("✓ mandato ativado");

  // 4. Só uma CIPA vigente por estabelecimento.
  await assert.rejects(
    asTenant("tenant-a", async (client) => {
      await client.query(
        `INSERT INTO sst.cipa_terms (tenant_id,id,company_id,unit_id,standard_id,term_number,constitution,risk_grade,employee_count,started_on,ends_on,status,created_by,created_at)
         VALUES ('tenant-a','term-2','comp-1','unit-1','nr5-2022',2,'elected',3,60,'2027-02-01','2028-01-31','draft','elias',now())`,
      );
      await client.query("UPDATE sst.cipa_terms SET status='active' WHERE id='term-2'");
    }),
    { code: "23505" },
  );
  checks++;
  console.log("✓ duas CIPAs vigentes no mesmo estabelecimento recusadas");

  // 5. Composição: presidente do empregador, vice dos empregados (5.4.5).
  await asTenant("tenant-a", (client) => addMember(client, {
    id: "m-pres", representation: "employer", role: "president", mandate_source: "designated", elected_at: null,
  }));
  await asTenant("tenant-a", (client) => addMember(client, {
    id: "m-vice", representation: "employee", role: "vice_president",
  }));
  checks++;
  console.log("✓ presidente (designado) e vice (eleito) gravados");

  // 6. Presidente precisa ser do empregador (5.4.5).
  await assert.rejects(
    asTenant("tenant-a", (client) => addMember(client, { id: "m-bad-pres", representation: "employee", role: "president" })),
    { code: "23514" },
  );
  checks++;
  console.log("✓ presidente com representação de empregado recusado");

  // 7. Vice precisa ser dos empregados.
  await assert.rejects(
    asTenant("tenant-a", (client) => addMember(client, { id: "m-bad-vice", representation: "employer", role: "vice_president" })),
    { code: "23514" },
  );
  checks++;
  console.log("✓ vice com representação do empregador recusado");

  // 8. Dois presidentes ativos recusados.
  await assert.rejects(
    asTenant("tenant-a", (client) => addMember(client, {
      id: "m-pres2", representation: "employer", role: "president", mandate_source: "designated", elected_at: null,
    })),
    { code: "23505" },
  );
  checks++;
  console.log("✓ segundo presidente ativo recusado");

  // 9. Eleito exige data de eleição.
  await assert.rejects(
    asTenant("tenant-a", (client) => addMember(client, { id: "m-no-date", elected_at: null })),
    { code: "23514" },
  );
  checks++;
  console.log("✓ membro eleito sem data de eleição recusado");

  // 10. Suplente com ordem de sucessão, na ordem decrescente de votos (5.5.8).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_members (tenant_id,id,term_id,worker_id,representation,role,seat,mandate_source,elected_at,possession_on,succession_order,votes_received,stability_until)
     VALUES ('tenant-a','m-sup-1','term-1','w-sup-1','employee','member','suplente','elected','2026-01-15','2026-02-01',1,9,'2028-02-01'),
            ('tenant-a','m-sup-2','term-1','w-sup-2','employee','member','suplente','elected','2026-01-15','2026-02-01',2,7,'2028-02-01')`,
  ));
  const suplentes = await asTenant("tenant-a", (client) => client.query(
    "SELECT succession_order, votes_received FROM sst.cipa_members WHERE seat='suplente' ORDER BY succession_order",
  ));
  assert.deepEqual(suplentes.rows.map((r) => [r.succession_order, r.votes_received]), [[1, 9], [2, 7]]);
  checks++;
  console.log("✓ suplentes ordenados por votos (5.5.8)");

  // 11. 5.4.10: membro de CIPA vigente não pode ser apagado.
  // O app não recebe DELETE (revogado por GRANT): recusa antes do trigger. A role administradora
  // é barrada pelo trigger, que preserva o histórico.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("DELETE FROM sst.cipa_members WHERE id='m-sup-2'")),
    { code: "42501" },
  );
  await assert.rejects(
    pool.query("DELETE FROM sst.cipa_members WHERE id='m-sup-2'"),
    { code: "55000" },
  );
  checks++;
  console.log("✓ exclusão de membro de CIPA vigente recusada (5.4.10)");

  // 12. Substituição preserva o registro anterior.
  await asTenant("tenant-a", (client) => client.query(
    `UPDATE sst.cipa_members SET status='replaced', ended_on='2026-06-30', replaced_by_member_id='m-sup-1' WHERE id='m-sup-2'`,
  ));
  const replaced = await asTenant("tenant-a", (client) => client.query("SELECT status, replaced_by_member_id FROM sst.cipa_members WHERE id='m-sup-2'"));
  assert.equal(replaced.rows[0].status, "replaced");
  assert.equal(replaced.rows[0].replaced_by_member_id, "m-sup-1");
  checks++;
  console.log("✓ substituição registrada sem apagar o membro anterior");

  // 13. Representante nomeado da NR-05 com validade anual (5.4.14).
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_named_representatives (tenant_id,id,company_id,unit_id,standard_id,worker_id,basis,appointed_on,valid_until,training_completed_on,training_valid_until,status)
     VALUES ('tenant-a','rep-1','comp-1','unit-1','nr5-2022','w-rep','contractor_no_own_cipa','2026-03-01','2027-03-01','2026-03-10','2028-03-10','active')`,
  ));
  checks++;
  console.log("✓ representante nomeado com validade anual e treinamento");

  // 14. Segundo representante ativo do mesmo motivo recusado.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_named_representatives (tenant_id,id,company_id,unit_id,standard_id,worker_id,basis,appointed_on,valid_until,status)
       VALUES ('tenant-a','rep-2','comp-1','unit-1','nr5-2022','w-rep2','contractor_no_own_cipa','2026-04-01','2027-04-01','active')`,
    )),
    { code: "23505" },
  );
  checks++;
  console.log("✓ segundo representante ativo do mesmo motivo recusado");

  // 15. Treinamento sem data de conclusão recusado.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query(
      `INSERT INTO sst.cipa_named_representatives (tenant_id,id,company_id,unit_id,standard_id,worker_id,basis,appointed_on,valid_until,training_valid_until,status)
       VALUES ('tenant-a','rep-bad','comp-1','unit-1','nr5-2022','w-rep3','construction_site','2026-04-01','2027-04-01','2028-04-01','active')`,
    )),
    { code: "23514" },
  );
  checks++;
  console.log("✓ treinamento sem data de conclusão recusado");

  // 16. Evento de auditoria e histórico imutável.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.cipa_events (tenant_id,id,term_id,target_kind,target_id,action,actor_user_id,reason,occurred_at)
     VALUES ('tenant-a','ev-1','term-1','term','term-1','term.activated','elias','Mandato ativado após conferência',now())`,
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_events SET reason='alterado'")),
    { code: "42501" },
  );
  await assert.rejects(pool.query("DELETE FROM sst.cipa_events"), { code: "55000" });
  checks++;
  console.log("✓ auditoria gravada e histórico imutável");

  // 17. Isolamento por tenant.
  const visibleToB = await asTenant("tenant-b", (client) => client.query("SELECT * FROM sst.cipa_terms"));
  assert.equal(visibleToB.rowCount, 0);
  await assert.rejects(
    asTenant("tenant-b", (client) => addMember(client, { tenant_id: "tenant-a" })),
    { code: "42501" },
  );
  checks++;
  console.log("✓ isolamento por tenant na CIPA confirmado");

  // 18. Mandato encerrado não reabre.
  await asTenant("tenant-a", (client) => client.query(
    "UPDATE sst.cipa_terms SET status='ended', ended_on='2027-01-31', end_reason='Término do mandato' WHERE id='term-1'",
  ));
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.cipa_terms SET status='active' WHERE id='term-1'")),
    { code: "55000" },
  );
  checks++;
  console.log("✓ mandato encerrado não pode ser reaberto");

  console.log(`\nPROVA CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
} finally {
  if (pool) await pool.end().catch(() => {});
  try { docker(["rm", "-f", name]); } catch {}
}
