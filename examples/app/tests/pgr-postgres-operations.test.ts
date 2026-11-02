import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { createPgrInventoryInTransaction, listApprovedPgrRiskOptionsInTransaction, listPgrInventoriesInTransaction, savePgrInventoryInTransaction, transitionPgrInventoryInTransaction } from "../src/lib/pgr-postgres-operations.ts";
import { executeTenantWriteTransaction, type TenantWriteContext } from "../src/lib/tenant-write-operations.ts";
import type { PgrRiskInventory } from "../src/lib/pgr-risk-inventory.ts";
import { ESOCIAL_CATALOG_SNAPSHOT } from "../src/lib/esocial-catalog.ts";

const context: TenantWriteContext = { tenantId: "tenant-ficticio", userId: "actor-ficticio", role: "consultoria_admin" };

function inventory(): PgrRiskInventory {
  return {
    schemaVersion: 1,
    tenantId: context.tenantId,
    companyId: "company-ficticia",
    unitId: "unit-ficticia",
    revision: 1,
    title: "PGR fictício",
    activityDescription: "Atividades a revisar.",
    actionPlan: "Plano a revisar.",
    items: [{ id: "risk-ficticio-1", process: "", activity: "", hazard: "", sourceCircumstance: "", possibleHarm: "", exposedGroups: [], exposureDescription: "", existingMeasures: [], evidenceRefs: [], assessment: { status: "reported" }, exposureEvaluations: [{ id: "eval-ficticia-1", agent: "Agente demonstrativo", type: "quantitative", status: "planned", evidenceRefs: ["evidence-ficticia-1"] }] }],
  };
}

function fakeClient(options: { status?: string; revision?: number; content?: PgrRiskInventory; legacySource?: unknown; auditFails?: boolean; evaluationFails?: boolean } = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      statements.push({ sql: normalized, values });
      if (normalized.startsWith("SELECT company_id, unit_id, status, revision")) {
        return { rows: options.status ? [{ company_id: "company-ficticia", unit_id: "unit-ficticia", status: options.status, revision: options.revision ?? 1, legacy_source: options.legacySource ?? null }] : [], rowCount: options.status ? 1 : 0 };
      }
      if (normalized.startsWith("SELECT content FROM sst.pgr_risk_inventory_revisions")) {
        return { rows: options.content ? [{ content: options.content }] : [], rowCount: options.content ? 1 : 0 };
      }
      if (normalized.startsWith("INSERT INTO sst.pgr_exposure_evaluations") && options.evaluationFails) throw new Error("falha simulada da avaliação ambiental");
      if (normalized.startsWith("INSERT INTO sst.pgr_audit_history") && options.auditFails) throw new Error("falha simulada da auditoria PGR");
      return { rows: [], rowCount: 1 };
    },
  };
  return { client: client as unknown as PoolClient, statements };
}

