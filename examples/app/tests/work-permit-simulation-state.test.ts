import test from "node:test";
import assert from "node:assert/strict";
import { applySimulationIntent, createDemoActivityReference, createSimulation, decodeSimulation, encodeSimulation, GENERIC_ITEM_PROMPT, isDemoActivityCompatible, isDemoAprCompatible, isDemoWorkerInScope, isScaffoldAssemblyAssignmentValid, parseSimulationChecklist } from "../src/lib/work-permit-simulation-state.ts";
import { openPermitNc } from "../src/lib/work-permit-checklist-workflow.ts";

test("permalink recusa escopo diferente do ensaio e preserva item genérico", () => {
  const started = createSimulation(true, {
    tenantId: "tenant-demo",
    aprId: "apr-demo",
    aprRevision: 3,
    companyId: "company-demo",
    unitId: "unit-demo",
    activity: createDemoActivityReference({ tenantId: "tenant-demo", aprId: "apr-demo", aprRevision: 3, companyId: "company-demo", unitId: "unit-demo", activityStage: "Etapa informada na APR", workArea: "Área informada na APR", scaffoldUseStatus: "used", scaffoldAssemblyStatus: "not_included", scaffoldAssemblerWorkerIds: [] }),
    supervisorWorkerId: "worker-demo",
  });
  assert.equal(started.scenario.activity.kind, "work_at_height_demo");
  assert.equal(started.scenario.activity.technicalCriteriaStatus, "pending_human_review");
  assert.deepEqual(started.scenario.activity.scope, { tenantId: "tenant-demo", companyId: "company-demo", unitId: "unit-demo" });
  assert.deepEqual(started.scenario.activity.sourceApr, { id: "apr-demo", revision: 3 });
  assert.equal(started.scenario.activity.activityStage, "Etapa informada na APR");
  assert.equal(started.scenario.activity.workArea, "Área informada na APR");
  assert.equal(started.scenario.activity.scaffoldUseStatus, "used");
  assert.equal(started.scenario.activity.scaffoldAssemblyStatus, "not_included");
  assert.deepEqual(started.scenario.activity.scaffoldAssemblerWorkerIds, []);
  assert.deepEqual(
    { tenantId: started.checklist.tenantId, companyId: started.checklist.companyId, unitId: started.checklist.unitId, activityId: started.checklist.activityId },
    { tenantId: "tenant-demo", companyId: "company-demo", unitId: "unit-demo", activityId: "demo-height-activity" },
  );
  const encoded = encodeSimulation(started);
  assert.deepEqual(decodeSimulation(encoded), started);
  assert.equal(decodeSimulation("%%%"), null);
  const tampered = structuredClone(started);
  tampered.checklist.tenantId = "tenant-real";
  assert.equal(parseSimulationChecklist(tampered.checklist, { tenantId: "tenant-demo", companyId: "company-demo", unitId: "unit-demo", activityId: "demo-height-activity" }), null);
  assert.equal(decodeSimulation(Buffer.from(JSON.stringify({
    ...started,
    checklist: { ...started.checklist, companyId: "company-other" },
  })).toString("base64url")), null);
  assert.equal(decodeSimulation(Buffer.from(JSON.stringify({
    ...started,
    scenario: { ...started.scenario, aprRevision: 0 },
  })).toString("base64url")), null);
  assert.equal(decodeSimulation(Buffer.from(JSON.stringify({
    ...started,
    scenario: { ...started.scenario, activity: { ...started.scenario.activity, sourceApr: { id: "apr-other", revision: 3 } } },
  })).toString("base64url")), null);
  assert.equal(decodeSimulation(Buffer.from(JSON.stringify({
    ...started,
    scenario: { ...started.scenario, activity: { ...started.scenario.activity, scope: { ...started.scenario.activity.scope, unitId: "unit-other" } } },
  })).toString("base64url")), null);
  assert.equal(decodeSimulation(Buffer.from(JSON.stringify({
    ...started,
    scenario: { ...started.scenario, activity: { ...started.scenario.activity, scaffoldUseStatus: "unknown" } },
  })).toString("base64url")), null);
  assert.equal(decodeSimulation(Buffer.from(JSON.stringify({
    ...started,
    scenario: { ...started.scenario, activity: { ...started.scenario.activity, scaffoldAssemblyStatus: "included", scaffoldAssemblerWorkerIds: [] } },
  })).toString("base64url")), null);
  const submitted = applySimulationIntent(started, "submit_supervisor", { result: "nc", note: "Situação fictícia" });
  assert.equal(submitted.checklist.answers[0].prompt, GENERIC_ITEM_PROMPT);
  assert.deepEqual(
    { tenantId: submitted.checklist.tenantId, companyId: submitted.checklist.companyId, unitId: submitted.checklist.unitId, activityId: submitted.checklist.activityId },
    { tenantId: "tenant-demo", companyId: "company-demo", unitId: "unit-demo", activityId: "demo-height-activity" },
  );
  const mismatchedScenario = structuredClone(started);
  mismatchedScenario.scenario.activity = { ...mismatchedScenario.scenario.activity, scope: { ...mismatchedScenario.scenario.activity.scope, tenantId: "tenant-other" } };
  assert.throws(() => applySimulationIntent(mismatchedScenario, "submit_supervisor", { result: "nc", note: "Divergência" }));
  assert.equal(submitted.scenario.supervisorWorkerId, "worker-demo");
  assert.throws(() => createSimulation(true, {
    tenantId: "tenant-demo",
    aprId: "",
    aprRevision: 3,
    companyId: "company-demo",
    unitId: "unit-demo",
    activity: createDemoActivityReference({ tenantId: "tenant-demo", aprId: "apr-demo", aprRevision: 3, companyId: "company-demo", unitId: "unit-demo", activityStage: "Etapa informada na APR", workArea: "Área informada na APR", scaffoldUseStatus: "not_informed", scaffoldAssemblyStatus: "not_informed", scaffoldAssemblerWorkerIds: [] }),
    supervisorWorkerId: "",
  }));
});

