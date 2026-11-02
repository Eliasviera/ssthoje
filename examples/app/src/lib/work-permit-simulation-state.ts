import {
  createPermitChecklistCandidate,
  transitionPermitChecklist,
  PermitWorkflowError,
  type PermitActor,
  type PermitAnswer,
  type PermitChecklist,
  type PermitReview,
  type PermitRole,
  type PermitScope,
  type PermitSignature,
} from "./work-permit-checklist-workflow";

export type DemoActivityReference = {
  id: "demo-height-activity";
  kind: "work_at_height_demo";
  sourceApr: { id: string; revision: number };
  scope: DemoWorkerScope;
  activityStage: string;
  workArea: string;
  scaffoldUseStatus: "not_informed" | "used" | "not_used";
  scaffoldAssemblyStatus: "not_informed" | "included" | "not_included";
  scaffoldAssemblerWorkerIds: string[];
  technicalCriteriaStatus: "pending_human_review";
};
export type SimulationScenario = {
  tenantId: string;
  aprId: string;
  aprRevision: number;
  companyId: string;
  unitId: string;
  activity: DemoActivityReference;
  supervisorWorkerId: string;
};
export type PermitSimulation = {
  checklist: PermitChecklist;
  scenario: SimulationScenario;
};
export type DemoWorkerScope = Pick<SimulationScenario, "tenantId" | "companyId" | "unitId">;
export type DemoWorkerCandidate = DemoWorkerScope & { id: string; status: "active" | "archived" };
export type DemoAprCandidate = DemoWorkerScope & { id: string; revision: number; status: "draft" | "in_review" | "archived" };

type DemoActivitySource = Pick<SimulationScenario, "tenantId" | "aprId" | "aprRevision" | "companyId" | "unitId">
  & {
    activityStage: string;
    workArea: string;
    scaffoldUseStatus: DemoActivityReference["scaffoldUseStatus"];
    scaffoldAssemblyStatus: DemoActivityReference["scaffoldAssemblyStatus"];
    scaffoldAssemblerWorkerIds: string[];
  };

export function createDemoActivityReference(source: DemoActivitySource): DemoActivityReference {
  return {
    id: "demo-height-activity",
    kind: "work_at_height_demo",
    sourceApr: { id: source.aprId, revision: source.aprRevision },
    scope: { tenantId: source.tenantId, companyId: source.companyId, unitId: source.unitId },
    activityStage: source.activityStage,
    workArea: source.workArea,
    scaffoldUseStatus: source.scaffoldUseStatus,
    scaffoldAssemblyStatus: source.scaffoldAssemblyStatus,
    scaffoldAssemblerWorkerIds: [...source.scaffoldAssemblerWorkerIds],
    technicalCriteriaStatus: "pending_human_review",
  };
}

function isDemoActivityInScope(activity: DemoActivityReference, scenario: Pick<SimulationScenario, "tenantId" | "aprId" | "aprRevision" | "companyId" | "unitId">): boolean {
  return activity.id === "demo-height-activity"
    && activity.kind === "work_at_height_demo"
    && activity.technicalCriteriaStatus === "pending_human_review"
    && text(activity.activityStage, 1000) !== null
    && text(activity.workArea, 500) !== null
    && ["not_informed", "used", "not_used"].includes(activity.scaffoldUseStatus)
    && ["not_informed", "included", "not_included"].includes(activity.scaffoldAssemblyStatus)
    && Array.isArray(activity.scaffoldAssemblerWorkerIds)
    && activity.scaffoldAssemblerWorkerIds.every(id => text(id, 140) !== null)
    && new Set(activity.scaffoldAssemblerWorkerIds).size === activity.scaffoldAssemblerWorkerIds.length
    && isScaffoldAssemblyAssignmentValid(activity)
    && activity.sourceApr.id === scenario.aprId
    && activity.sourceApr.revision === scenario.aprRevision
    && activity.scope.tenantId === scenario.tenantId
    && activity.scope.companyId === scenario.companyId
    && activity.scope.unitId === scenario.unitId;
}

export function isDemoActivityCompatible(activity: DemoActivityReference, source: DemoActivitySource): boolean {
  return isDemoActivityInScope(activity, source)
    && activity.activityStage === source.activityStage
    && activity.workArea === source.workArea
    && activity.scaffoldUseStatus === source.scaffoldUseStatus
    && activity.scaffoldAssemblyStatus === source.scaffoldAssemblyStatus
    && JSON.stringify(activity.scaffoldAssemblerWorkerIds) === JSON.stringify(source.scaffoldAssemblerWorkerIds);
}

