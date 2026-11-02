import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildWorkerImportPlan } from "./worker-import-plan.mjs";

const name = `sst-worker-quota-${randomUUID().replaceAll("-", "")}`;
const password = randomBytes(24).toString("hex");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const tenantA = `worker-test-${suffix}-a`;
const tenantB = `worker-test-${suffix}-b`;
const ownerA = `worker-owner-${suffix}-a`;
let pool;
let started = false;
let stage = "start";

const docker = args => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
}).trim();

async function apply(path) {
  await pool.query(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function asWorkerApp(userId, tenantId, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tenant_worker_candidate_app");
    await client.query(
      "SELECT set_config('sst.user_id',$1,true),set_config('sst.tenant_id',$2,true)",
      [userId, tenantId],
    );
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createWorker(userId, tenantId, {
  id = randomUUID(),
  companyId,
  unitId,
  name = "Trabalhador fictício",
  categories = ["Outro"],
} = {}) {
  return asWorkerApp(userId, tenantId, client => client.query(
    `SELECT tenant_worker_candidate.create_worker(
      $1,$2,$3,$4,$5,$6,$7,$8,$9
    )`,
    [id, companyId, unitId, name, "Não informado", "Função fictícia", "",
      categories, randomUUID()],
  ));
}

async function updateWorker(userId, tenantId, workerId, {
  name = "Trabalhador fictício",
  sex = "Não informado",
  jobTitle = "Função fictícia",
  area = "",
  categories = ["Outro"],
  nr35Status = "not_informed",
  heightStatus = "not_informed",
  scaffoldingStatus = "not_informed",
} = {}) {
  return asWorkerApp(userId, tenantId, async client => (await client.query(
    `SELECT tenant_worker_candidate.update_worker_details(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
    ) AS changed`,
    [workerId, name, sex, jobTitle, area, categories, nr35Status,
      heightStatus, scaffoldingStatus, randomUUID()],
  )).rows[0].changed);
}

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sortedRows(rows) {
  return rows.map(row => Object.fromEntries(Object.entries(row)
    .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function insertWorkerPlanRows(client, plan) {
  for (const worker of plan.workers) {
    await client.query(
      `INSERT INTO tenant_worker_candidate.workers
       (tenant_id,id,company_id,unit_id,display_name,sex,job_title,area,risk_categories,
        nr35_training_status,height_work_supervision_training_status,scaffolding_assembly_training_status,
        status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [worker.tenant_id, worker.id, worker.company_id, worker.unit_id, worker.display_name, worker.sex,
        worker.job_title, worker.area, worker.risk_categories, worker.nr35_training_status,
        worker.height_work_supervision_training_status, worker.scaffolding_assembly_training_status,
        worker.status, worker.created_at, worker.updated_at],
    );
  }
  for (const event of plan.history) {
    await client.query(
      `INSERT INTO tenant_worker_candidate.worker_history
       (tenant_id,id,worker_id,action,actor_user_id,actor_role,occurred_at,from_status,to_status,changed_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [event.tenant_id, event.id, event.worker_id, event.action, event.actor_user_id,
        event.actor_role, event.occurred_at, event.from_status, event.to_status, event.changed_fields],
    );
  }
}

async function readWorkerPlanTarget(client, tenantId) {
  const [workers, history] = await Promise.all([
    client.query(
      `SELECT tenant_id,id,company_id,unit_id,display_name,sex,job_title,area,risk_categories,
       nr35_training_status,height_work_supervision_training_status,scaffolding_assembly_training_status,
       status,created_at,updated_at
       FROM tenant_worker_candidate.workers WHERE tenant_id=$1 ORDER BY id`,
      [tenantId],
    ),
    client.query(
      `SELECT tenant_id,id,worker_id,action,actor_user_id,actor_role,occurred_at,
       from_status,to_status,changed_fields
       FROM tenant_worker_candidate.worker_history WHERE tenant_id=$1 ORDER BY id`,
      [tenantId],
    ),
  ]);
  return { workers: sortedRows(workers.rows), history: sortedRows(history.rows) };
}

async function reconcileWorkerPlan(client, tenantId, plan) {
  const current = await readWorkerPlanTarget(client, tenantId);
  if (stable(current) === stable({
    workers: sortedRows(plan.workers),
    history: sortedRows(plan.history),
  })) return false;
  if (current.workers.length || current.history.length) {
    throw new Error("destino parcial ou divergente; plano não aplicado");
  }
  await insertWorkerPlanRows(client, plan);
  const after = await readWorkerPlanTarget(client, tenantId);
  assert.equal(stable(after), stable({
    workers: sortedRows(plan.workers),
    history: sortedRows(plan.history),
  }), "conferência posterior divergiu do plano sintético");
  return true;
}

try {
  docker([
    "run", "--rm", "-d", "--name", name,
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", "POSTGRES_DB=sst_hoje_dev",
    "-p", "127.0.0.1::5432", "postgres:17-alpine",
  ]);
  started = true;
  const port = Number(docker(["port", name, "5432/tcp"]).split(/\r?\n/)[0].split(":").at(-1));
  pool = new pg.Pool({
    host: "127.0.0.1", port, user: "postgres", password, database: "sst_hoje_dev",
    max: 6, connectionTimeoutMillis: 1000,
  });
  for (let attempt = 0; ; attempt += 1) {
    try { await pool.query("SELECT 1"); break; }
    catch {
      if (attempt === 39) throw new Error("PostgreSQL descartável não ficou pronto.");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  stage = "apply isolated schemas";
  await pool.query("CREATE SCHEMA sst");
  await apply("../db/migrations/0001_tenant_registry.sql");
  await apply("../db/migrations/0004_client_companies.sql");
  await apply("../db/migrations/0005_pgr_risk_inventory.sql");
  await apply("../../../schemas/tenant-authority-candidate.sql");
  await apply("../../../schemas/tenant-self-service-identity-candidate.sql");
  await apply("../../../schemas/tenant-worker-quota-candidate.sql");

  stage = "seed synthetic tenants and membership";
  await pool.query(
    `INSERT INTO sst.tenants(id,name,status)
     VALUES ($1,'Tenant sintético A','active'),($2,'Tenant sintético B','active')`,
    [tenantA, tenantB],
  );
  await pool.query(
    `INSERT INTO tenant_identity_candidate.tenant_profiles
      (tenant_id,operating_mode,platform_user_ceiling,platform_company_ceiling,
       platform_worker_ceiling,platform_storage_bytes_ceiling,user_limit,company_limit,
       worker_limit,storage_bytes_limit)
     VALUES ($1,'direct_client',5,5,2,1000000,5,5,2,1000000),
            ($2,'direct_client',5,5,2,1000000,5,5,2,1000000)`,
    [tenantA, tenantB],
  );
  await pool.query(
    `INSERT INTO tenant_authority_candidate.tenant_profiles(tenant_id,operating_mode)
     VALUES ($1,'direct_client'),($2,'direct_client')`,
    [tenantA, tenantB],
  );
  await pool.query(
    `INSERT INTO sst.tenant_memberships(tenant_id,user_id,role,status,display_name)
     VALUES ($1,$2,'cliente','active','Responsável fictício A')`,
    [tenantA, ownerA],
  );
  await pool.query(
    `INSERT INTO tenant_authority_candidate.admin_grants(tenant_id,user_id,role,granted_by)
     VALUES ($1,$2,'tenant_owner','synthetic-fixture'),
            ($1,$2,'tenant_admin','synthetic-fixture')`,
    [tenantA, ownerA],
  );

  stage = "seed tenant-scoped company and unit";
  const companyA = `company-${suffix}-a`;
  const unitA = `unit-${suffix}-a`;
  const companyB = `company-${suffix}-b`;
  const unitB = `unit-${suffix}-b`;
  await pool.query(
    `INSERT INTO sst.client_companies
      (tenant_id,id,legal_name,trade_name,contact_name,contact_email,contact_phone,status,created_at,updated_at)
     VALUES ($1,$2,'Empresa sintética A','','','','','active',clock_timestamp(),clock_timestamp()),
            ($3,$4,'Empresa sintética B','','','','','active',clock_timestamp(),clock_timestamp())`,
    [tenantA, companyA, tenantB, companyB],
  );
  await pool.query(
    `INSERT INTO sst.client_units(tenant_id,id,company_id,cnpj,name,city_state)
     VALUES ($1,$2,$3,'00000000000001','Unidade sintética A','Cidade/UF'),
            ($4,$5,$6,'00000000000002','Unidade sintética B','Cidade/UF')`,
    [tenantA, unitA, companyA, tenantB, unitB, companyB],
  );

  stage = "reconcile synthetic worker import plan";
  const workerCreatedAt = "2026-01-01T03:00:00.000Z";
  const workerArchivedAt = "2026-01-03T03:00:00.000Z";
  const importWorkerA = {
    id: `import-worker-${suffix}-a`, tenantId: tenantB, companyId: companyB, unitId: unitB,
    displayName: "Trabalhador fictício importado A", sex: "Não informado",
    jobTitle: "Função fictícia", area: "", riskCategories: ["Outro"],
    status: "archived", createdAt: workerCreatedAt, updatedAt: workerArchivedAt,
    history: [
      { id: `import-history-${suffix}-a1`, action: "created", actorUserId: "synthetic-importer",
        actorRole: "consultoria_admin", occurredAt: workerCreatedAt },
      { id: `import-history-${suffix}-a2`, action: "details_changed", actorUserId: "synthetic-importer",
        actorRole: "consultoria_admin", occurredAt: "2026-01-02T03:00:00.000Z", changedFields: ["jobTitle"] },
      { id: `import-history-${suffix}-a3`, action: "status_changed", actorUserId: "synthetic-importer",
        actorRole: "consultoria_admin", occurredAt: workerArchivedAt, fromStatus: "active", toStatus: "archived" },
    ],
  };
  const importWorkerB = {
    id: `import-worker-${suffix}-b`, tenantId: tenantB, companyId: companyB, unitId: unitB,
    displayName: "Trabalhador fictício importado B", sex: "Não informado",
    jobTitle: "Função fictícia", area: null, riskCategories: ["Outro"],
    status: "active", createdAt: workerCreatedAt, updatedAt: workerCreatedAt,
    history: [
      { id: `import-history-${suffix}-b1`, action: "created", actorUserId: "synthetic-importer",
        actorRole: "consultoria_admin", occurredAt: workerCreatedAt },
    ],
  };
  const importPlan = buildWorkerImportPlan([importWorkerA, importWorkerB], tenantB, [{
    id: companyB, tenantId: tenantB, units: [{ id: unitB }],
  }]);

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const partialPlan = {
      workers: importPlan.workers.slice(0, 1),
      history: importPlan.history.filter(event => event.worker_id === importWorkerA.id),
    };
    await insertWorkerPlanRows(importClient, partialPlan);
    await assert.rejects(reconcileWorkerPlan(importClient, tenantB, importPlan), /destino parcial ou divergente/);
  } finally {
    await importClient.query("ROLLBACK");
    importClient.release();
  }
  assert.equal(await reconcileWorkerPlan(pool, tenantB, importPlan), true);
  assert.equal(await reconcileWorkerPlan(pool, tenantB, importPlan), false, "plano idêntico deve ser idempotente");

  const conflictClient = await pool.connect();
  try {
    await conflictClient.query("BEGIN");
    await conflictClient.query(
      `UPDATE tenant_worker_candidate.workers SET display_name='Conflito fictício'
       WHERE tenant_id=$1 AND id=$2`,
      [tenantB, importWorkerA.id],
    );
    await assert.rejects(reconcileWorkerPlan(conflictClient, tenantB, importPlan), /destino parcial ou divergente/);
  } finally {
    await conflictClient.query("ROLLBACK");
    conflictClient.release();
  }
  assert.deepEqual(await readWorkerPlanTarget(pool, tenantB), {
    workers: sortedRows(importPlan.workers),
    history: sortedRows(importPlan.history),
  });

  stage = "create worker and apply active quota";
  const workerA = randomUUID();
  await createWorker(ownerA, tenantA, { id: workerA, companyId: companyA, unitId: unitA });
  await assert.rejects(createWorker(ownerA, tenantA, {
    companyId: companyA, unitId: unitA, categories: ["Categoria inventada"],
  }), /Dados do trabalhador inválidos/);
  await assert.rejects(createWorker(ownerA, tenantA, {
    companyId: companyB, unitId: unitB,
  }), /foreign key constraint/i);
  await assert.rejects(updateWorker(ownerA, tenantA, workerA, {
    categories: ["Categoria inventada"],
  }), /Dados do trabalhador inválidos/);
  assert.equal(await updateWorker(ownerA, tenantA, workerA, {
    name: "Trabalhador fictício atualizado",
    area: "Área fictícia",
    nr35Status: "reported_pending_validation",
  }), true);
  assert.equal(await updateWorker(ownerA, tenantA, workerA, {
    name: "Trabalhador fictício atualizado",
    area: "Área fictícia",
    nr35Status: "reported_pending_validation",
  }), false, "edição sem mudança não deve gerar evento de histórico");

  stage = "deny cross-tenant actor";
  await assert.rejects(createWorker(ownerA, tenantB, {
    companyId: companyB, unitId: unitB,
  }), /Membership ativa não encontrada neste tenant/);

  stage = "serialize concurrent worker quota";
  const concurrentCreates = await Promise.allSettled([1, 2].map(() => createWorker(ownerA, tenantA, {
    companyId: companyA, unitId: unitA,
  })));
  assert.equal(concurrentCreates.filter(result => result.status === "fulfilled").length, 1);
  const quotaDenials = concurrentCreates.filter(result => result.status === "rejected");
  assert.equal(quotaDenials.length, 1);
  assert.match(String(quotaDenials[0].reason), /Limite de trabalhadores ativos atingido/);

  stage = "archive and reactivate worker";
  await asWorkerApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_candidate.set_worker_status($1,$2,$3)",
    [workerA, "archived", randomUUID()],
  ));
  await createWorker(ownerA, tenantA, { companyId: companyA, unitId: unitA });
  await assert.rejects(asWorkerApp(ownerA, tenantA, client => client.query(
    "SELECT tenant_worker_candidate.set_worker_status($1,$2,$3)",
    [workerA, "active", randomUUID()],
  )), /Limite de trabalhadores ativos atingido/);

  stage = "check audit history, tenant isolation, and grants";
  const totals = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM tenant_worker_candidate.workers WHERE tenant_id=$1) AS total,
       (SELECT count(*)::int FROM tenant_worker_candidate.workers WHERE tenant_id=$1 AND status='active') AS active,
       (SELECT count(*)::int FROM tenant_worker_candidate.workers WHERE tenant_id=$1 AND status='archived') AS archived,
       (SELECT count(*)::int FROM tenant_worker_candidate.worker_history WHERE tenant_id=$1) AS history,
       (SELECT changed_fields FROM tenant_worker_candidate.worker_history
         WHERE tenant_id=$1 AND worker_id=$3 AND action='details_changed') AS changed_fields,
       (SELECT count(*)::int FROM tenant_worker_candidate.workers WHERE tenant_id=$2) AS other_tenant`,
    [tenantA, tenantB, workerA],
  );
  assert.deepEqual(totals.rows[0], {
    total: 3, active: 2, archived: 1, history: 5,
    changed_fields: ["displayName", "area", "nr35TrainingStatus"], other_tenant: 2,
  });
  await assert.rejects(pool.query(
    "UPDATE tenant_worker_candidate.worker_history SET action='details_changed' WHERE tenant_id=$1",
    [tenantA],
  ), /worker history is append-only/);
  await assert.rejects(pool.query(
    `INSERT INTO tenant_worker_candidate.worker_history
      (tenant_id,id,worker_id,action,actor_user_id,actor_role,changed_fields)
     VALUES ($1,'invalid-history-field',$2,'details_changed',$3,'cliente',ARRAY['passwordHash'])`,
    [tenantA, workerA, ownerA],
  ), /worker_history_check/);
  await assert.rejects(asWorkerApp(ownerA, tenantA, client => client.query(
    "INSERT INTO tenant_worker_candidate.workers(tenant_id,id,company_id,unit_id,display_name,job_title,risk_categories) VALUES ($1,'direct-write',$2,$3,'Direto','Teste',ARRAY['Outro'])",
    [tenantA, companyA, unitA],
  )), { code: "42501" });

  console.log("Prova PostgreSQL descartável aprovada: reconciliação sintética completa/idempotente, rejeição de destino parcial/divergente, cadastro/edição/status transacionais, cota concorrente, isolamento, histórico imutável e gravação autorizada.");
} catch (error) {
  const diagnostic = String(error.stderr ?? error.message ?? "")
    .replaceAll(password, "[redigido]")
    .replaceAll(name, "[container descartável]");
  console.error(`Prova não concluída na etapa "${stage}" (${error.code ?? error.name}${error.schema ? `, schema ${error.schema}` : ""}${error.routine ? `, ${error.routine}` : ""}): ${diagnostic.trim()}${error.where ? `\n${error.where}` : ""}${error.internalQuery ? `\n${error.internalQuery}` : ""}${error.internalPosition ? `:${error.internalPosition}` : ""}. Nenhum banco persistente foi utilizado.`);
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (started) docker(["rm", "-f", name]);
}
