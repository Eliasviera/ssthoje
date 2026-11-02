import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listWorkersForTenant, updateWorkerDetails } from "../src/lib/worker-store.ts";

const original = process.cwd();
const tenantId = "tenant-worker-test";
const worker = {
  id: "worker-test",
  tenantId,
  companyId: "company-test",
  unitId: "unit-test",
  displayName: "Colaborador fictício 01",
  sex: "Masculino",
  jobTitle: "Função fictícia",
  riskCategories: ["Outro"],
  status: "active",
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
  history: [],
};

function writeWorkers(records: unknown[]) {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(join(process.cwd(), "data", "workers.json"), JSON.stringify(records));
}

before(() => {
  process.chdir(mkdtempSync(join(original, "data", "worker-tests-")));
  writeWorkers([worker]);
});

after(() => process.chdir(original));

test("worker store updates fictional identification and records the field in history", () => {
  const legacyWorker = listWorkersForTenant(tenantId)[0];
  assert.equal(legacyWorker.nr35TrainingStatus, "not_informed");
  assert.equal(legacyWorker.heightWorkSupervisionTrainingStatus, "not_informed");
  assert.equal(legacyWorker.scaffoldingAssemblyTrainingStatus, "not_informed");

  const updated = updateWorkerDetails(tenantId, worker.id, {
    displayName: "Colaborador fictício A",
    sex: "Feminino",
    jobTitle: worker.jobTitle,
    riskCategories: ["Outro"],
    nr35TrainingStatus: "reported_pending_validation",
    heightWorkSupervisionTrainingStatus: "reported_pending_validation",
    scaffoldingAssemblyTrainingStatus: "reported_pending_validation",
  }, { userId: "sst-demo-user", role: "consultoria_admin" });

  assert.equal(updated?.displayName, "Colaborador fictício A");
  assert.equal(updated?.sex, "Feminino");
  assert.equal(updated?.nr35TrainingStatus, "reported_pending_validation");
  assert.equal(updated?.heightWorkSupervisionTrainingStatus, "reported_pending_validation");
  assert.equal(updated?.scaffoldingAssemblyTrainingStatus, "reported_pending_validation");
  assert.deepEqual(updated?.history[0].changedFields, [
    "displayName", "sex", "nr35TrainingStatus", "heightWorkSupervisionTrainingStatus", "scaffoldingAssemblyTrainingStatus",
  ]);
});
