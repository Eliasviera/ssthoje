import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { importPgrLegacyBatchInTransaction } from "../src/lib/pgr-postgres-import.ts";
import { createPgrInventoryInTransaction, transitionPgrInventoryInTransaction } from "../src/lib/pgr-postgres-operations.ts";
import { importPcmsoTenantBatchInTransaction, reviewPcmsoPgrRiskLinksInTransaction, savePcmsoPgrRiskLinksInTransaction } from "../src/lib/pcmso-postgres-operations.ts";

const { Pool } = pg;
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const containerName = `sst-pgr-rls-${suffix}`;
const databasePassword = randomBytes(32).toString("base64url");
const tenantA = `pgr-test-${suffix}-a`;
const tenantB = `pgr-test-${suffix}-b`;
const companyA = `company-${suffix}-a`;
const companyB = `company-${suffix}-b`;
const unitA = `unit-${suffix}-a`;
const unitB = `unit-${suffix}-b`;
const draftId = `draft-${suffix}`;
let admin;
let runtime;
let containerStarted = false;
let stage = "start";

function docker(args) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
}

function sourceDraft() {
  const createdAt = "2026-10-01T09:00:00.000Z";
  const updatedAt = "2026-10-02T10:00:00.000Z";
  const revision = {
    version: 1,
    companyId: companyA,
    unitId: unitA,
    title: "Inventário PGR temporário",
    activityDescription: "Atividade de teste isolado.",
    riskInventory: "Relato legado de teste.",
    actionPlan: "Plano de teste.",
    savedAt: updatedAt,
    actorUserId: "actor-pgr-test",
    actorRole: "consultoria_admin",
  };
  return {
    id: draftId,
    tenantId: tenantA,
    companyId: companyA,
    unitId: unitA,
    title: revision.title,
    activityDescription: revision.activityDescription,
    riskInventory: revision.riskInventory,
    actionPlan: revision.actionPlan,
    status: "approved",
    authorUserId: revision.actorUserId,
    reviewerUserId: "reviewer-pgr-test",
    reviewerRole: "consultoria_admin",
    revision: 1,
    revisions: [revision],
    createdAt,
    updatedAt,
    history: [
      { id: `history-${suffix}`, action: "draft", occurredAt: createdAt, actorUserId: revision.actorUserId, actorRole: revision.actorRole },
      { id: `approval-${suffix}`, action: "approved", occurredAt: updatedAt, actorUserId: "reviewer-pgr-test", actorRole: "consultoria_admin" },
    ],
  };
}

async function waitForDatabase(config) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = new Pool({ ...config, max: 1, connectionTimeoutMillis: 750 });
    try {
      await probe.query("SELECT 1");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await probe.end();
    }
  }
  throw new Error("temporary postgres readiness timeout");
}