test("seleção de supervisor demo só aceita funcionário ativo no tenant, empresa e unidade escolhidos", () => {
  const scope = { tenantId: "tenant-demo", companyId: "company-demo", unitId: "unit-demo" };
  const worker = { ...scope, id: "worker-demo", status: "active" as const };
  assert.equal(isDemoWorkerInScope(worker, scope), true);
  assert.equal(isDemoWorkerInScope({ ...worker, tenantId: "tenant-other" }, scope), false);
  assert.equal(isDemoWorkerInScope({ ...worker, companyId: "company-other" }, scope), false);
  assert.equal(isDemoWorkerInScope({ ...worker, unitId: "unit-other" }, scope), false);
  assert.equal(isDemoWorkerInScope({ ...worker, status: "archived" }, scope), false);
});

test("vínculo APR demo exige tenant, escopo, estado elegível e revisão selecionada", () => {
  const apr = { id: "apr-demo", tenantId: "tenant-demo", companyId: "company-demo", unitId: "unit-demo", revision: 4, status: "in_review" as const };
  const expected = { tenantId: "tenant-demo", companyId: "company-demo", unitId: "unit-demo", aprId: "apr-demo", revision: 4 };
  assert.equal(isDemoAprCompatible(apr, expected), true);
  assert.equal(isDemoAprCompatible({ ...apr, tenantId: "tenant-other" }, expected), false);
  assert.equal(isDemoAprCompatible({ ...apr, companyId: "company-other" }, expected), false);
  assert.equal(isDemoAprCompatible({ ...apr, unitId: "unit-other" }, expected), false);
  assert.equal(isDemoAprCompatible({ ...apr, revision: 3 }, expected), false);
  assert.equal(isDemoAprCompatible({ ...apr, status: "archived" }, expected), false);
});

