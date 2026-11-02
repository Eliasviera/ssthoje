"use server";

import { revalidatePath } from "next/cache";
import { appendAuditEvent } from "@/lib/audit-log";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listPgrInventoriesPostgres } from "@/lib/pgr-postgres-store";
import { getPgrStorageMode } from "@/lib/pgr-storage-mode";
import { selectApprovedPgrRisks } from "@/lib/safety-apr-pgr-selection";
import { WORK_PERMIT_SOURCE_FIELD_MAPS } from "@/lib/work-permit-source-field-maps";
import { createWorkPermitDraft, updateWorkPermitDraft } from "@/lib/work-permit-draft-store";
import {
  createSafetyApr,
  createSafetyChecklistTemplate,
  activateSafetyChecklistTemplate,
  listSafetyAprs,
  saveSafetyAprAnswers,
  submitSafetyAprForReview,
  type AprChecklistAnswer,
  SafetyOperationsValidationError,
} from "@/lib/safety-operations-store";
import {
  createRiskAnalysis,
  issueRiskAnalysis,
  RiskAnalysisValidationError,
  saveRiskAnalysisDraft,
  type RiskAnalysisFields,
} from "@/lib/risk-analysis-store";
import { listClientCompanies } from "@/lib/client-service";

export type SafetyOperationsFormState = { error?: string; success?: string };

export async function saveWorkPermitDraftAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Entre em uma conta autorizada para salvar um rascunho." };

  const mapId = text(data, "mapId", 80);
  const source = WORK_PERMIT_SOURCE_FIELD_MAPS.find((item) => item.id === mapId);
  if (!source) return { error: "Selecione um modelo PT/PTE disponível." };
  const title = text(data, "title", 160);
  if (!title) return { error: "Informe um título para identificar o rascunho." };

  const allowedKeys = new Set(source.sections.flatMap((section) => section.fields.map((field) => `${section.id}.${field.id}`)));
  const values: Record<string, string> = {};
  for (const [name, value] of data.entries()) {
    if (!name.startsWith("field.")) continue;
    if (typeof value !== "string") return { error: "Um campo enviado é inválido. Envie somente texto nos campos do rascunho." };
    const key = name.slice("field.".length);
    if (!allowedKeys.has(key) || value.length > 3000) return { error: "Um campo enviado é inválido ou excede o limite de texto." };
    values[key] = value.trim();
  }
  if (!Object.values(values).some(Boolean)) return { error: "Preencha ao menos um campo antes de salvar o rascunho." };
  const rawAprId = data.get("aprId");
  if (rawAprId !== null && (typeof rawAprId !== "string" || rawAprId.length > 36)) {
    return { error: "O identificador da APR é inválido. Selecione novamente a APR de referência." };
  }
  const aprId = text(data, "aprId", 36);
  if (aprId && !listSafetyAprs(access.context.tenant.id).some((apr) => apr.id === aprId)) {
    return { error: "A APR selecionada não está disponível nesta consultoria." };
  }
  const rawDraftId = data.get("draftId");
  if (rawDraftId !== null && (typeof rawDraftId !== "string" || rawDraftId.length > 36)) {
    return { error: "O identificador do rascunho é inválido. Atualize a página." };
  }
  const draftId = text(data, "draftId", 36);
  const expectedRevision = positiveInteger(text(data, "draftRevision", 10));
  if (draftId && !expectedRevision) return { error: "A versão do rascunho não foi informada. Reabra o rascunho antes de salvar." };

  try {
    const draft = draftId
      ? await updateWorkPermitDraft(access.context.tenant.id, draftId, { mapId: source.id, aprId: aprId || undefined, title, values, updatedBy: access.session.userId, expectedRevision: expectedRevision! })
      : await createWorkPermitDraft({ tenantId: access.context.tenant.id, mapId: source.id, aprId: aprId || undefined, title, values, createdBy: access.session.userId });
    if (!draft) return { error: "O rascunho mudou desde que foi aberto ou não está disponível nesta consultoria. Reabra a versão atual antes de salvar." };
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.work_permit_draft_saved",
      targetId: draft.id,
    });
    revalidatePath("/permissoes-trabalho");
    return { success: `${draftId ? "Rascunho atualizado" : "Rascunho demonstrativo salvo"}. Ele não libera nem autoriza a atividade.` };
  } catch (error) {
    return { error: report(error, "Não foi possível salvar o rascunho PT/PTE.") };
  }
}