test("criação persiste cabeçalho, item, snapshot e auditoria na mesma transação", async () => {
  const { client, statements } = fakeClient();
  const input = inventory();
  const table24 = ESOCIAL_CATALOG_SNAPSHOT.tables.find((table) => table.table === "24");
  assert.ok(table24);
  const code = table24.entries[0];
  assert.ok(code);
  input.items[0].esocialTable24 = {
    code: code.code,
    label: code.label,
    catalogVersion: ESOCIAL_CATALOG_SNAPSHOT.sourceVersion,
    sourceUrl: ESOCIAL_CATALOG_SNAPSHOT.sourceUrl,
    rationale: "Associação manual fictícia para teste.",
  };
  const created = await executeTenantWriteTransaction(client, context, (tx, access) =>
    createPgrInventoryInTransaction(tx, access, "inventory-ficticio", input, context));
  const queries = statements.map(({ sql }) => sql);
  assert.equal(created.items.length, 1);
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_inventories")));
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_items")));
  assert.ok(queries.some((sql) => sql.startsWith("DELETE FROM sst.pgr_exposure_evaluations")));
  const evaluationInsert = statements.find(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_exposure_evaluations"));
  assert.ok(evaluationInsert);
  assert.equal(evaluationInsert.values[2], "risk-ficticio-1");
  assert.equal(evaluationInsert.values[3], "eval-ficticia-1");
  assert.deepEqual(JSON.parse(String(evaluationInsert.values[15])), ["evidence-ficticia-1"]);
  const snapshot = statements.find(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_risk_inventory_revisions"));
  assert.equal(JSON.parse(String(snapshot?.values[3])).items[0].esocialTable24.code, code.code);
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_inventory_revisions")));
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_audit_history")));
  assert.ok(queries.indexOf("DELETE FROM sst.pgr_exposure_evaluations WHERE tenant_id = $1 AND inventory_id = $2") < queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.pgr_exposure_evaluations")));
  assert.ok(queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.pgr_exposure_evaluations")) < queries.findIndex((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_inventory_revisions")));
  assert.equal(queries.at(-1), "COMMIT");
});

test("edição obedece revisão/escopo, desativa itens removidos e grava snapshot", async () => {
  const { client, statements } = fakeClient({ status: "draft", revision: 4 });
  const input = { ...inventory(), revision: 4 };
  const saved = await executeTenantWriteTransaction(client, context, (tx, access) =>
    savePgrInventoryInTransaction(tx, access, "inventory-ficticio", 4, input, context));
  assert.equal(saved?.revision, 5);
  assert.ok(statements.some(({ sql }) => sql.startsWith("UPDATE sst.pgr_risk_items SET active = false")));
  assert.ok(statements.some(({ sql }) => sql.startsWith("DELETE FROM sst.pgr_exposure_evaluations")));
  assert.ok(statements.some(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_exposure_evaluations")));
  assert.ok(statements.some(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_risk_inventory_revisions")));

  const stale = fakeClient({ status: "draft", revision: 5 });
  const rejected = await executeTenantWriteTransaction(stale.client, context, (tx, access) =>
    savePgrInventoryInTransaction(tx, access, "inventory-ficticio", 4, input, context));
  assert.equal(rejected, null);
  assert.equal(stale.statements.some(({ sql }) => sql.startsWith("UPDATE sst.pgr_risk_inventories")), false);
});

test("transição aprova somente revisão atual e inclui evento transacional", async () => {
  const incomplete = inventory();
  const current = {
    ...incomplete,
    revision: 3,
    items: incomplete.items.map((item) => ({
      ...item,
      process: "Processo fictício",
      activity: "Atividade fictícia",
      hazard: "Perigo fictício",
      sourceCircumstance: "Circunstância fictícia",
      possibleHarm: "Dano possível fictício",
      exposureDescription: "Exposição fictícia",
    })),
  };
  const { client, statements } = fakeClient({ status: "in_review", revision: 3, content: current });
  const approved = await executeTenantWriteTransaction(client, context, (tx, access) =>
    transitionPgrInventoryInTransaction(tx, access, "inventory-ficticio", "approved", 3, context));
  assert.equal(approved?.revision, 4);
  assert.ok(statements.some(({ sql, values }) => sql.startsWith("UPDATE sst.pgr_risk_inventories") && values[2] === "approved"));
  assert.ok(statements.some(({ sql, values }) => sql.startsWith("INSERT INTO sst.pgr_audit_history") && values[4] === "pgr.approved"));
  assert.equal(statements.at(-1)?.sql, "COMMIT");
});

test("leitura médica retorna só resumo de riscos e filtra por tenant, unidade atribuída e PGR aprovado", async () => {
  const current = { ...inventory(), revision: 3 };
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      statements.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      return { rows: [{ id: "inventory-1", company_id: current.companyId, unit_id: current.unitId, title: current.title, revision: 3, content: current }], rowCount: 1 };
    },
  } as unknown as PoolClient;
  const options = await listApprovedPgrRiskOptionsInTransaction(client, context.tenantId, [{ companyId: current.companyId, unitId: current.unitId }]);
  assert.equal(options.length, 1);
  assert.equal(options[0].risks[0].id, "risk-ficticio-1");
  assert.equal("assessment" in options[0].risks[0], false);
  assert.equal("exposureEvaluations" in options[0].risks[0], false);
  assert.match(statements[0].sql, /i\.tenant_id = \$1 AND i\.status = 'approved'/);
  assert.match(statements[0].sql, /jsonb_to_recordset/);
  assert.equal(statements[0].values[0], context.tenantId);
  assert.deepEqual(JSON.parse(String(statements[0].values[1])), [{ companyId: current.companyId, unitId: current.unitId }]);
});

test("não consulta inventários quando o médico não tem unidade PCMSO atribuída", async () => {
  const { client, statements } = fakeClient();
  const result = await listApprovedPgrRiskOptionsInTransaction(client, context.tenantId, []);
  assert.deepEqual(result, []);
  assert.equal(statements.length, 0);
});

test("falha da auditoria reverte criação integral", async () => {
  const { client, statements } = fakeClient({ auditFails: true });
  await assert.rejects(executeTenantWriteTransaction(client, context, (tx, access) =>
    createPgrInventoryInTransaction(tx, access, "inventory-ficticio", inventory(), context)), /falha simulada/);
  const queries = statements.map(({ sql }) => sql);
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_inventories")));
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_inventory_revisions")));
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(queries.includes("COMMIT"), false);
});

test("remoção de avaliação limpa somente a projeção atual e registra snapshot sem avaliação", async () => {
  const { client, statements } = fakeClient({ status: "draft", revision: 2 });
  const input = { ...inventory(), revision: 2, items: [{ ...inventory().items[0], exposureEvaluations: [] }] };
  const saved = await executeTenantWriteTransaction(client, context, (tx, access) =>
    savePgrInventoryInTransaction(tx, access, "inventory-ficticio", 2, input, context));
  assert.equal(saved?.items[0].exposureEvaluations?.length, 0);
  assert.ok(statements.some(({ sql }) => sql.startsWith("DELETE FROM sst.pgr_exposure_evaluations")));
  assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_exposure_evaluations")), false);
  const snapshot = statements.find(({ sql }) => sql.startsWith("INSERT INTO sst.pgr_risk_inventory_revisions"));
  assert.equal(JSON.parse(String(snapshot?.values[3])).items[0].exposureEvaluations.length, 0);
});

test("falha ao gravar avaliação reverte item, snapshot e auditoria", async () => {
  const { client, statements } = fakeClient({ evaluationFails: true });
  await assert.rejects(executeTenantWriteTransaction(client, context, (tx, access) =>
    createPgrInventoryInTransaction(tx, access, "inventory-ficticio", inventory(), context)), /falha simulada da avaliação ambiental/);
  const queries = statements.map(({ sql }) => sql);
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_items")));
  assert.ok(queries.some((sql) => sql.startsWith("DELETE FROM sst.pgr_exposure_evaluations")));
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_risk_inventory_revisions")), false);
  assert.equal(queries.some((sql) => sql.startsWith("INSERT INTO sst.pgr_audit_history")), false);
  assert.equal(queries.includes("COMMIT"), false);
});

test("recusa inventário de outro tenant antes de qualquer SQL", async () => {
  const { client, statements } = fakeClient();
  await assert.rejects(createPgrInventoryInTransaction(client, context, "inventory-ficticio", { ...inventory(), tenantId: "tenant-alheio" }, context), /consultoria/);
  assert.equal(statements.length, 0);
});

test("edição não pode substituir nem remover o snapshot legado preservado", async () => {
  const legacySource = { draftId: "old-draft", status: "draft" as const, revision: 1, authorUserId: "actor", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", snapshots: [], history: [] };
  const input = { ...inventory(), legacySource };
  const { client, statements } = fakeClient({ status: "draft", revision: 2, legacySource });
  const result = await executeTenantWriteTransaction(client, context, (tx, access) =>
    savePgrInventoryInTransaction(tx, access, "inventory-ficticio", 2, { ...input, legacySource: { ...legacySource, draftId: "forged" } }, context));
  assert.equal(result, null);
  assert.equal(statements.some(({ sql }) => sql.startsWith("UPDATE sst.pgr_risk_inventories SET")), false);
});

test("leitura filtra tenant e rejeita cabeçalho divergente do snapshot", async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const content = inventory();
  const client = {
    async query(sql: string, values: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      statements.push({ sql: normalized, values });
      return { rows: [{ id: "inventory-ficticio", status: "draft", reviewer_user_id: null, reviewer_role: null, company_id: content.companyId, unit_id: content.unitId, title: content.title, activity_description: content.activityDescription, action_plan: content.actionPlan, created_at: "2026-10-12T12:00:00.000Z", updated_at: "2026-10-12T12:00:00.000Z", revision: 1, content }], rowCount: 1 };
    },
  } as unknown as PoolClient;
  const listed = await listPgrInventoriesInTransaction(client, context.tenantId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].inventory.tenantId, context.tenantId);
  assert.deepEqual(statements[0].values, [context.tenantId]);
  assert.match(statements[0].sql, /WHERE i\.tenant_id = \$1/);

  const mismatchedClient = {
    async query() {
      return { rows: [{ id: "inventory-ficticio", status: "draft", reviewer_user_id: null, reviewer_role: null, company_id: content.companyId, unit_id: content.unitId, title: "Título divergente", activity_description: content.activityDescription, action_plan: content.actionPlan, created_at: "2026-10-12T12:00:00.000Z", updated_at: "2026-10-12T12:00:00.000Z", revision: 1, content }], rowCount: 1 };
    },
  } as unknown as PoolClient;
  await assert.rejects(listPgrInventoriesInTransaction(mismatchedClient, context.tenantId), /incompatível/);
});
