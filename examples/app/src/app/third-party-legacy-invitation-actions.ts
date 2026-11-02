"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { LegacyInvitationConfirmationError } from "@/lib/third-party-legacy-invitation-confirmation";
import type {
  LegacyInvitationCaseConfirmationInput,
  LegacyInvitationCaseLinkInput,
} from "@/lib/third-party-legacy-invitation-confirmation";
import {
  LegacyInvitationPreviewError,
  previewLegacyInvitationContext,
} from "@/lib/third-party-legacy-invitation-preview";
import {
  confirmCurrentLegacyInvitationCaseLink,
  proposeCurrentLegacyInvitationCaseLink,
} from "@/lib/third-party-legacy-invitation-confirmation-service";
import {
  listCurrentLegacyInvitationCaseOptions,
  listCurrentLegacyInvitationCaseStates,
} from "@/lib/third-party-legacy-invitation-read-service";
import { ThirdPartyReconciliationAccessError } from "@/lib/third-party-legacy-reconciliation-write-operations";
import { TenantTransactionAccessError } from "@/lib/tenant-read-transaction";

export type M22FormState = {
  error?: string;
  success?: string;
  preview?: {
    contextSha256: string;
    sourceCompanyId: string | null;
    sourceUnitId: string | null;
    contractorCnpj: string | null;
    scopeText: string | null;
    requestedCategories: readonly string[];
  };
};

export type M22ReviewDataState = {
  error?: string;
  cases?: Awaited<ReturnType<typeof listCurrentLegacyInvitationCaseOptions>>;
  states?: Awaited<ReturnType<typeof listCurrentLegacyInvitationCaseStates>>;
};

function field(data: FormData, name: string, limit: number) {
  const value = data.get(name);
  if (typeof value !== "string" || value.length > limit) {
    throw new Error("Confira os campos e tente novamente.");
  }
  return value.trim();
}