test("referência da atividade demo preserva apenas etapa e área da APR vinculada", () => {
  const source = {
    tenantId: "tenant-demo",
    aprId: "apr-demo",
    aprRevision: 4,
    companyId: "company-demo",
    unitId: "unit-demo",
    activityStage: "Etapa informada na APR",
    workArea: "Área informada na APR",
    scaffoldUseStatus: "used" as const,
    scaffoldAssemblyStatus: "not_included" as const,
    scaffoldAssemblerWorkerIds: [],
  };
  const activity = createDemoActivityReference(source);
  assert.equal(isDemoActivityCompatible(activity, source), true);
  assert.equal(isDemoActivityCompatible({ ...activity, activityStage: "Etapa divergente" }, source), false);
  assert.equal(isDemoActivityCompatible({ ...activity, workArea: "Área divergente" }, source), false);
  assert.equal(isDemoActivityCompatible(activity, { ...source, aprRevision: 5 }), false);
  assert.equal(isDemoActivityCompatible(activity, { ...source, scaffoldUseStatus: "not_used" }), false);
});

test("designação de equipe de andaime requer uso declarado e ao menos um trabalhador quando montagem/desmontagem foi informada", () => {
  assert.equal(isScaffoldAssemblyAssignmentValid({
    scaffoldUseStatus: "used",
    scaffoldAssemblyStatus: "included",
    scaffoldAssemblerWorkerIds: ["worker-a"],
  }), true);
  assert.equal(isScaffoldAssemblyAssignmentValid({
    scaffoldUseStatus: "used",
    scaffoldAssemblyStatus: "included",
    scaffoldAssemblerWorkerIds: [],
  }), false);
  assert.equal(isScaffoldAssemblyAssignmentValid({
    scaffoldUseStatus: "not_used",
    scaffoldAssemblyStatus: "included",
    scaffoldAssemblerWorkerIds: ["worker-a"],
  }), false);
  assert.equal(isScaffoldAssemblyAssignmentValid({
    scaffoldUseStatus: "used",
    scaffoldAssemblyStatus: "not_included",
    scaffoldAssemblerWorkerIds: ["worker-a"],
  }), false);
  assert.equal(isScaffoldAssemblyAssignmentValid({
    scaffoldUseStatus: "used",
    scaffoldAssemblyStatus: "not_informed",
    scaffoldAssemblerWorkerIds: [],
  }), true);
});

test("ensaio cobre NC, TST, assunção e participação sem gravar autoridade", () => {
  let simulation = createSimulation(true, {
    tenantId: "tenant-demo",
    aprId: "apr-demo",
    aprRevision: 3,
    companyId: "company-demo",
    unitId: "unit-demo",
    activity: createDemoActivityReference({ tenantId: "tenant-demo", aprId: "apr-demo", aprRevision: 3, companyId: "company-demo", unitId: "unit-demo", activityStage: "Etapa informada na APR", workArea: "Área informada na APR", scaffoldUseStatus: "not_informed", scaffoldAssemblyStatus: "not_informed", scaffoldAssemblerWorkerIds: [] }),
    supervisorWorkerId: "worker-demo",
  });
  let state = simulation.checklist;
  simulation = applySimulationIntent(simulation, "submit_supervisor", { result: "nc", note: "Situação fictícia" });
  state = simulation.checklist;
  assert.equal(state.status, "awaiting_tst");
  assert.throws(() => applySimulationIntent(simulation, "continue_with_nc", { note: "Bypass" }));
  simulation = applySimulationIntent(simulation, "review_tst", { verdict: "nc_remains", evidence: "Parecer fictício", note: "NC permanece" });
  simulation = applySimulationIntent(simulation, "continue_with_nc", { note: "Assunção fictícia" });
  state = simulation.checklist;
  assert.equal(state.status, "continuation_with_nc_recorded");
  simulation = applySimulationIntent(simulation, "sign_participation", { participantId: "fictitious-participant-a", statement: "Participo deste ensaio." });
  state = simulation.checklist;
  assert.equal(openPermitNc(state).length, 1);
  assert.equal(state.signatures[0].userId, "fictitious-participant-a");
  assert.throws(() => applySimulationIntent(simulation, "sign_participation", { participantId: "fictitious-leader", statement: "Conta indevida" }));
});
