"use server";

import { revalidatePath } from "next/cache";
import { appendAuditEvent } from "@/lib/audit-log";
import { listClientCompanies } from "@/lib/client-service";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { createImportedWorkerRecords, createWorkerRecord, listWorkersForTenant, setWorkerStatus, updateWorkerDetails, type WorkerTrainingStatus } from "@/lib/worker-store";
import { DEMO_RISK_CATEGORIES } from "@/lib/worker-categories";
import { TenantCapacityError } from "@/lib/tenant-state";

export type WorkerFormState = { error?: string; success?: string };

function revalidateWorkerViews() {
  revalidatePath("/");
  revalidatePath("/trabalhadores");
  revalidatePath("/empresas/[companyId]", "page");
}

function getText(formData: FormData, name: string, maxLength: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function getWorkerTrainingStatus(formData: FormData, name: string): WorkerTrainingStatus | null {
  const value = formData.get(name);
  return value === "not_informed" || value === "reported_pending_validation" ? value : null;
}

export async function createWorkerAction(_previousState: WorkerFormState, formData: FormData): Promise<WorkerFormState> {
  const access = await getCurrentTenantAccess("workers.manage");
  if (!access.authenticated || !access.context) return { error: "Sua conta não tem permissão para cadastrar trabalhadores." };

  const displayName = getText(formData, "displayName", 120);
  const sex = getText(formData, "sex", 24);
  const jobTitle = getText(formData, "jobTitle", 120);
  const area = getText(formData, "area", 120);
  const companyId = getText(formData, "companyId", 64);
  const unitId = getText(formData, "unitId", 64);
  const riskCategories = formData.getAll("riskCategory").filter((value): value is string => typeof value === "string");
  const nr35TrainingStatus = getWorkerTrainingStatus(formData, "nr35TrainingStatus");
  const heightWorkSupervisionTrainingStatus = getWorkerTrainingStatus(formData, "heightWorkSupervisionTrainingStatus");
  const scaffoldingAssemblyTrainingStatus = getWorkerTrainingStatus(formData, "scaffoldingAssemblyTrainingStatus");

  if (!displayName || !jobTitle) return { error: "Informe o nome fictício e a função." };
  if (!["Feminino", "Masculino", "Não informado"].includes(sex)) return { error: "Selecione uma opção de sexo demonstrativo." };
  if (!nr35TrainingStatus || !heightWorkSupervisionTrainingStatus || !scaffoldingAssemblyTrainingStatus) return { error: "Informe separadamente os estados dos treinamentos demonstrativos." };
  if (!companyId || !unitId) return { error: "Selecione uma empresa e uma unidade ativas." };
  if (!riskCategories.length || riskCategories.length > DEMO_RISK_CATEGORIES.length
    || riskCategories.some((category) => !DEMO_RISK_CATEGORIES.includes(category as (typeof DEMO_RISK_CATEGORIES)[number]))) {
    return { error: "Selecione ao menos uma categoria de risco da lista." };
  }

  const company = (await listClientCompanies(access.context.tenant.id)).find((entry) => entry.id === companyId && entry.status === "active");
  const unit = company?.units.find((entry) => entry.id === unitId);
  if (!company || !unit) return { error: "A empresa ou unidade selecionada não está disponível nesta consultoria." };
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  const duplicate = listWorkersForTenant(access.context.tenant.id).some((worker) => worker.status === "active"
    && worker.companyId === companyId
    && worker.unitId === unitId
    && normalize(worker.displayName) === normalize(displayName)
    && normalize(worker.jobTitle) === normalize(jobTitle));
  if (duplicate) return { error: "Já existe um vínculo ativo com esse mesmo nome, função e unidade. Use uma identificação fictícia diferente para cadastrar outra pessoa." };

  try { createWorkerRecord({
    tenantId: access.context.tenant.id,
    companyId,
    unitId,
    displayName,
    sex: sex as "Feminino" | "Masculino" | "Não informado",
    jobTitle,
    area,
    riskCategories: [...new Set(riskCategories)] as (typeof DEMO_RISK_CATEGORIES)[number][],
    nr35TrainingStatus,
    heightWorkSupervisionTrainingStatus,
    scaffoldingAssemblyTrainingStatus,
  }, { userId: access.session.userId, role: access.context.membership.role });
  } catch (error) { if (error instanceof TenantCapacityError) return { error: error.message }; throw error; }
  appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "worker.created" });
  revalidateWorkerViews();
  return { success: "Cadastro de demonstração salvo neste computador." };
}