function integerField(data: FormData, name: string) {
  const value = field(data, name, 12);
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error("A versão do vínculo é inválida. Atualize a tela.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("A versão do vínculo é inválida. Atualize a tela.");
  return parsed;
}

function postgresErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function reportActionError(error: unknown, fallback: string): string {
  if (error instanceof LegacyInvitationPreviewError) {
    return error.kind === "unavailable"
      ? "A origem do convite está indisponível. Tente novamente ou solicite revisão técnica."
      : "O convite contém dados que precisam de revisão técnica antes de continuar.";
  }
  if (error instanceof LegacyInvitationConfirmationError) {
    if (error.kind === "not_found") return "O convite não está disponível nesta consultoria.";
    if (error.kind === "context_changed") return "Os dados do convite mudaram. Revise o contexto novamente antes de propor.";
    if (error.kind === "invalid_input") return "Confira os dados selecionados e tente novamente.";
    return "O estado do vínculo mudou ou não permite esta operação. Atualize a tela e revise o histórico.";
  }
  if (error instanceof ThirdPartyReconciliationAccessError || error instanceof TenantTransactionAccessError) {
    return "Seu perfil não tem acesso a esta etapa. Peça à administradora que confira o vínculo e o escopo.";
  }
  const code = postgresErrorCode(error);
  if (code === "42501") return "O banco não confirmou a autorização necessária. Confira a membership cliente e a designação vigente para a mesma empresa e unidade.";
  if (code === "40001") return "O convite ou o estado do vínculo mudou durante a revisão. Atualize a página e confira novamente.";
  if (code === "23514") return "A proposta não corresponde ao caso vigente. Revise o caso antes de tentar novamente.";
  if (code === "23503") return "O caso selecionado deixou de estar disponível. Atualize a lista de casos.";
  if (error instanceof Error && error.message.includes("A conexão PostgreSQL")) {
    return "A conexão com o banco está indisponível. Verifique o serviço local e tente novamente.";
  }
  console.error("Ação M22 de vínculo convite-caso não concluída.", error instanceof Error ? error.name : "unknown");
  return fallback;
}

export async function previewLegacyInvitationAction(data: FormData): Promise<M22FormState> {
  const access = await getCurrentTenantAccess("documents.review");
  if (!access.authenticated || !access.context) return { error: "A revisão do convite não está autorizada." };
  try {
    const invitationId = field(data, "invitationId", 180);
    const preview = await previewLegacyInvitationContext(invitationId);
    if (!preview) return { error: "Convite não encontrado nesta consultoria." };
    return {
      preview: {
        contextSha256: preview.contextSha256,
        sourceCompanyId: preview.snapshot.sourceCompanyId,
        sourceUnitId: preview.snapshot.sourceUnitId,
        contractorCnpj: preview.snapshot.contractorCnpj,
        scopeText: preview.snapshot.scopeText,
        requestedCategories: preview.snapshot.requestedCategories,
      },
    };
  } catch (error) {
    return { error: reportActionError(error, "Não foi possível ler o contexto atual do convite.") };
  }
}

export async function proposeLegacyInvitationCaseAction(data: FormData): Promise<M22FormState> {
  const access = await getCurrentTenantAccess("documents.review");
  if (!access.authenticated || !access.context) return { error: "A proposta de vínculo não está autorizada." };
  try {
    const invitationId = field(data, "invitationId", 180);
    const expectedContextSha256 = field(data, "contextSha256", 64);
    const caseId = field(data, "caseId", 36);
    const rationale = field(data, "rationale", 1600);
    if (!/^[0-9a-f]{64}$/.test(expectedContextSha256)) return { error: "Atualize a revisão do convite antes de propor o vínculo." };
    const [caseOptions, states] = await Promise.all([
      listCurrentLegacyInvitationCaseOptions(),
      listCurrentLegacyInvitationCaseStates([invitationId]),
    ]);
    const target = caseOptions.find((item) => item.caseId === caseId);
    if (!target) return { error: "O caso selecionado não está disponível para esta consultoria. Atualize a tela." };
    const latest = states.find((item) => item.invitationId === invitationId);
    const input: LegacyInvitationCaseLinkInput = {
      invitationId,
      expectedContextSha256,
      expectedRevision: latest?.revision ?? 0,
      companyId: target.companyId,
      unitId: target.unitId,
      thirdPartyId: target.thirdPartyId,
      workflowId: target.caseId,
      rationale,
    };
    await proposeCurrentLegacyInvitationCaseLink(input);
    revalidatePath("/");
    return { success: "Proposta registrada. A confirmação depende de representante cliente designado para a mesma empresa e unidade." };
  } catch (error) {
    return { error: reportActionError(error, "A proposta não foi registrada. Confira o histórico do convite e tente novamente.") };
  }
}

export async function confirmLegacyInvitationCaseAction(data: FormData): Promise<M22FormState> {
  const access = await getCurrentTenantAccess("documents.read");
  if (!access.authenticated || !access.context || access.context.membership.role !== "cliente") {
    return { error: "Somente uma conta cliente pode confirmar a proposta." };
  }

  try {
    const input: LegacyInvitationCaseConfirmationInput = {
      invitationId: field(data, "invitationId", 180),
      expectedContextSha256: field(data, "contextSha256", 64),
      expectedRevision: integerField(data, "revision"),
      snapshotId: field(data, "snapshotId", 36),
      companyId: field(data, "companyId", 140),
      unitId: field(data, "unitId", 140),
      thirdPartyId: field(data, "thirdPartyId", 36),
      workflowId: field(data, "workflowId", 36),
      rationale: field(data, "rationale", 1600),
    };
    await confirmCurrentLegacyInvitationCaseLink(input);
    revalidatePath("/");
    return { success: "Confirmação registrada para a proposta exata. O vínculo não substitui a revisão dos documentos." };
  } catch (error) {
    return { error: reportActionError(error, "A confirmação não foi registrada. Atualize a página e confira a proposta.") };
  }
}

export async function loadLegacyInvitationLinkReviewAction(invitationIds: string[]): Promise<M22ReviewDataState> {
  const access = await getCurrentTenantAccess("documents.review");
  if (!access.authenticated || !access.context) return { error: "A revisão de vínculos não está autorizada." };
  if (!Array.isArray(invitationIds) || invitationIds.length > 500
    || invitationIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 180)) {
    return { error: "A lista de convites é inválida. Atualize a página." };
  }
  try {
    const [cases, states] = await Promise.all([
      listCurrentLegacyInvitationCaseOptions(),
      listCurrentLegacyInvitationCaseStates(invitationIds),
    ]);
    return { cases, states };
  } catch (error) {
    return { error: reportActionError(error, "Não foi possível carregar a revisão de vínculos no PostgreSQL local.") };
  }
}