export function isScaffoldAssemblyAssignmentValid(activity: Pick<DemoActivityReference, "scaffoldUseStatus" | "scaffoldAssemblyStatus" | "scaffoldAssemblerWorkerIds">): boolean {
  if (activity.scaffoldAssemblyStatus === "included") {
    return activity.scaffoldUseStatus === "used" && activity.scaffoldAssemblerWorkerIds.length > 0;
  }
  return activity.scaffoldAssemblerWorkerIds.length === 0;
}

function scopeForScenario(scenario: SimulationScenario): PermitScope {
  return {
    tenantId: scenario.tenantId,
    companyId: scenario.companyId,
    unitId: scenario.unitId,
    activityId: scenario.activity.id,
  };
}

export function isDemoWorkerInScope(worker: DemoWorkerCandidate, scope: DemoWorkerScope): boolean {
  return worker.status === "active" && worker.id.length > 0
    && worker.tenantId === scope.tenantId && worker.companyId === scope.companyId && worker.unitId === scope.unitId;
}
export function isDemoAprCompatible(apr: DemoAprCandidate, expected: DemoWorkerScope & { aprId?: string; revision?: number }): boolean {
  return (apr.status === "draft" || apr.status === "in_review")
    && apr.tenantId === expected.tenantId
    && apr.companyId === expected.companyId
    && apr.unitId === expected.unitId
    && (!expected.aprId || apr.id === expected.aprId)
    && (expected.revision === undefined || apr.revision === expected.revision);
}

export const GENERIC_ITEM_ID = "generic-item";
export const GENERIC_ITEM_PROMPT = "Item genérico de demonstração. Não é critério técnico de trabalho em altura.";
export const PARTICIPANT_IDS = ["fictitious-participant-a", "fictitious-participant-b"] as const;
const ROLES: PermitRole[] = ["leader", "supervisor", "tst", "participant"];
const RESULTS = ["conforming", "nc", "not_applicable"] as const;
const VERDICTS = ["corrected", "nc_remains"] as const;
const STATUSES: PermitChecklist["status"][] = [
  "draft", "awaiting_tst", "supervisor_decision", "awaiting_correction", "release_recorded", "continuation_with_nc_recorded",
];