export async function importWorkersAction(_previousState:WorkerFormState,formData:FormData):Promise<WorkerFormState> {
  const access=await getCurrentTenantAccess("workers.manage");
  if(!access.authenticated||!access.context) return {error:"Sua conta não tem permissão para importar colaboradores."};
  try {
    const companyId=getText(formData,"companyId",64),unitId=getText(formData,"unitId",64),raw=getText(formData,"workersJson",100000);
    const categories=formData.getAll("riskCategory").filter((value):value is string=>typeof value==="string");
    if(!companyId||!unitId) return {error:"Selecione empresa e unidade para os colaboradores importados."};
    if(!categories.length||categories.some(category=>!DEMO_RISK_CATEGORIES.includes(category as (typeof DEMO_RISK_CATEGORIES)[number]))) return {error:"Selecione as categorias a revisar; elas serão aplicadas aos colaboradores importados."};
    let parsed:unknown;
    try {parsed=JSON.parse(raw);} catch {return {error:"A prévia da lista não está válida. Importe o PDF novamente."};}
    if(!Array.isArray(parsed)||!parsed.length||parsed.length>200) return {error:"Selecione de 1 a 200 colaboradores."};
    const company=(await listClientCompanies(access.context.tenant.id)).find(entry=>entry.id===companyId&&entry.status==="active");
    if(!company?.units.some(unit=>unit.id===unitId)) return {error:"Empresa ou unidade indisponível nesta consultoria."};
    const candidates=parsed.map((row)=>{
      if(!row||typeof row!=="object") throw new Error("Revise os dados selecionados na prévia.");
      const value=row as Record<string,unknown>;
      if(typeof value.name!=="string"||typeof value.role!=="string"||typeof value.department!=="string") throw new Error("Revise nome, função e área na prévia.");
      return {displayName:value.name.trim().slice(0,120),jobTitle:value.role.trim().slice(0,120),area:value.department.trim().slice(0,120)||undefined};
    });
    const created=createImportedWorkerRecords({tenantId:access.context.tenant.id,companyId,unitId,workers:candidates,riskCategories:categories as (typeof DEMO_RISK_CATEGORIES)[number][]},{userId:access.session.userId,role:access.context.membership.role});
    for(const worker of created) appendAuditEvent({tenantId:access.context.tenant.id,actorUserId:access.session.userId,actorRole:access.context.membership.role,action:"worker.created",targetId:worker.id});
    revalidateWorkerViews();
    return {success:`${created.length} colaborador(es) importado(s). Funções, áreas e categorias continuam disponíveis para conferência e edição.`};
  } catch(error) {if(error instanceof TenantCapacityError)return {error:error.message};return {error:error instanceof Error?error.message:"Não foi possível importar os colaboradores."};}
}

export async function setWorkerStatusAction(_previous: WorkerFormState, formData: FormData): Promise<WorkerFormState> {
  const access = await getCurrentTenantAccess("workers.manage");
  if (!access.authenticated || !access.context) return { error: "Acesso indisponível. Entre novamente ou procure o suporte." };
  const id = getText(formData, "workerId", 64), status = getText(formData, "status", 16);
  if (!id || (status !== "active" && status !== "archived")) return { error: "Confira o cadastro e o estado informado." };
  try {
    const changed = setWorkerStatus(access.context.tenant.id, id, status, { userId: access.session.userId, role: access.context.membership.role });
    if (!changed) return { error: "Cadastro indisponível ou sem alteração." };
    appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "worker.status_changed" });
    revalidateWorkerViews(); return { success: "Situação atualizada." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível atualizar. Tente novamente." }; }
}

export async function updateWorkerAction(_previousState: WorkerFormState, formData: FormData): Promise<WorkerFormState> {
  const access = await getCurrentTenantAccess("workers.manage");
  if (!access.authenticated || !access.context) return { error: "Sua conta não tem permissão para alterar trabalhadores." };
  const workerId = getText(formData, "workerId", 64);
  const displayName = getText(formData, "displayName", 120);
  const sex = getText(formData, "sex", 24);
  const jobTitle = getText(formData, "jobTitle", 120);
  const area = getText(formData, "area", 120);
  const submittedRisks = formData.getAll("riskCategory").filter((value): value is string => typeof value === "string");
  const nr35TrainingStatus = getWorkerTrainingStatus(formData, "nr35TrainingStatus");
  const heightWorkSupervisionTrainingStatus = getWorkerTrainingStatus(formData, "heightWorkSupervisionTrainingStatus");
  const scaffoldingAssemblyTrainingStatus = getWorkerTrainingStatus(formData, "scaffoldingAssemblyTrainingStatus");
  if (!workerId || !displayName || !jobTitle) return { error: "Informe a identificação fictícia e a função." };
  if (!["Feminino", "Masculino", "Não informado"].includes(sex)) return { error: "Selecione uma opção de sexo demonstrativo." };
  if (!nr35TrainingStatus || !heightWorkSupervisionTrainingStatus || !scaffoldingAssemblyTrainingStatus) return { error: "Informe separadamente os estados dos treinamentos demonstrativos." };
  if (!submittedRisks.length || submittedRisks.length > DEMO_RISK_CATEGORIES.length
    || submittedRisks.some((category) => !DEMO_RISK_CATEGORIES.includes(category as (typeof DEMO_RISK_CATEGORIES)[number]))) {
    return { error: "Selecione ao menos uma categoria de risco da lista." };
  }
  const updated = updateWorkerDetails(access.context.tenant.id, workerId, {
    displayName,
    sex: sex as "Feminino" | "Masculino" | "Não informado",
    jobTitle,
    area,
    riskCategories: [...new Set(submittedRisks)] as (typeof DEMO_RISK_CATEGORIES)[number][],
    nr35TrainingStatus,
    heightWorkSupervisionTrainingStatus,
    scaffoldingAssemblyTrainingStatus,
  }, { userId: access.session.userId, role: access.context.membership.role });
  if (!updated) return { success: "Nenhuma alteração foi necessária." };
  appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "worker.updated" });
  revalidateWorkerViews();
  return { success: "Cadastro e estados demonstrativos de treinamento atualizados; a alteração entrou no histórico." };
}
