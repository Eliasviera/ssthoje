import "server-only";
import { assertTenantCapacity } from "./tenant-state";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TenantRole } from "./tenant-access";
import { DEMO_RISK_CATEGORIES, type WorkerRiskCategory } from "./worker-categories";
export type WorkerHistoryEntry = {
  id: string;
  action: "created" | "details_changed" | "status_changed";
  actorUserId: string;
  actorRole: TenantRole;
  occurredAt: string;
  fromStatus?: "active" | "archived";
  toStatus?: "active" | "archived";
  changedFields?: Array<"displayName" | "sex" | "jobTitle" | "area" | "riskCategories" | "nr35TrainingStatus" | "heightWorkSupervisionTrainingStatus" | "scaffoldingAssemblyTrainingStatus">;
};
export type WorkerSex = "Feminino" | "Masculino" | "Não informado";
export type WorkerTrainingStatus = "not_informed" | "reported_pending_validation";
export type WorkerRecord = {
  id: string;
  tenantId: string;
  companyId: string;
  unitId: string;
  displayName: string;
  sex?: WorkerSex;
  jobTitle: string;
  area?: string;
  riskCategories: WorkerRiskCategory[];
  nr35TrainingStatus: WorkerTrainingStatus;
  heightWorkSupervisionTrainingStatus: WorkerTrainingStatus;
  scaffoldingAssemblyTrainingStatus: WorkerTrainingStatus;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  history: WorkerHistoryEntry[];
};
export type NewWorkerRecord = Omit<WorkerRecord, "id" | "status" | "createdAt" | "updatedAt" | "history" | "sex" | "nr35TrainingStatus" | "heightWorkSupervisionTrainingStatus" | "scaffoldingAssemblyTrainingStatus"> & {
  sex?: WorkerSex;
  nr35TrainingStatus?: WorkerTrainingStatus;
  heightWorkSupervisionTrainingStatus?: WorkerTrainingStatus;
  scaffoldingAssemblyTrainingStatus?: WorkerTrainingStatus;
};

const WORKER_TRAINING_STATUSES: readonly WorkerTrainingStatus[] = ["not_informed", "reported_pending_validation"];
function isWorkerTrainingStatus(value: unknown): value is WorkerTrainingStatus {
  return WORKER_TRAINING_STATUSES.includes(value as WorkerTrainingStatus);
}

function getStorePath() {
  return join(process.cwd(), "data", "workers.json");
}

