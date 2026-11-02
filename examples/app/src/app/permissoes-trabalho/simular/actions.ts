"use server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { PermitWorkflowError } from "@/lib/work-permit-checklist-workflow";
import { listClientCompanies } from "@/lib/client-service";
import { listSafetyAprs } from "@/lib/safety-operations-store";
import { listWorkersForTenant } from "@/lib/worker-store";
import { applySimulationIntent, createDemoActivityReference, createSimulation, decodeSimulation, encodeSimulation, isDemoActivityCompatible, isDemoAprCompatible, isDemoWorkerInScope, isScaffoldAssemblyAssignmentValid } from "@/lib/work-permit-simulation-state";

function simulationPath(encoded = "", error = "", aprId = "") {
  const params = new URLSearchParams();
  if (encoded) params.set("s", encoded);
  if (error) params.set("erro", error.slice(0, 280));
  if (aprId) params.set("apr", aprId);
  const query = params.toString();
  return query ? `/permissoes-trabalho/simular?${query}` : "/permissoes-trabalho/simular";
}
function field(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}
function fields(data: FormData, key: string) {
  const values = data.getAll(key);
  if (values.some(value => typeof value !== "string")) throw new PermitWorkflowError(`O campo ${key} contém valor inválido.`);
  return values as string[];
}
async function requireActiveCompanyUnit(tenantId: string, companyId: string, unitId: string) {
  const company = (await listClientCompanies(tenantId)).find(entry =>
    entry.id === companyId && entry.tenantId === tenantId && entry.status === "active",
  );
  const unit = company?.units.find(entry => entry.id === unitId);
  if (!company || !unit) throw new PermitWorkflowError("Selecione uma empresa e unidade ativas da consultoria atual.");
  return { company, unit };
}
async function requireDemoApr(tenantId: string, aprId: string, revision?: number) {
  const apr = listSafetyAprs(tenantId).find(entry => entry.id === aprId
    && isDemoAprCompatible(entry, {
      tenantId,
      companyId: entry.companyId,
      unitId: entry.unitId,
      aprId,
      ...(revision === undefined ? {} : { revision }),
    }));
  if (!apr) {
    throw new PermitWorkflowError("A APR selecionada não está mais disponível nesta revisão. Escolha a APR atual e reinicie o cenário.");
  }
  await requireActiveCompanyUnit(tenantId, apr.companyId, apr.unitId);
  return apr;
}
async function requireCompatibleWorker(role: string, tenantId: string, companyId: string, unitId: string, workerId: string) {
  if (!hasTenantPermission(role, "workers.read")) {
    throw new PermitWorkflowError("Seu perfil não tem permissão para consultar funcionários.");
  }
  await requireActiveCompanyUnit(tenantId, companyId, unitId);
  const worker = listWorkersForTenant(tenantId).find(entry =>
    entry.id === workerId && isDemoWorkerInScope(entry, { tenantId, companyId, unitId }),
  );
  if (!worker) throw new PermitWorkflowError("Selecione um funcionário fictício ativo da empresa e unidade escolhidas.");
  return worker;
}
async function requireCompatibleWorkers(role: string, tenantId: string, companyId: string, unitId: string, workerIds: string[]) {
  if (!workerIds.length) return [];
  if (!hasTenantPermission(role, "workers.read")) {
    throw new PermitWorkflowError("Seu perfil não tem permissão para consultar funcionários.");
  }
  if (new Set(workerIds).size !== workerIds.length || workerIds.some(id => !id || id.length > 140)) {
    throw new PermitWorkflowError("A lista de montadores/desmontadores tem identificadores duplicados ou inválidos.");
  }
  await requireActiveCompanyUnit(tenantId, companyId, unitId);
  const workers = listWorkersForTenant(tenantId);
  const selected = workerIds.map(workerId => workers.find(entry =>
    entry.id === workerId && isDemoWorkerInScope(entry, { tenantId, companyId, unitId }),
  ));
  if (selected.some(worker => !worker)) {
    throw new PermitWorkflowError("Selecione somente funcionários fictícios ativos da empresa e unidade escolhidas para a tarefa de montagem/desmontagem.");
  }
  return selected;
}
export async function simulatePermitAction(data: FormData) {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const intent = field(data, "intent");
  const encoded = field(data, "state");
  if (intent === "reset") redirect("/permissoes-trabalho/simular");
  try {
    if (intent === "choose_apr") {
      const aprId = field(data, "aprId");
      const apr = await requireDemoApr(access.context.tenant.id, aprId);
      redirect(simulationPath("", "", apr.id));
    }
    if (intent === "start") {
      const hasTst = field(data, "hasTst");
      if (hasTst !== "yes" && hasTst !== "no") throw new PermitWorkflowError("Informe se o cenário possui TST disponível.");
      const scaffoldUseStatus = field(data, "scaffoldUseStatus");
      if (scaffoldUseStatus !== "not_informed" && scaffoldUseStatus !== "used" && scaffoldUseStatus !== "not_used") {
        throw new PermitWorkflowError("Informe separadamente se a atividade utilizará andaime.");
      }
      const scaffoldAssemblyStatus = field(data, "scaffoldAssemblyStatus");
      if (scaffoldAssemblyStatus !== "not_informed" && scaffoldAssemblyStatus !== "included" && scaffoldAssemblyStatus !== "not_included") {
        throw new PermitWorkflowError("Informe se a atividade inclui montagem/desmontagem de andaime.");
      }
      const scaffoldAssemblerWorkerIds = fields(data, "scaffoldAssemblerWorkerId");
      if (!isScaffoldAssemblyAssignmentValid({ scaffoldUseStatus, scaffoldAssemblyStatus, scaffoldAssemblerWorkerIds })) {
        throw new PermitWorkflowError("Se a atividade inclui montagem/desmontagem, informe uso de andaime e selecione os trabalhadores designados. Caso contrário, não selecione montadores.");
      }
      const aprId = field(data, "aprId");
      const aprRevision = Number(field(data, "aprRevision"));
      if (!Number.isSafeInteger(aprRevision)) throw new PermitWorkflowError("A revisão da APR está inválida. Escolha novamente.");
      const apr = await requireDemoApr(access.context.tenant.id, aprId, aprRevision);
      const supervisorWorkerId = field(data, "supervisorWorkerId");
      await requireCompatibleWorker(access.context.membership.role, access.context.tenant.id, apr.companyId, apr.unitId, supervisorWorkerId);
      await requireCompatibleWorkers(access.context.membership.role, access.context.tenant.id, apr.companyId, apr.unitId, scaffoldAssemblerWorkerIds);
      redirect(simulationPath(encodeSimulation(createSimulation(hasTst === "yes", {
        tenantId: access.context.tenant.id,
        aprId: apr.id,
        aprRevision: apr.revision,
        companyId: apr.companyId,
        unitId: apr.unitId,
        activity: createDemoActivityReference({
          tenantId: access.context.tenant.id,
          aprId: apr.id,
          aprRevision: apr.revision,
          companyId: apr.companyId,
          unitId: apr.unitId,
          activityStage: apr.activityStage,
          workArea: apr.workArea,
          scaffoldUseStatus,
          scaffoldAssemblyStatus,
          scaffoldAssemblerWorkerIds,
        }),
        supervisorWorkerId,
      }))));
    }
    const simulation = decodeSimulation(encoded);
    if (!simulation) throw new PermitWorkflowError("A simulação está inválida ou incompleta. Reinicie o cenário.");
    if (simulation.scenario.tenantId !== access.context.tenant.id) throw new PermitWorkflowError("Esta simulação pertence a outro escopo. Reinicie o cenário.");
    const apr = await requireDemoApr(access.context.tenant.id, simulation.scenario.aprId, simulation.scenario.aprRevision);
    if (apr.companyId !== simulation.scenario.companyId || apr.unitId !== simulation.scenario.unitId) {
      throw new PermitWorkflowError("O escopo da APR mudou. Reinicie a simulação pela APR atual.");
    }
    if (!isDemoActivityCompatible(simulation.scenario.activity, {
      tenantId: apr.tenantId,
      aprId: apr.id,
      aprRevision: apr.revision,
      companyId: apr.companyId,
      unitId: apr.unitId,
      activityStage: apr.activityStage,
      workArea: apr.workArea,
      scaffoldUseStatus: simulation.scenario.activity.scaffoldUseStatus,
      scaffoldAssemblyStatus: simulation.scenario.activity.scaffoldAssemblyStatus,
      scaffoldAssemblerWorkerIds: simulation.scenario.activity.scaffoldAssemblerWorkerIds,
    })) {
      throw new PermitWorkflowError("A descrição da atividade diverge da APR vinculada. Reinicie pela revisão atual.");
    }
    await requireCompatibleWorker(
      access.context.membership.role,
      access.context.tenant.id,
      simulation.scenario.companyId,
      simulation.scenario.unitId,
      simulation.scenario.supervisorWorkerId,
    );
    await requireCompatibleWorkers(
      access.context.membership.role,
      access.context.tenant.id,
      simulation.scenario.companyId,
      simulation.scenario.unitId,
      simulation.scenario.activity.scaffoldAssemblerWorkerIds,
    );
    const next = applySimulationIntent(simulation, intent, {
      result: field(data, "result"),
      note: field(data, "note"),
      verdict: field(data, "verdict"),
      evidence: field(data, "evidence"),
      participantId: field(data, "participantId"),
      statement: field(data, "statement"),
    });
    redirect(simulationPath(encodeSimulation(next)));
  } catch (error) {
    if (error instanceof PermitWorkflowError) redirect(simulationPath(
      encoded, error.message, field(data, "aprId"),
    ));
    throw error;
  }
}