function text(data: FormData, name: string, max: number) {
  const value = data.get(name);
  return typeof value === "string" && value.length <= max ? value.trim() : "";
}

function positiveInteger(value: string) {
  if (!/^[1-9]\d{0,9}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function textList(data: FormData, name: string): string[] {
  return data.getAll(name).map((value) => typeof value === "string" ? value.trim() : "");
}

function report(error: unknown, fallback: string) {
  if (error instanceof SafetyOperationsValidationError) return error.message;
  if (error instanceof RiskAnalysisValidationError) return error.message;
  console.error("Operação de APR/checklist não concluída.", error instanceof Error ? error.name : "unknown");
  return fallback;
}

function getRiskAnalysisFields(data: FormData): RiskAnalysisFields {
  return {
    title: text(data, "title", 140),
    activity: text(data, "activity", 1000),
    workArea: text(data, "workArea", 1000),
    assessment: text(data, "assessment", 5000),
    controls: text(data, "controls", 5000),
    responsibleName: text(data, "responsibleName", 120),
  };
}

async function validateRiskAnalysisScope(tenantId: string, companyId: string, unitId: string) {
  const companies = await listClientCompanies(tenantId);
  return companies.some((company) => company.id === companyId && company.status === "active"
    && company.units.some((unit) => unit.id === unitId));
}

export async function createRiskAnalysisAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("safety.risk_analysis.manage");
  if (!access.authenticated || !access.context) return { error: "Somente o perfil Profissional SST pode criar uma AR." };
  const companyId = text(data, "companyId", 140);
  const unitId = text(data, "unitId", 140);
  if (!companyId || !unitId || !(await validateRiskAnalysisScope(access.context.tenant.id, companyId, unitId))) {
    return { error: "Selecione uma empresa/unidade ativa desta consultoria." };
  }
  try {
    const record = createRiskAnalysis({
      tenantId: access.context.tenant.id,
      companyId,
      unitId,
      ...getRiskAnalysisFields(data),
      createdBy: access.session.userId,
    });
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.risk_analysis_created",
      targetId: record.id,
    });
    revalidatePath("/");
    return { success: "Rascunho de AR criado. Revise a avaliação e emita somente quando estiver concluída." };
  } catch (error) {
    return { error: report(error, "Não foi possível criar a AR.") };
  }
}

export async function saveRiskAnalysisDraftAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("safety.risk_analysis.manage");
  if (!access.authenticated || !access.context) return { error: "Somente o perfil Profissional SST pode editar a AR." };
  const recordId = text(data, "recordId", 36);
  const expectedRevision = positiveInteger(text(data, "expectedRevision", 10));
  if (!recordId || !expectedRevision) return { error: "Atualize a AR e confira sua revisão." };
  try {
    const record = saveRiskAnalysisDraft(
      access.context.tenant.id,
      recordId,
      expectedRevision,
      getRiskAnalysisFields(data),
      access.session.userId,
    );
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.risk_analysis_saved",
      targetId: record.id,
    });
    revalidatePath("/");
    return { success: `Rascunho de AR salvo na revisão ${record.revision}.` };
  } catch (error) {
    return { error: report(error, "Não foi possível salvar o rascunho da AR.") };
  }
}

export async function issueRiskAnalysisAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("safety.risk_analysis.manage");
  if (!access.authenticated || !access.context) return { error: "Somente o perfil Profissional SST pode emitir a AR." };
  const recordId = text(data, "recordId", 36);
  const expectedRevision = positiveInteger(text(data, "expectedRevision", 10));
  if (!recordId || !expectedRevision || data.get("confirmIssue") !== "yes") {
    return { error: "Confirme a emissão e atualize a revisão da AR." };
  }
  try {
    const record = issueRiskAnalysis(access.context.tenant.id, recordId, expectedRevision, access.session.userId);
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.risk_analysis_issued",
      targetId: record.id,
    });
    revalidatePath("/");
    return { success: `AR emitida na revisão ${record.revision}. O documento foi registrado como decisão do profissional identificado; o sistema não verifica habilitação profissional.` };
  } catch (error) {
    return { error: report(error, "Não foi possível emitir a AR.") };
  }
}

export async function createSafetyChecklistTemplateAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode configurar modelos de checklist." };

  const title = text(data, "title", 140);
  const activity = text(data, "activity", 300);
  const activityKind = text(data, "activityKind", 40);
  if (activityKind !== "general_activity" && activityKind !== "confined_space_nr33") {
    return { error: "Selecione a categoria do modelo de checklist." };
  }
  const prompts = text(data, "prompts", 16000).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const sourceTitle = text(data, "referenceTitle", 180);
  const referenceVersion = text(data, "referenceVersion", 80);
  const jurisdiction = text(data, "jurisdiction", 100);
  const validFrom = text(data, "validFrom", 10);
  const validUntil = text(data, "validUntil", 10);
  const reviewer = text(data, "reviewer", 120);
  const referenceValues = [sourceTitle, referenceVersion, jurisdiction, validFrom, validUntil, reviewer];
  const hasReference = referenceValues.some(Boolean);
  if (hasReference && [sourceTitle, referenceVersion, jurisdiction, validFrom, reviewer].some((value) => !value)) {
    return { error: "Para registrar uma referência, preencha fonte, versão, jurisdição, início da vigência e responsável pela revisão." };
  }

  try {
    const template = createSafetyChecklistTemplate({
      tenantId: access.context.tenant.id,
      activityKind,
      title,
      activity,
      prompts,
      previousTemplateId: text(data, "previousTemplateId", 36),
      ...(hasReference ? { reference: { title: sourceTitle, version: referenceVersion, jurisdiction, validFrom, validUntil, reviewer } } : {}),
      createdBy: access.session.userId,
    });
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.checklist_draft_created",
      targetId: template.id,
    });
    revalidatePath("/");
    return { success: `Rascunho de checklist versão ${template.version} salvo. Ele não pode ser usado em APR até revisão humana e ativação.` };
  } catch (error) {
    return { error: report(error, "Não foi possível salvar o modelo de checklist.") };
  }
}

export async function activateSafetyChecklistTemplateAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode revisar modelos de checklist." };
  if (data.get("confirmReview") !== "yes") return { error: "Confirme a revisão humana dos itens antes de ativar o modelo." };
  const templateId = text(data, "templateId", 36);
  if (!templateId) return { error: "Selecione o modelo que será revisado." };
  try {
    const template = activateSafetyChecklistTemplate(access.context.tenant.id, templateId, access.session.userId);
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.checklist_activated",
      targetId: template.id,
    });
    revalidatePath("/");
    return { success: `Modelo versão ${template.version} ativado após revisão humana registrada. A qualificação técnica do revisor não é verificada pelo sistema.` };
  } catch (error) {
    return { error: report(error, "Não foi possível ativar o modelo de checklist.") };
  }
}

export async function createSafetyAprAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode criar APR nesta consultoria." };
  if (getPgrStorageMode() !== "postgres") {
    return { error: "Para criar a APR, primeiro use um inventário de riscos estruturado, aprovado e disponível no PostgreSQL." };
  }

  const tenantId = access.context.tenant.id;
  const inventoryId = text(data, "pgrInventoryId", 36);
  const companyId = text(data, "companyId", 140);
  const unitId = text(data, "unitId", 140);
  const selectedRiskIds = data.getAll("riskIds");
  const templateId = text(data, "templateId", 36);
  const templateVersion = positiveInteger(text(data, "templateVersion", 10));
  const additionalHazards = textList(data, "additionalRiskHazard");
  const additionalHarms = textList(data, "additionalRiskHarm");
  const additionalBases = textList(data, "additionalRiskBasis");
  const additionalRiskControls = textList(data, "additionalRiskControls");
  const additionalPgrControlRiskIds = textList(data, "additionalPgrControlRiskId");
  const additionalPgrControlDescriptions = textList(data, "additionalPgrControlDescription");
  if (!inventoryId || !companyId || !unitId || !templateId || !templateVersion
    || selectedRiskIds.length < 1 || selectedRiskIds.length > 100
    || selectedRiskIds.some((id) => typeof id !== "string" || !id.trim())
    || new Set(selectedRiskIds).size !== selectedRiskIds.length) {
    return { error: "Selecione um PGR aprovado, ao menos um risco e um modelo de checklist ativo." };
  }

  try {
    const inventories = await listPgrInventoriesPostgres(tenantId);
    const selection = selectApprovedPgrRisks(inventories, {
      tenantId,
      inventoryId,
      companyId,
      unitId,
      riskIds: selectedRiskIds.filter((id): id is string => typeof id === "string"),
    });
    if (!selection) return { error: "O PGR aprovado e os riscos selecionados não estão disponíveis neste escopo. Atualize a página." };
    const { inventory, risks: selectedRisks } = selection;

    const apr = createSafetyApr({
      tenantId,
      title: text(data, "title", 140),
      companyId,
      unitId,
      activityStage: text(data, "activityStage", 1000),
      workArea: text(data, "workArea", 500),
      responsible: text(data, "responsible", 120),
      pgrInventoryId: inventory.id,
      pgrRevision: inventory.inventory.revision,
      pgrTitle: inventory.inventory.title,
      risks: selectedRisks.map((risk) => ({
        inventoryId: inventory.id,
        inventoryRevision: inventory.inventory.revision,
        riskId: risk.id,
        activity: risk.activity,
        hazard: risk.hazard,
        possibleHarm: risk.possibleHarm,
        exposureDescription: risk.exposureDescription,
      })),
      additionalRisks: additionalHazards.map((hazard, index) => ({
        hazard,
        possibleHarm: additionalHarms[index] ?? "",
        identificationBasis: additionalBases[index] ?? "",
        controls: (additionalRiskControls[index] ?? "").split(/\r?\n/).map((control) => control.trim()).filter(Boolean),
      })).filter((risk) => risk.hazard || risk.possibleHarm || risk.identificationBasis || risk.controls.length),
      additionalPgrControls: additionalPgrControlRiskIds.map((riskId, index) => ({
        riskId,
        description: additionalPgrControlDescriptions[index] ?? "",
      })).filter((control) => control.riskId || control.description),
      checklistTemplateId: templateId,
      checklistTemplateVersion: templateVersion,
      createdBy: access.session.userId,
    });
    appendAuditEvent({
      tenantId,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.apr_created",
      targetId: apr.id,
    });
    revalidatePath("/");
    return { success: "APR criada como rascunho. Ela não libera atividade nem substitui a revisão responsável." };
  } catch (error) {
    return { error: report(error, "Não foi possível criar a APR.") };
  }
}

export async function saveSafetyAprAnswersAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode editar esta APR." };
  const aprId = text(data, "aprId", 36);
  const expectedRevision = positiveInteger(text(data, "expectedRevision", 10));
  if (!aprId || !expectedRevision) return { error: "Atualize a APR e confira sua revisão." };
  const tenantId = access.context.tenant.id;
  const apr = listSafetyAprs(tenantId).find((item) => item.id === aprId);
  if (!apr) return { error: "A APR não está disponível nesta consultoria." };
  const answers: AprChecklistAnswer[] = [];
  for (const answer of apr.answers) {
    const result = text(data, `result_${answer.id}`, 24);
    if (!["unanswered", "observed", "attention", "not_applicable"].includes(result)) {
      return { error: "Uma resposta do checklist é inválida. Atualize a página e tente novamente." };
    }
    answers.push({
      id: answer.id,
      prompt: answer.prompt,
      result: result as AprChecklistAnswer["result"],
      notes: text(data, `notes_${answer.id}`, 1200),
      nextStep: text(data, `nextStep_${answer.id}`, 600),
      responsible: text(data, `responsible_${answer.id}`, 120),
    });
  }
  try {
    const saved = saveSafetyAprAnswers(tenantId, aprId, expectedRevision, answers, access.session.userId);
    appendAuditEvent({
      tenantId,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.apr_saved",
      targetId: saved.id,
    });
    revalidatePath("/");
    return { success: `Respostas salvas na revisão ${saved.revision}.` };
  } catch (error) {
    return { error: report(error, "Não foi possível salvar as respostas da APR.") };
  }
}

export async function submitSafetyAprForReviewAction(
  _previous: SafetyOperationsFormState,
  data: FormData,
): Promise<SafetyOperationsFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Seu perfil não pode enviar esta APR para revisão." };
  const aprId = text(data, "aprId", 36);
  const expectedRevision = positiveInteger(text(data, "expectedRevision", 10));
  if (!aprId || !expectedRevision) return { error: "Atualize a APR e confira sua revisão." };
  try {
    const submitted = submitSafetyAprForReview(access.context.tenant.id, aprId, expectedRevision, access.session.userId);
    appendAuditEvent({
      tenantId: access.context.tenant.id,
      actorUserId: access.session.userId,
      actorRole: access.context.membership.role,
      action: "safety.apr_submitted",
      targetId: submitted.id,
    });
    revalidatePath("/");
    return { success: "APR enviada para revisão humana. O envio não autoriza o início do trabalho." };
  } catch (error) {
    return { error: report(error, "Não foi possível enviar a APR para revisão.") };
  }
}