function readAll(): WorkerRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(getStorePath(), "utf8"));
    if (!Array.isArray(value)) throw new Error("O arquivo local de trabalhadores tem formato inválido.");
    return value as WorkerRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(workers: WorkerRecord[]) {
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(workers, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

export function listWorkersForTenant(tenantId: string): WorkerRecord[] {
  return readAll()
    .filter((worker) => worker.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((worker) => ({
      ...worker,
      nr35TrainingStatus: isWorkerTrainingStatus(worker.nr35TrainingStatus) ? worker.nr35TrainingStatus : "not_informed",
      heightWorkSupervisionTrainingStatus: isWorkerTrainingStatus(worker.heightWorkSupervisionTrainingStatus) ? worker.heightWorkSupervisionTrainingStatus : "not_informed",
      scaffoldingAssemblyTrainingStatus: isWorkerTrainingStatus(worker.scaffoldingAssemblyTrainingStatus) ? worker.scaffoldingAssemblyTrainingStatus : "not_informed",
      riskCategories: [...worker.riskCategories],
      history: worker.history.map((entry) => ({ ...entry })),
    }));
}

export function createWorkerRecord(input: NewWorkerRecord, actor: { userId: string; role: TenantRole }): WorkerRecord {
  if ((input.nr35TrainingStatus !== undefined && !isWorkerTrainingStatus(input.nr35TrainingStatus))
    || (input.heightWorkSupervisionTrainingStatus !== undefined && !isWorkerTrainingStatus(input.heightWorkSupervisionTrainingStatus))
    || (input.scaffoldingAssemblyTrainingStatus !== undefined && !isWorkerTrainingStatus(input.scaffoldingAssemblyTrainingStatus))) {
    throw new Error("Informe um estado válido para os treinamentos demonstrativos.");
  }
  const workers = readAll();
  assertTenantCapacity(input.tenantId, "workers", workers.filter(w => w.tenantId === input.tenantId && w.status === "active").length);
  const now = new Date().toISOString();
  const worker: WorkerRecord = {
    ...input,
    nr35TrainingStatus: input.nr35TrainingStatus ?? "not_informed",
    heightWorkSupervisionTrainingStatus: input.heightWorkSupervisionTrainingStatus ?? "not_informed",
    scaffoldingAssemblyTrainingStatus: input.scaffoldingAssemblyTrainingStatus ?? "not_informed",
    id: randomUUID(),
    status: "active",
    createdAt: now,
    updatedAt: now,
    history: [{ id: randomUUID(), action: "created", actorUserId: actor.userId, actorRole: actor.role, occurredAt: now }],
  };
  writeAll([...workers, worker]);
  return { ...worker, riskCategories: [...worker.riskCategories], history: worker.history.map((entry) => ({ ...entry })) };
}

export function createImportedWorkerRecords(input: {tenantId:string;companyId:string;unitId:string;workers:{displayName:string;jobTitle:string;area?:string}[];riskCategories:WorkerRiskCategory[]}, actor:{userId:string;role:TenantRole}):WorkerRecord[] {
  if(!input.workers.length||input.workers.length>200) throw new Error("Selecione de 1 a 200 colaboradores para importar.");
  if(!input.riskCategories.length||input.riskCategories.some(category=>!DEMO_RISK_CATEGORIES.includes(category))) throw new Error("Selecione categorias para revisão profissional.");
  const workers=readAll();
  const activeCount=workers.filter(worker=>worker.tenantId===input.tenantId&&worker.status==="active").length;
  input.workers.forEach((_,index)=>assertTenantCapacity(input.tenantId,"workers",activeCount+index));
  const normalize=(value:string)=>value.trim().toLocaleLowerCase("pt-BR");
  const batchKeys=new Set<string>();
  for(const candidate of input.workers) {
    const key=[input.companyId,input.unitId,normalize(candidate.displayName),normalize(candidate.jobTitle)].join("|");
    if(!candidate.displayName.trim()||candidate.displayName.length>120||!candidate.jobTitle.trim()||candidate.jobTitle.length>120||(candidate.area?.length??0)>120) throw new Error("Revise nome, função e área dos colaboradores selecionados.");
    if(batchKeys.has(key)||workers.some(worker=>worker.tenantId===input.tenantId&&worker.status==="active"&&worker.companyId===input.companyId&&worker.unitId===input.unitId&&normalize(worker.displayName)===normalize(candidate.displayName)&&normalize(worker.jobTitle)===normalize(candidate.jobTitle))) throw new Error(`Já existe um vínculo ativo duplicado para ${candidate.displayName}.`);
    batchKeys.add(key);
  }
  const now=new Date().toISOString();
  const created:WorkerRecord[]=input.workers.map(candidate=>({id:randomUUID(),tenantId:input.tenantId,companyId:input.companyId,unitId:input.unitId,displayName:candidate.displayName.trim(),jobTitle:candidate.jobTitle.trim(),area:candidate.area?.trim()||undefined,riskCategories:[...new Set(input.riskCategories)],nr35TrainingStatus:"not_informed",heightWorkSupervisionTrainingStatus:"not_informed",scaffoldingAssemblyTrainingStatus:"not_informed",status:"active",createdAt:now,updatedAt:now,history:[{id:randomUUID(),action:"created",actorUserId:actor.userId,actorRole:actor.role,occurredAt:now}]}));
  writeAll([...workers,...created]);
  return created.map(worker=>({...worker,riskCategories:[...worker.riskCategories],history:worker.history.map(entry=>({...entry}))}));
}

export function updateWorkerDetails(
  tenantId: string,
  workerId: string,
  input: Pick<WorkerRecord, "displayName" | "sex" | "jobTitle" | "area" | "riskCategories" | "nr35TrainingStatus" | "heightWorkSupervisionTrainingStatus" | "scaffoldingAssemblyTrainingStatus">,
  actor: { userId: string; role: TenantRole },
): WorkerRecord | null {
  const workers = readAll();
  const worker = workers.find((entry) => entry.id === workerId && entry.tenantId === tenantId);
  if (!worker) return null;
  if (!isWorkerTrainingStatus(input.nr35TrainingStatus) || !isWorkerTrainingStatus(input.heightWorkSupervisionTrainingStatus)
    || !isWorkerTrainingStatus(input.scaffoldingAssemblyTrainingStatus)) {
    throw new Error("Informe um estado válido para os treinamentos demonstrativos.");
  }
  const changedFields: NonNullable<WorkerHistoryEntry["changedFields"]> = [];
  if (worker.displayName !== input.displayName) changedFields.push("displayName");
  if ((worker.sex ?? "Não informado") !== (input.sex ?? "Não informado")) changedFields.push("sex");
  if (worker.jobTitle !== input.jobTitle) changedFields.push("jobTitle");
  if ((worker.area ?? "") !== (input.area ?? "")) changedFields.push("area");
  if (JSON.stringify(worker.riskCategories) !== JSON.stringify(input.riskCategories)) changedFields.push("riskCategories");
  if ((isWorkerTrainingStatus(worker.nr35TrainingStatus) ? worker.nr35TrainingStatus : "not_informed") !== input.nr35TrainingStatus) changedFields.push("nr35TrainingStatus");
  if ((isWorkerTrainingStatus(worker.heightWorkSupervisionTrainingStatus) ? worker.heightWorkSupervisionTrainingStatus : "not_informed") !== input.heightWorkSupervisionTrainingStatus) changedFields.push("heightWorkSupervisionTrainingStatus");
  if ((isWorkerTrainingStatus(worker.scaffoldingAssemblyTrainingStatus) ? worker.scaffoldingAssemblyTrainingStatus : "not_informed") !== input.scaffoldingAssemblyTrainingStatus) changedFields.push("scaffoldingAssemblyTrainingStatus");
  if (!changedFields.length) return null;

  const now = new Date().toISOString();
  worker.displayName = input.displayName;
  worker.sex = input.sex ?? "Não informado";
  worker.jobTitle = input.jobTitle;
  worker.area = input.area?.trim().slice(0, 120) || undefined;
  worker.riskCategories = [...input.riskCategories];
  worker.nr35TrainingStatus = input.nr35TrainingStatus;
  worker.heightWorkSupervisionTrainingStatus = input.heightWorkSupervisionTrainingStatus;
  worker.scaffoldingAssemblyTrainingStatus = input.scaffoldingAssemblyTrainingStatus;
  worker.updatedAt = now;
  worker.history.push({ id: randomUUID(), action: "details_changed", actorUserId: actor.userId, actorRole: actor.role, occurredAt: now, changedFields });
  writeAll(workers);
  return { ...worker, riskCategories: [...worker.riskCategories], history: worker.history.map((entry) => ({ ...entry })) };
}

export function setWorkerStatus(tenantId: string, workerId: string, status: WorkerRecord["status"], actor: { userId: string; role: TenantRole }): WorkerRecord | null {
  const workers = readAll();
  const worker = workers.find((entry) => entry.id === workerId && entry.tenantId === tenantId);
  if (!worker || worker.status === status) return null;
  if (status === "active") assertTenantCapacity(tenantId, "workers", workers.filter(w => w.tenantId === tenantId && w.status === "active").length);
  const now = new Date().toISOString();
  const fromStatus = worker.status;
  worker.status = status;
  worker.updatedAt = now;
  worker.history.push({
    id: randomUUID(), action: "status_changed", actorUserId: actor.userId, actorRole: actor.role,
    occurredAt: now, fromStatus, toStatus: status,
  });
  writeAll(workers);
  return { ...worker, riskCategories: [...worker.riskCategories], history: worker.history.map((entry) => ({ ...entry })) };
}
