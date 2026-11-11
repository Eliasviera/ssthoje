import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

// Prova isolada da migration 0014 (PAE e Brigada de Incêndio como categorias documentais).
// Container descartável; nunca lê os .env do projeto e nunca toca banco persistente.
const name = `sst-pae-proof-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
const docker = (args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
let pool;
let checks = 0;

const BASE_KINDS = ["PGR", "PCMSO", "LTCAT", "Ficha de EPI", "Treinamento", "O.S.", "Outro"];
const sql = (file) => readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), "utf8");

// Cria empresa, unidade e conjunto de requisitos pai (FKs obrigatórias da tabela de itens).
const ensureScope = async (client, tenant) => {
  await client.query(
    `INSERT INTO sst.client_companies
       (tenant_id, id, legal_name, trade_name, contact_name, contact_email, contact_phone, status, created_at, updated_at)
     VALUES ($1, 'comp-1', 'Empresa Sintética Ltda', 'Sintética', 'Contato', 'contato@exemplo.invalid', '0000', 'active', now(), now())
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [tenant],
  );
  await client.query(
    `INSERT INTO sst.client_units (tenant_id, id, company_id, cnpj, name, city_state)
     VALUES ($1, 'unit-1', 'comp-1', '00000000000000', 'Unidade Sintética', 'Cidade/UF')
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [tenant],
  );
  await client.query(
    `INSERT INTO sst.third_party_requirement_sets
       (tenant_id, id, company_id, unit_id, revision, status, created_by, created_at)
     VALUES ($1, 'set-1', 'comp-1', 'unit-1', 1, 'active', 'actor-test', now())
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [tenant],
  );
};

const insertItem = async (client, tenant, kind) => {
  await ensureScope(client, tenant);
  return client.query(
    `INSERT INTO sst.third_party_requirement_items (tenant_id, requirement_set_id, document_kind)
     VALUES ($1, 'set-1', $2)`,
    [tenant, kind],
  );
};

const insertRule = (client, tenant, id, kind) => client.query(
  `INSERT INTO sst.third_party_compliance_rules
     (tenant_id, id, title, document_kind, criteria, source_title, source_version,
      jurisdiction, valid_from, reviewer, version, status, created_by, created_at)
   VALUES ($1, $2, $3, $4, 'Critério sintético', 'Fonte sintética', 'v1',
           'Brasil', '2026-01-01', 'Revisor sintético', 1, 'active', 'actor-test', now())`,
  [tenant, id, `Regra ${id}`, kind],
);

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

  await pool.query(`CREATE SCHEMA sst;
    CREATE ROLE sst_hoje_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA sst TO sst_hoje_app`);
  // A 0001 concede CONNECT no banco de desenvolvimento; o container de prova usa 'postgres'.
  await pool.query("CREATE DATABASE sst_hoje_dev");
  for (const file of ["0001_tenant_registry.sql", "0004_client_companies.sql", "0009_third_party_integration_gate.sql", "0010_third_party_os_document_kind.sql"]) {
    await pool.query(sql(file));
  }
  await pool.query(`INSERT INTO sst.tenants(id, name) VALUES ('tenant-a','Sintético A'),('tenant-b','Sintético B') ON CONFLICT (id) DO NOTHING`);
  checks++;
  console.log("✓ migrations 0001/0004/0009/0010 aplicadas no container descartável");

  // Antes da 0014: PAE e Brigada são recusados pelo CHECK da 0010.
  await assert.rejects(insertItem(pool, "tenant-a", "PAE"), { code: "23514" });
  await assert.rejects(insertItem(pool, "tenant-a", "Brigada de Incêndio"), { code: "23514" });
  checks++;
  console.log("✓ antes da 0014: 'PAE' e 'Brigada de Incêndio' recusados (CHECK 0010 intacto)");

  // Categoria inexistente continua recusada.
  await assert.rejects(insertItem(pool, "tenant-a", "Categoria Inventada"), { code: "23514" });
  checks++;

  // Categoria antiga continua aceita.
  await insertItem(pool, "tenant-a", "PGR");
  await insertItem(pool, "tenant-a", "O.S.");
  checks++;

  // Aplica a 0014.
  await pool.query(sql("0014_emergency_and_fire_brigade_document_kinds.sql"));
  checks++;
  console.log("✓ migration 0014 aplicada");

  // Agora as duas categorias novas são aceitas.
  await insertItem(pool, "tenant-a", "PAE");
  await insertItem(pool, "tenant-a", "Brigada de Incêndio");
  checks++;

  await insertRule(pool, "tenant-a", "rule-pae", "PAE");
  await insertRule(pool, "tenant-a", "rule-brig", "Brigada de Incêndio");
  checks++;
  console.log("✓ 0014 aceita 'PAE' e 'Brigada de Incêndio' em requirement_items e compliance_rules");

  // Categorias antigas não foram perdidas.
  const rules = await pool.query("SELECT document_kind FROM sst.third_party_compliance_rules ORDER BY document_kind");
  for (const kind of ["PAE", "Brigada de Incêndio"]) {
    assert.ok(rules.rows.some((row) => row.document_kind === kind), `categoria ${kind} ausente`);
  }
  checks++;

  // Categoria inválida continua recusada depois da 0014.
  await assert.rejects(insertItem(pool, "tenant-a", "Categoria Inventada"), { code: "23514" });
  checks++;
  console.log("✓ categoria inexistente continua recusada depois da 0014");

  // Isolamento por tenant preservado.
  await insertItem(pool, "tenant-b", "PAE");
  const counts = await pool.query(
    "SELECT tenant_id, count(*)::int AS total FROM sst.third_party_requirement_items GROUP BY tenant_id ORDER BY tenant_id",
  );
  assert.deepEqual(counts.rows.map((row) => [row.tenant_id, row.total]), [["tenant-a", 4], ["tenant-b", 1]]);
  checks++;
  console.log("✓ isolamento por tenant preservado (tenant-a: 4 itens, tenant-b: 1)");

  // Idempotência: reaplicar a 0014 não quebra.
  await pool.query(sql("0014_emergency_and_fire_brigade_document_kinds.sql"));
  checks++;
  console.log("✓ migration 0014 é reaplicável (DROP IF EXISTS + ADD)");

  // Lista final de categorias efetivamente aceitas pelo banco.
  const constraints = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conname LIKE '%document_kind_check' ORDER BY conname`,
  );
  assert.equal(constraints.rowCount, 3);
  for (const row of constraints.rows) {
    for (const kind of [...BASE_KINDS, "PAE", "Brigada de Incêndio"]) {
      assert.ok(row.def.includes(`'${kind}'`), `${row.conname} não contém ${kind}`);
    }
  }
  checks++;
  console.log("✓ 3 constraints com as 9 categorias esperadas");

  console.log(`\nPROVA CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
} finally {
  if (pool) await pool.end().catch(() => {});
  try { docker(["rm", "-f", name]); } catch {}
}
