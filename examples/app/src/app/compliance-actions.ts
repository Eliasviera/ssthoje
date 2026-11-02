"use server";

import { revalidatePath } from "next/cache";
import { appendAuditEvent } from "@/lib/audit-log";
import { DOCUMENT_KINDS } from "@/lib/document-categories";
import { listDocumentGroupsForTenant } from "@/lib/document-store";
import { createComplianceRule, listComplianceRulesForTenant, recordComplianceEvaluation } from "@/lib/compliance-store";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { assertReferenceReviewed } from "@/lib/reference-governance";
import { saoPauloDate } from "@/lib/business-date";
import { getThirdPartyDocumentForReview } from "@/lib/third-party-service";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";

export type ComplianceFormState = { error?: string; success?: string };

function getText(formData: FormData, name: string, maxLength: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export async function createComplianceRuleAction(_previousState: ComplianceFormState, formData: FormData): Promise<ComplianceFormState> {
  const access = await getCurrentTenantAccess("documents.manage");
  if (!access.authenticated || !access.context) return { error: "Somente a administradora pode cadastrar critérios nesta demonstração." };

  const title = getText(formData, "title", 140);
  const documentKind = getText(formData, "documentKind", 24);
  const criteria = getText(formData, "criteria", 700);
  const sourceTitle = getText(formData, "sourceTitle", 180);
  const sourceVersion = getText(formData, "sourceVersion", 80);
  const jurisdiction = getText(formData, "jurisdiction", 100);
  const validFrom = getText(formData, "validFrom", 10);
  const validUntil = getText(formData, "validUntil", 10);
  const reviewer = getText(formData, "reviewer", 120);
  const previousRuleId = getText(formData, "previousRuleId", 64);

  if (!title || !criteria || !sourceTitle || !sourceVersion || !jurisdiction || !reviewer) return { error: "Preencha critério, fonte, versão, jurisdição e responsável pela revisão." };
  if (!DOCUMENT_KINDS.includes(documentKind as (typeof DOCUMENT_KINDS)[number])) return { error: "Selecione o tipo de documento ao qual o critério se aplica." };
  if (!validDate(validFrom) || (validUntil && !validDate(validUntil))) return { error: "Informe datas de vigência válidas." };
  if (validUntil && validUntil < validFrom) return { error: "A data final da vigência não pode ser anterior à inicial." };

  try {
    createComplianceRule({
      tenantId: access.context.tenant.id,
      title,
      documentKind: documentKind as (typeof DOCUMENT_KINDS)[number],
      criteria,
      sourceTitle,
      sourceVersion,
      jurisdiction,
      validFrom,
      validUntil,
      reviewer,
      createdBy: access.session.userId,
      previousRuleId,
    });
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
  appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "compliance.rule_created" });
  revalidatePath("/");
  return { success: "Critério cadastrado e vinculado à fonte informada." };
}