try {
  stage = "start-temporary-postgres";
  docker([
    "run", "--rm", "-d", "--name", containerName,
    "-e", "POSTGRES_USER=sst_pgr_test",
    "-e", "POSTGRES_PASSWORD=" + databasePassword,
    "-e", "POSTGRES_DB=sst_hoje_dev",
    "-p", "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);
  containerStarted = true;
  stage = "discover-temporary-port";
  const portLine = docker(["port", containerName, "5432/tcp"]).split(/\r?\n/)[0];
  const port = Number(portLine.slice(portLine.lastIndexOf(":") + 1));
  if (!Number.isInteger(port) || port < 1) throw new Error("temporary postgres port unavailable");

  const adminConfig = { host: "127.0.0.1", port, database: "sst_hoje_dev", user: "sst_pgr_test", password: databasePassword, max: 3, connectionTimeoutMillis: 2000 };
  stage = "wait-for-temporary-postgres";
  await waitForDatabase(adminConfig);
  admin = new Pool(adminConfig);
  await admin.query("CREATE SCHEMA sst");
  stage = "apply-migrations-to-temporary-postgres";
  const migrationDir = join(process.cwd(), "db", "migrations");
  const migrationFiles = (await readdir(migrationDir)).filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file)).sort();
  for (const file of migrationFiles) {
    stage = `apply-temporary-migration-${file}`;
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(join(migrationDir, file), "utf8"));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  stage = "create-isolated-tenant-fixtures";
  await admin.query("INSERT INTO sst.tenants (id, name) VALUES ($1, $2), ($3, $4)", [tenantA, "Tenant PGR A", tenantB, "Tenant PGR B"]);
  await admin.query(
    `INSERT INTO sst.client_companies (tenant_id, id, legal_name, trade_name, contact_name, contact_email, contact_phone, status, created_at, updated_at)
     VALUES ($1, $2, 'Empresa PGR A', '', '', '', '', 'active', now(), now()),
            ($3, $4, 'Empresa PGR B', '', '', '', '', 'active', now(), now())`,
    [tenantA, companyA, tenantB, companyB],
  );
  await admin.query(
    `INSERT INTO sst.client_units (tenant_id, id, company_id, cnpj, name, city_state)
     VALUES ($1, $2, $3, '11111111111111', 'Unidade A', 'Teste'),
            ($4, $5, $6, '22222222222222', 'Unidade B', 'Teste')`,
    [tenantA, unitA, companyA, tenantB, unitB, companyB],
  );
  await admin.query(
    `INSERT INTO sst.pgr_risk_inventories
     (tenant_id, id, source_draft_id, company_id, unit_id, title, activity_description, action_plan, status, revision, created_at, updated_at)
     VALUES ($1, 'foreign-inventory', 'foreign-source', $2, $3, 'Foreign fixture', 'fixture', 'fixture', 'draft', 1, now(), now())`,
    [tenantB, companyB, unitB],
  );

  runtime = new Pool(adminConfig);
  stage = "import-under-runtime-role";
  const draft = sourceDraft();
  const sourceEvent = {
    id: `audit-${suffix}`,
    tenantId: tenantA,
    actorUserId: "actor-pgr-test",
    actorRole: "consultoria_admin",
    action: "pgr.approved",
    occurredAt: draft.updatedAt,
  };
  const importer = await runtime.connect();
  try {
    await importer.query("BEGIN");
    await importer.query("SET LOCAL ROLE sst_hoje_app");
    await importer.query("SELECT set_config('sst.user_id', $1, true)", ["pgr-isolated-test"]);
    await importer.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantA]);
    assert.equal(await importPgrLegacyBatchInTransaction(importer, tenantA, [draft], [sourceEvent]), "imported");
    await importer.query("COMMIT");
  } catch (error) {
    await importer.query("ROLLBACK");
    throw error;
  } finally {
    importer.release();
  }

  stage = "verify-idempotent-retry-under-runtime-role";
  const retry = await runtime.connect();
  try {
    await retry.query("BEGIN");
    await retry.query("SET LOCAL ROLE sst_hoje_app");
    await retry.query("SELECT set_config('sst.user_id', $1, true)", ["pgr-isolated-test"]);
    await retry.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantA]);
    assert.equal(await importPgrLegacyBatchInTransaction(retry, tenantA, [draft], [sourceEvent]), "already_imported");
    await retry.query("COMMIT");
  } catch (error) {
    await retry.query("ROLLBACK");
    throw error;
  } finally {
    retry.release();
  }

  stage = "write-and-isolate-exposure-evaluation";
  const exposureClient = await runtime.connect();
  const exposureActor = { tenantId: tenantA, userId: "actor-pgr-test", role: "consultoria_admin" };
  const exposureInventory = {
    schemaVersion: 1,
    tenantId: tenantA,
    companyId: companyA,
    unitId: unitA,
    revision: 1,
    title: "Avaliação ambiental temporária",
    activityDescription: "Teste de persistência isolado.",
    actionPlan: "Nenhuma ação produtiva.",
    items: [{
      id: `risk-${suffix}`,
      process: "Processo demonstrativo",
      activity: "Atividade demonstrativa",
      hazard: "Agente de teste",
      sourceCircumstance: "Fixture isolada",
      possibleHarm: "Sem efeito real",
      exposedGroups: [],
      exposureDescription: "Dado sintético",
      existingMeasures: [],
      evidenceRefs: [],
      assessment: { status: "reported" },
      exposureEvaluations: [{
        id: `evaluation-${suffix}`,
        agent: "Agente de teste",
        type: "quantitative",
        status: "collected",
        method: "Método sintético",
        result: "80",
        unit: "unidade sintética",
        evaluatedAt: "2026-10-12",
        responsible: "Responsável de teste",
        qualification: "Qualificação sintética",
        professionalRegistration: "Registro sintético",
        artReference: "ART sintética",
        evidenceRefs: ["evidência sintética"],
      }],
    }],
  };
  try {
    await exposureClient.query("BEGIN");
    await exposureClient.query("SET LOCAL ROLE sst_hoje_app");
    await exposureClient.query("SELECT set_config('sst.user_id', $1, true)", [exposureActor.userId]);
    await exposureClient.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantA]);
    await createPgrInventoryInTransaction(exposureClient, exposureActor, `inventory-${suffix}`, exposureInventory, exposureActor);
    const submitted = await transitionPgrInventoryInTransaction(exposureClient, exposureActor, `inventory-${suffix}`, "in_review", 1, exposureActor);
    assert.ok(submitted);
    const approved = await transitionPgrInventoryInTransaction(exposureClient, exposureActor, `inventory-${suffix}`, "approved", submitted.revision, exposureActor);
    assert.ok(approved);
    const written = await exposureClient.query(
      "SELECT risk_item_id, evaluation_type, status, art_reference FROM sst.pgr_exposure_evaluations WHERE tenant_id = $1 AND inventory_id = $2",
      [tenantA, `inventory-${suffix}`],
    );
    assert.deepEqual(written.rows, [{ risk_item_id: `risk-${suffix}`, evaluation_type: "quantitative", status: "collected", art_reference: "ART sintética" }]);

    const pcmsoId = `pcmso-${suffix}`;
    const pcmsoCreatedAt = new Date().toISOString();
    const pcmsoSource = { id: pcmsoId, tenantId: tenantA, companyId: companyA, unitId: unitA,
      companyName: "Empresa teste", unitName: "Unidade teste", coordinatorId: exposureActor.userId,
      status: "draft", version: 0, content: "", revisions: [], createdAt: pcmsoCreatedAt, updatedAt: pcmsoCreatedAt,
      history: [{ action: "assigned", actorUserId: "admin-pcmso-test", occurredAt: pcmsoCreatedAt }] };
    assert.equal(await importPcmsoTenantBatchInTransaction(exposureClient, tenantA, [pcmsoSource]), "imported");
    assert.equal(await importPcmsoTenantBatchInTransaction(exposureClient, tenantA, [pcmsoSource]), "already_imported");
    const linkVersion = await savePcmsoPgrRiskLinksInTransaction(exposureClient, exposureActor, pcmsoId, 0, `inventory-${suffix}`, [`risk-${suffix}`]);
    assert.equal(linkVersion, 1);
    const linked = await exposureClient.query(
      `SELECT s.inventory_revision, s.medical_review_status, l.risk_item_id
       FROM sst.pcmso_pgr_link_sets s JOIN sst.pcmso_pgr_risk_links l USING (tenant_id, pcmso_id)
       WHERE s.tenant_id = $1 AND s.pcmso_id = $2`,
      [tenantA, pcmsoId],
    );
    assert.deepEqual(linked.rows.map((row) => ({ ...row, inventory_revision: Number(row.inventory_revision) })), [{ inventory_revision: approved.revision, medical_review_status: "pending", risk_item_id: `risk-${suffix}` }]);
    const reviewedLinkVersion = await reviewPcmsoPgrRiskLinksInTransaction(exposureClient, exposureActor, pcmsoId, linkVersion);
    assert.equal(reviewedLinkVersion, 2);
    const reviewedLink = await exposureClient.query("SELECT version, medical_review_status, reviewer_user_id FROM sst.pcmso_pgr_link_sets WHERE tenant_id = $1 AND pcmso_id = $2", [tenantA, pcmsoId]);
    assert.deepEqual(reviewedLink.rows, [{ version: 2, medical_review_status: "reviewed", reviewer_user_id: exposureActor.userId }]);
    const linkHistoryId = await exposureClient.query("SELECT id FROM sst.pcmso_pgr_link_history WHERE tenant_id = $1 AND pcmso_id = $2 ORDER BY version LIMIT 1", [tenantA, pcmsoId]);
    await exposureClient.query("SAVEPOINT append_only_link_history");
    await assert.rejects(exposureClient.query("UPDATE sst.pcmso_pgr_link_history SET action = 'reviewed' WHERE id = $1", [linkHistoryId.rows[0].id]), { code: "42501" });
    await exposureClient.query("ROLLBACK TO SAVEPOINT append_only_link_history");

    await exposureClient.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantB]);
    const hidden = await exposureClient.query("SELECT id FROM sst.pgr_exposure_evaluations");
    assert.equal(hidden.rowCount, 0);
    const hiddenPcmso = await exposureClient.query("SELECT pcmso_id FROM sst.pcmso_pgr_link_sets");
    assert.equal(hiddenPcmso.rowCount, 0);
    await exposureClient.query("ROLLBACK");
  } catch (error) {
    await exposureClient.query("ROLLBACK");
    throw error;
  } finally {
    exposureClient.release();
  }

  stage = "verify-rls-and-audit";
  const scoped = await runtime.connect();
  try {
    await scoped.query("BEGIN");
    await scoped.query("SET LOCAL ROLE sst_hoje_app");
    const noTenantContext = await scoped.query("SELECT id FROM sst.pgr_risk_inventories");
    assert.equal(noTenantContext.rowCount, 0);
    await scoped.query("SELECT set_config('sst.tenant_id', $1, true)", [tenantA]);
    const visible = await scoped.query("SELECT id, status, reviewer_user_id FROM sst.pgr_risk_inventories ORDER BY id");
    assert.deepEqual(visible.rows, [{ id: draftId, status: "approved", reviewer_user_id: "reviewer-pgr-test" }]);
    const importedAudit = await scoped.query("SELECT id, target_id FROM sst.pgr_audit_history");
    assert.deepEqual(importedAudit.rows, [{ id: sourceEvent.id, target_id: null }]);
    await scoped.query("SAVEPOINT tenant_write_check");
    await assert.rejects(
      scoped.query(
        `INSERT INTO sst.pgr_risk_inventories
         (tenant_id, id, source_draft_id, company_id, unit_id, title, activity_description, action_plan, status, revision, created_at, updated_at)
         VALUES ($1, 'cross-tenant-attempt', 'cross-tenant-source', $2, $3, 'x', 'x', 'x', 'draft', 1, now(), now())`,
        [tenantB, companyB, unitB],
      ),
      { code: "42501" },
    );
    await scoped.query("ROLLBACK TO SAVEPOINT tenant_write_check");
    await scoped.query("ROLLBACK");
  } finally {
    scoped.release();
  }
  console.log("PGR/PCMSO PostgreSQL isolado: migrations 0001-0007, importação/idempotência, avaliações, vínculo PCMSO-PGR por revisão, histórico append-only e isolamento RLS passaram.");
} catch (error) {
  const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "verification-error";
  const detail = error instanceof Error ? error.message : "falha sem detalhe";
  console.error(`A verificação PostgreSQL PGR isolada falhou na etapa ${stage} (${errorCode}): ${detail}; nenhum banco persistente do app foi usado.`);
  process.exitCode = 1;
} finally {
  await runtime?.end();
  await admin?.end();
  if (containerStarted) {
    try { docker(["rm", "-f", containerName]); } catch {}
  }
}