function text(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}
function parseDemoActivity(value: unknown, scenario: Pick<SimulationScenario, "tenantId" | "aprId" | "aprRevision" | "companyId" | "unitId">): DemoActivityReference | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.id !== "demo-height-activity" || row.kind !== "work_at_height_demo"
    || row.technicalCriteriaStatus !== "pending_human_review" || !row.sourceApr || typeof row.sourceApr !== "object"
    || !row.scope || typeof row.scope !== "object" || !text(row.activityStage, 1000) || !text(row.workArea, 500)
    || !["not_informed", "used", "not_used"].includes(row.scaffoldUseStatus as string)
    || !["not_informed", "included", "not_included"].includes(row.scaffoldAssemblyStatus as string)
    || !Array.isArray(row.scaffoldAssemblerWorkerIds)
    || !row.scaffoldAssemblerWorkerIds.every(id => text(id, 140) !== null)
    || new Set(row.scaffoldAssemblerWorkerIds).size !== row.scaffoldAssemblerWorkerIds.length) return null;
  const sourceApr = row.sourceApr as Record<string, unknown>;
  const scope = row.scope as Record<string, unknown>;
  if (sourceApr.id !== scenario.aprId || sourceApr.revision !== scenario.aprRevision
    || scope.tenantId !== scenario.tenantId || scope.companyId !== scenario.companyId || scope.unitId !== scenario.unitId) return null;
  const activity = createDemoActivityReference({
    ...scenario,
    activityStage: row.activityStage as string,
    workArea: row.workArea as string,
    scaffoldUseStatus: row.scaffoldUseStatus as DemoActivityReference["scaffoldUseStatus"],
    scaffoldAssemblyStatus: row.scaffoldAssemblyStatus as DemoActivityReference["scaffoldAssemblyStatus"],
    scaffoldAssemblerWorkerIds: row.scaffoldAssemblerWorkerIds as string[],
  });
  return isDemoActivityInScope(activity, scenario) ? activity : null;
}
function answers(value: unknown): PermitAnswer[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const parsed: PermitAnswer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const result = RESULTS.find(option => option === row.result);
    if (!text(row.id, 64) || !text(row.prompt, 300) || !result || typeof row.note !== "string" || row.note.length > 2000) return null;
    parsed.push({ id: row.id as string, prompt: row.prompt as string, result, note: row.note });
  }
  return parsed;
}
function reviews(value: unknown): PermitReview[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const parsed: PermitReview[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const verdict = VERDICTS.find(option => option === row.verdict);
    if (!text(row.id, 64) || !verdict || !text(row.evidence, 2000)) return null;
    parsed.push({ id: row.id as string, verdict, evidence: row.evidence as string });
  }
  return parsed;
}
function signatures(value: unknown): PermitSignature[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const parsed: PermitSignature[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (!text(row.userId, 140) || !text(row.statement, 500) || !text(row.occurredAt, 40) || Number.isNaN(Date.parse(row.occurredAt as string))) return null;
    parsed.push({ userId: row.userId as string, statement: row.statement as string, occurredAt: row.occurredAt as string });
  }
  return parsed;
}
export function parseSimulationChecklist(value: unknown, expectedScope: PermitScope): PermitChecklist | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.tenantId !== expectedScope.tenantId || row.companyId !== expectedScope.companyId
    || row.unitId !== expectedScope.unitId || row.activityId !== expectedScope.activityId) return null;
  const status = STATUSES.find(option => option === row.status);
  const parsedAnswers = answers(row.answers);
  const parsedReviews = reviews(row.reviews);
  const parsedSignatures = signatures(row.signatures);
  if (typeof row.hasTst !== "boolean" || !Number.isSafeInteger(row.revision) || (row.revision as number) < 1 || (row.revision as number) > 200
    || !status || !parsedAnswers || !parsedReviews || !parsedSignatures || !Array.isArray(row.history) || row.history.length > 200) return null;
  const history: PermitChecklist["history"] = [];
  for (const event of row.history) {
    if (!event || typeof event !== "object") return null;
    const item = event as Record<string, unknown>;
    const role = ROLES.find(option => option === item.actorRole);
    const eventAnswers = answers(item.answers);
    const eventReviews = reviews(item.reviews);
    const eventSignatures = signatures(item.signatures);
    if (!Number.isSafeInteger(item.revision) || !text(item.action, 64) || !text(item.actorUserId, 140) || !role
      || !text(item.occurredAt, 40) || Number.isNaN(Date.parse(item.occurredAt as string)) || typeof item.note !== "string" || item.note.length > 2000
      || !eventAnswers || !eventReviews || !eventSignatures) return null;
    history.push({
      revision: item.revision as number, action: item.action as string, actorUserId: item.actorUserId as string, actorRole: role,
      occurredAt: item.occurredAt as string, note: item.note, answers: eventAnswers, reviews: eventReviews, signatures: eventSignatures,
    });
  }
  return { ...expectedScope, hasTst: row.hasTst, revision: row.revision as number, status, answers: parsedAnswers, reviews: parsedReviews, signatures: parsedSignatures, history };
}
export function encodeSimulation(simulation: PermitSimulation): string {
  const encoded = Buffer.from(JSON.stringify(simulation), "utf8").toString("base64url");
  if (encoded.length > 12000) throw new PermitWorkflowError("A simulação ficou grande demais. Reinicie o cenário.");
  return encoded;
}
export function decodeSimulation(encoded: string): PermitSimulation | null {
  if (!encoded || encoded.length > 12000 || /[^A-Za-z0-9_-]/.test(encoded)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (!row.scenario || typeof row.scenario !== "object") return null;
    const scenario = row.scenario as Record<string, unknown>;
    if (!text(scenario.tenantId, 140) || !text(scenario.aprId, 140) || !Number.isSafeInteger(scenario.aprRevision)
      || (scenario.aprRevision as number) < 1 || !text(scenario.companyId, 140) || !text(scenario.unitId, 140)
      || !text(scenario.supervisorWorkerId, 140)) return null;
    const scenarioScope = {
      tenantId: scenario.tenantId as string,
      aprId: scenario.aprId as string,
      aprRevision: scenario.aprRevision as number,
      companyId: scenario.companyId as string,
      unitId: scenario.unitId as string,
    };
    const activity = parseDemoActivity(scenario.activity, scenarioScope);
    if (!activity) return null;
    const typedScenario: SimulationScenario = {
      ...scenarioScope,
      activity,
      supervisorWorkerId: scenario.supervisorWorkerId as string,
    };
    const checklist = parseSimulationChecklist(row.checklist, scopeForScenario(typedScenario));
    if (!checklist) return null;
    return {
      checklist,
      scenario: typedScenario,
    };
  } catch {
    return null;
  }
}
export function createSimulation(hasTst: boolean, scenario: SimulationScenario): PermitSimulation {
  if (!text(scenario.tenantId, 140) || !text(scenario.aprId, 140) || !Number.isSafeInteger(scenario.aprRevision)
    || scenario.aprRevision < 1 || !text(scenario.companyId, 140) || !text(scenario.unitId, 140)
    || !text(scenario.supervisorWorkerId, 140) || !isDemoActivityInScope(scenario.activity, scenario)
    || !isScaffoldAssemblyAssignmentValid(scenario.activity)) {
    throw new PermitWorkflowError("Vincule o cenário a uma APR, empresa, unidade e funcionário fictício.");
  }
  return { checklist: createPermitChecklistCandidate(scopeForScenario(scenario), hasTst), scenario };
}
function actor(scope: PermitScope, role: PermitRole, userId?: string): PermitActor {
  if (role === "participant") {
    if (!userId || !PARTICIPANT_IDS.includes(userId as typeof PARTICIPANT_IDS[number])) {
      throw new PermitWorkflowError("Selecione um integrante fictício. A conta autenticada não assina neste ensaio.");
    }
    return { ...scope, role, userId };
  }
  return { ...scope, role, userId: `fictitious-${role}` };
}
export function applySimulationIntent(simulation: PermitSimulation, intent: string, fields: Record<string, string>): PermitSimulation {
  const checklist = simulation.checklist;
  const scope = scopeForScenario(simulation.scenario);
  if (!isDemoActivityInScope(simulation.scenario.activity, simulation.scenario)
    || checklist.tenantId !== scope.tenantId || checklist.companyId !== scope.companyId
    || checklist.unitId !== scope.unitId || checklist.activityId !== scope.activityId) {
    throw new PermitWorkflowError("O checklist não corresponde ao escopo da atividade vinculada.");
  }
  const note = fields.note ?? "";
  let next: PermitChecklist;
  switch (intent) {
    case "submit_leader":
    case "submit_supervisor": {
      const result = RESULTS.find(option => option === fields.result);
      if (!result) throw new PermitWorkflowError("Informe o resultado do item genérico.");
      next = transitionPermitChecklist(checklist, actor(scope, intent === "submit_leader" ? "leader" : "supervisor"), checklist.revision, {
        action: "submit",
        answers: [{ id: GENERIC_ITEM_ID, prompt: GENERIC_ITEM_PROMPT, result, note }],
      });
      break;
    }
    case "review_tst":
    case "review_supervisor": {
      const verdict = VERDICTS.find(option => option === fields.verdict);
      if (!verdict) throw new PermitWorkflowError("Informe se a NC permanece ou foi considerada corrigida nesta reavaliação.");
      next = transitionPermitChecklist(checklist, actor(scope, intent === "review_tst" ? "tst" : "supervisor"), checklist.revision, {
        action: "review", note,
        reviews: [{ id: GENERIC_ITEM_ID, verdict, evidence: fields.evidence ?? "" }],
      });
      break;
    }
    case "await_correction":
      next = transitionPermitChecklist(checklist, actor(scope, "supervisor"), checklist.revision, { action: "await_correction", note });
      break;
    case "resubmit_correction":
      next = transitionPermitChecklist(checklist, actor(scope, "supervisor"), checklist.revision, { action: "resubmit_correction", note });
      break;
    case "release_leader":
      next = transitionPermitChecklist(checklist, actor(scope, "leader"), checklist.revision, { action: "release", note });
      break;
    case "release_supervisor":
      next = transitionPermitChecklist(checklist, actor(scope, "supervisor"), checklist.revision, { action: "release", note });
      break;
    case "continue_with_nc":
      next = transitionPermitChecklist(checklist, actor(scope, "supervisor"), checklist.revision, { action: "continue_with_nc", note });
      break;
    case "sign_participation":
      next = transitionPermitChecklist(checklist, actor(scope, "participant", fields.participantId), checklist.revision, {
        action: "sign_participation",
        statement: fields.statement ?? "",
      });
      break;
    default:
      throw new PermitWorkflowError("Ação desconhecida na simulação.");
  }
  return { ...simulation, checklist: next };
}
export const STATUS_LABELS: Record<PermitChecklist["status"], string> = {
  draft: "Rascunho",
  awaiting_tst: "Aguardando reavaliação do TST",
  supervisor_decision: "Decisão de campo do supervisor",
  awaiting_correction: "Aguardando adequação",
  release_recorded: "Liberação demonstrativa registrada",
  continuation_with_nc_recorded: "Prosseguir com NC registrado",
};