export async function createComplianceEvaluationAction(_previousState: ComplianceFormState, formData: FormData): Promise<ComplianceFormState> {
  const access = await getCurrentTenantAccess("documents.review");
  if (!access.authenticated || !access.context) return { error: "Sua conta não tem permissão para avaliar documentos." };

  const ruleId = getText(formData, "ruleId", 64);
  const selectedDocument = getText(formData, "documentId", 160);
  const separator = selectedDocument.indexOf(":");
  const sourceCode = separator < 0 ? "" : selectedDocument.slice(0, separator);
  const documentId = separator < 0 ? "" : selectedDocument.slice(separator + 1);
  const result = getText(formData, "result", 24);
  const notes = getText(formData, "notes", 1000);
  const evidence = getText(formData, "evidence", 500);
  const evidenceDocumentId = getText(formData, "evidenceDocumentId", 64);
  const responsible = getText(formData, "responsible", 120);
  const nextStep = getText(formData, "nextStep", 300);
  if (!ruleId || !documentId || !["consultoria", "contratada"].includes(sourceCode)) return { error: "Selecione um critério e uma versão de documento." };
  if (!["atende", "pendente", "inconclusivo", "nao_aplicavel"].includes(result)) return { error: "Selecione um resultado da avaliação." };
  if (!notes) return { error: "Registre a justificativa da avaliação." };
  if (result !== "nao_aplicavel" && !evidence) return { error: "Descreva a evidência consultada." };
  if ((result === "pendente" || result === "inconclusivo") && (!responsible || !nextStep)) return { error: "Para pendência ou incerteza, informe responsável e próximo passo." };

  const tenantId = access.context.tenant.id;
  const rule = listComplianceRulesForTenant(tenantId).find((entry) => entry.id === ruleId && entry.status === "active");
  if (!rule) return { error: "Esse critério não está ativo nesta consultoria." };
  try { assertReferenceReviewed(access.session.userId, rule.id, tenantId); }
  catch(error) { return { error: error instanceof Error ? error.message : "Confira a referência antes de avaliar." }; }
  const today = saoPauloDate();
  if (rule.validFrom > today || (rule.validUntil && rule.validUntil < today)) return { error: "A fonte selecionada não está vigente hoje. Cadastre uma revisão válida antes de avaliar." };

  const groups = listDocumentGroupsForTenant(tenantId);
  let documentSnapshot: { title: string; kind: (typeof DOCUMENT_KINDS)[number]; version: number; source: "consultoria" | "contratada"; sourceLabel: string; companyId: string; unitId: string; companyName: string; unitName: string } | undefined;
  if (sourceCode === "consultoria") {
    const group = groups.find((entry) => entry.versions.some((version) => version.id === documentId));
    const document = group?.versions.find((version) => version.id === documentId);
    if (!group || !document) return { error: "A versão de documento não está disponível nesta consultoria." };
    const companies = await listClientCompanies(tenantId);
    const company = companies.find((entry) => entry.id === group.companyId);
    const unit = company?.units.find((entry) => entry.id === group.unitId);
    if (!company || !unit) return { error: "O escopo de empresa/unidade do documento não está disponível." };
    documentSnapshot = { title: document.title, kind: document.kind, version: document.version, source: "consultoria", sourceLabel: "Documento cadastrado pela equipe", companyId: group.companyId, unitId: group.unitId, companyName: company.tradeName || company.legalName, unitName: unit.name };
  } else {
    if (!hasTenantPermission(access.context.membership.role, "thirdparty.read")) return { error: "Seu perfil não pode avaliar documentos recebidos de contratadas." };
    const document = getThirdPartyDocumentForReview(access.session.userId, documentId);
    if (!document) return { error: "O recebimento atual não está disponível nesta consultoria." };
    documentSnapshot = { title: document.title, kind: document.kind, version: document.version, source: "contratada", sourceLabel: document.contractorName, companyId: document.companyId, unitId: document.unitId, companyName: document.companyName, unitName: document.unitName };
  }
  if (!documentSnapshot) return { error: "O documento selecionado não está disponível para avaliação." };
  if (documentSnapshot.kind !== rule.documentKind) return { error: "Esse critério é destinado a outro tipo de documento." };
  if (evidenceDocumentId && !groups.some((group) => group.versions.some((version) => version.id === evidenceDocumentId))) {
    return { error: "A evidência selecionada não está disponível nesta consultoria." };
  }

  recordComplianceEvaluation({
    tenantId,
    ruleId,
    documentId,
    result: result as "atende" | "pendente" | "inconclusivo" | "nao_aplicavel",
    notes,
    evidence,
    evidenceDocumentId,
    responsible: result === "pendente" || result === "inconclusivo" ? responsible : "",
    nextStep: result === "pendente" || result === "inconclusivo" ? nextStep : "",
  }, { rule, document: documentSnapshot }, { userId: access.session.userId, role: access.context.membership.role });
  appendAuditEvent({ tenantId, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "compliance.evaluated", targetId: documentId });
  revalidatePath("/");
  return { success: "Avaliação registrada com origem, evidências e revisão humana." };
}
