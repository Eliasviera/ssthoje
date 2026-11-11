import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

// Prova isolada da migration 0015 (catálogo de ITs estaduais de brigada).
// Container descartável; nunca lê os .env do projeto e nunca toca banco persistente.
const name = `sst-brigade-proof-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
let pool;
let checks = 0;
const sql = (file) => readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), "utf8");
const hash = (text) => createHash("sha256").update(text).digest("hex");

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

const IT = { id: "it-17-sp-2024", uf: "SP", number: "IT-17", version: "2024" };

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
  await pool.query(sql("0015_brigade_standard_catalog.sql"));
  checks++;
  console.log("✓ migration 0015 aplicada em container descartável");

  // 1. Catálogo entra como rascunho, sem revisor.
  await pool.query(
    `INSERT INTO sst.brigade_standards (id, jurisdiction, it_number, it_version, title, valid_from, source_url, source_hash, status)
     VALUES ($1, $2, $3, $4, 'Brigada de incêndio — IT sintética', '2024-01-01', 'https://exemplo.invalid/it.pdf', $5, 'draft')`,
    [IT.id, IT.uf, IT.number, IT.version, hash("arquivo-sintetico")],
  );
  checks++;
  console.log("✓ rascunho do catálogo inserido sem revisor");

  // 2. Rascunho NÃO pode ir a 'active' sem revisor e publicação (CHECK).
  await assert.rejects(
    pool.query("UPDATE sst.brigade_standards SET status='active' WHERE id=$1", [IT.id]),
    { code: "23514" },
  );
  checks++;
  console.log("✓ publicação sem conferência humana recusada (status active exige reviewer)");

  // 3. Faixa de composição e formação no vocabulário da IT.
  const formation = JSON.stringify([
    { level: "Básico", count: 8 },
    { level: "Intermediário", count: 3 },
    { level: "Avançado", count: 1 },
  ]);
  await pool.query(
    `INSERT INTO sst.brigade_occupancy_bands
       (id, standard_id, occupancy_code, occupancy_label, risk_level, population_from, population_to, brigadists_min, formation)
     VALUES ('band-j1-leve-0-10', $1, 'J-1', 'Escritório', 'Leve', 0, 10, 2, $2::jsonb)`,
    [IT.id, formation],
  );
  const band = await pool.query("SELECT * FROM sst.brigade_occupancy_bands WHERE id='band-j1-leve-0-10'");
  assert.equal(band.rows[0].brigadists_min, 2);
  assert.equal(band.rows[0].formation.length, 3);
  checks++;
  console.log("✓ faixa com composição (2) e formação por nível gravada");

  // 4. formação precisa ser array (proteção contra estrutura solta).
  await assert.rejects(
    pool.query(
      `INSERT INTO sst.brigade_occupancy_bands
         (id, standard_id, occupancy_code, occupancy_label, risk_level, population_from, brigadists_min, formation)
       VALUES ('band-bad', $1, 'J-2', 'Loja', 'Leve', 0, 1, '{"level":"Básico"}'::jsonb)`,
      [IT.id],
    ),
    { code: "23514" },
  );
  checks++;
  console.log("✓ formação em formato inválido recusada");

  // 5. Só uma versão vigente por IT/estado.
  await pool.query(
    `INSERT INTO sst.brigade_standards (id, jurisdiction, it_number, it_version, title, valid_from, source_hash, status)
     VALUES ('it-17-sp-2026','SP','IT-17','2026','IT sintética nova','2026-01-01',$1,'draft')`,
    [hash("arquivo-2026")],
  );
  await pool.query(
    `UPDATE sst.brigade_standards SET status='active', reviewer='Revisor sintético', reviewed_at=now(), published_by='Publisher', published_at=now() WHERE id=$1`,
    [IT.id],
  );
  await pool.query(
    `UPDATE sst.brigade_standards SET status='active', reviewer='Revisor sintético', reviewed_at=now(), published_by='Publisher', published_at=now() WHERE id='it-17-sp-2026'`,
  ).then(() => { throw new Error("duas versões vigentes foram aceitas"); }, (error) => assert.equal(error.code, "23505"));
  checks++;
  console.log("✓ duas versões vigentes da mesma IT recusadas (índice único parcial)");

  // 6. Estados diferentes coexistem (UF é a chave de jurisdição).
  await pool.query(
    `INSERT INTO sst.brigade_standards (id, jurisdiction, it_number, it_version, title, valid_from, source_hash, status)
     VALUES ('it-17-mg-2024','MG','IT-17','2024','IT sintética MG','2024-01-01',$1,'draft')`,
    [hash("arquivo-mg")],
  );
  checks++;
  console.log("✓ mesmo número de IT em outra UF aceito (jurisdição separada)");

  // 7. Conferência humana registrada por tenant, com RLS.
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.brigade_standard_reviews (tenant_id, id, standard_id, reviewer, decision, source_hash, method, notes, reviewed_at)
     VALUES ('tenant-a','review-1',$1,'Elias (PLH)','approved',$2,'manual_transcription','Conferido linha a linha',now())`,
    [IT.id, hash("arquivo-sintetico")],
  ));
  await asTenant("tenant-a", (client) => client.query(
    `INSERT INTO sst.brigade_occupancy_band_entries (tenant_id, review_id, band_id, snapshot)
     VALUES ('tenant-a','review-1','band-j1-leve-0-10',$1::jsonb)`,
    [JSON.stringify({ brigadists_min: 2, formation: JSON.parse(formation) })],
  ));
  checks++;
  console.log("✓ conferência e retrato das faixas gravados com tenant");

  // 8. tenant-b não vê a conferência de tenant-a.
  const visibleToB = await asTenant("tenant-b", (client) => client.query("SELECT * FROM sst.brigade_standard_reviews"));
  assert.equal(visibleToB.rowCount, 0);
  checks++;
  console.log("✓ isolamento por tenant na conferência (tenant-b vê 0)");

  // 9. tenant-b não pode gravar conferência em nome de tenant-a.
  await assert.rejects(
    asTenant("tenant-b", (client) => client.query(
      `INSERT INTO sst.brigade_standard_reviews (tenant_id, id, standard_id, reviewer, decision, source_hash, method, reviewed_at)
       VALUES ('tenant-a','review-x',$1,'Intruso','approved',$2,'manual_transcription',now())`,
      [IT.id, hash("x")],
    )),
    { code: "42501" },
  );
  checks++;
  console.log("✓ gravação cross-tenant recusada pela RLS");

  // 10. Histórico de conferência é imutável.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("UPDATE sst.brigade_standard_reviews SET notes='alterado'")),
    { code: "42501" },
  );
  await assert.rejects(
    pool.query("DELETE FROM sst.brigade_standard_reviews"),
    { code: "55000" },
  );
  checks++;
  console.log("✓ conferência não pode ser alterada nem apagada (append-only)");

  // 11. Catálogo não pode ser apagado.
  await assert.rejects(
    pool.query("DELETE FROM sst.brigade_standards WHERE id='it-17-mg-2024'"),
    { code: "55000" },
  );
  checks++;
  console.log("✓ catálogo não pode ser apagado (só superseded)");

  // 12. Role do app não apaga o catálogo nem edita a tabela de faixas diretamente.
  await assert.rejects(
    asTenant("tenant-a", (client) => client.query("DELETE FROM sst.brigade_occupancy_bands")),
    { code: "42501" },
  );
  checks++;
  console.log("✓ role do app não apaga faixas do catálogo");

  // 13. Fonte sem hash SHA-256 válido é recusada.
  await assert.rejects(
    pool.query(
      `INSERT INTO sst.brigade_standards (id, jurisdiction, it_number, it_version, title, valid_from, source_hash, status)
       VALUES ('it-sem-hash','SP','IT-99','2024','Sem hash','2024-01-01','abc','draft')`,
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
