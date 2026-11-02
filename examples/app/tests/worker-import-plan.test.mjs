import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { buildWorkerImportPlan } from "../scripts/worker-import-plan.mjs";

function fixture() {
  const tenantId = "tenant-fixture";
  const companyId = randomUUID();
  const unitId = randomUUID();
  const workerId = randomUUID();
  const createdAt = "2026-01-01T00:00:00.000-03:00";
  const updatedAt = "2026-01-03T00:00:00.000Z";
  return {
    tenantId,
    companies: [{ id: companyId, tenantId, units: [{ id: unitId }] }],
    workers: [{
      id: workerId,
      tenantId,
      companyId,
      unitId,
      displayName: " Trabalhador Ficticio ",
      sex: undefined,
      jobTitle: " Função fictícia ",
      area: "   ",
      riskCategories: ["Outro", "Outro"],
      status: "archived",
      createdAt,
      updatedAt,
      history: [
        {
          id: randomUUID(),
          action: "created",
          actorUserId: "actor-fixture",
          actorRole: "consultoria_admin",
          occurredAt: createdAt,
        },
        {
          id: randomUUID(),
          action: "details_changed",
          actorUserId: "actor-fixture",
          actorRole: "consultoria_admin",
          occurredAt: "2026-01-02T00:00:00.000Z",
          changedFields: ["jobTitle"],
        },
        {
          id: randomUUID(),
          action: "status_changed",
          actorUserId: "actor-fixture",
          actorRole: "consultoria_admin",
          occurredAt: updatedAt,
          fromStatus: "active",
          toStatus: "archived",
        },
      ],
    }],
  };
}

test("import plan preserves worker history and runtime training defaults without exposing data", () => {
  const source = fixture();
  const plan = buildWorkerImportPlan(source.workers, source.tenantId, source.companies);

  assert.equal(plan.workers.length, 1);
  assert.deepEqual(plan.workers[0], {
    tenant_id: source.tenantId,
    id: source.workers[0].id,
    company_id: source.workers[0].companyId,
    unit_id: source.workers[0].unitId,
    display_name: "Trabalhador Ficticio",
    sex: "Não informado",
    job_title: "Função fictícia",
    area: null,
    risk_categories: ["Outro", "Outro"],
    nr35_training_status: "not_informed",
    height_work_supervision_training_status: "not_informed",
    scaffolding_assembly_training_status: "not_informed",
    status: "archived",
    created_at: "2026-01-01T03:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
  });
  assert.deepEqual(plan.history.map(({ id, action, actor_user_id, actor_role, occurred_at, from_status, to_status, changed_fields }) => ({
    id, action, actor_user_id, actor_role, occurred_at, from_status, to_status, changed_fields,
  })), [
    {
      id: source.workers[0].history[0].id, action: "created",
      actor_user_id: "actor-fixture", actor_role: "consultoria_admin",
      occurred_at: "2026-01-01T03:00:00.000Z", from_status: null, to_status: "active", changed_fields: [],
    },
    {
      id: source.workers[0].history[1].id, action: "details_changed",
      actor_user_id: "actor-fixture", actor_role: "consultoria_admin",
      occurred_at: "2026-01-02T00:00:00.000Z", from_status: null, to_status: null, changed_fields: ["jobTitle"],
    },
    {
      id: source.workers[0].history[2].id, action: "status_changed",
      actor_user_id: "actor-fixture", actor_role: "consultoria_admin",
      occurred_at: "2026-01-03T00:00:00.000Z", from_status: "active", to_status: "archived", changed_fields: [],
    },
  ]);
});

test("import plan rejects cross-tenant unit references and duplicate history IDs", () => {
  const source = fixture();
  source.workers[0].tenantId = "other-tenant";
  assert.throws(
    () => buildWorkerImportPlan(source.workers, source.tenantId, source.companies),
    /cadastro de trabalhador/,
  );

  const duplicateSource = fixture();
  duplicateSource.workers[0].history[1].id = duplicateSource.workers[0].history[0].id;
  assert.throws(
    () => buildWorkerImportPlan(duplicateSource.workers, duplicateSource.tenantId, duplicateSource.companies),
    /histórico do trabalhador/,
  );
});

test("import plan rejects invalid history transitions", () => {
  const source = fixture();
  source.workers[0].history[2].fromStatus = "archived";
  assert.throws(
    () => buildWorkerImportPlan(source.workers, source.tenantId, source.companies),
    /evento status_changed/,
  );
});
