"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { createThirdPartyInvitation, revokeThirdPartyInvitation, openThirdPartyPortal, receiveThirdPartyPdf } from "@/lib/third-party-service";
import type { PublicInvitation } from "@/lib/third-party-store";
import { openThirdPartyIssue, updateThirdPartyIssue, renewThirdPartyInvitation } from "@/lib/third-party-service";

export type InvitationFormState = { error?: string; success?: string; link?: string };
export type PortalFormState = { error?: string; success?: string; portal?: PublicInvitation };
function field(data: FormData, name: string, limit: number) {
  const value = data.get(name);
  if (typeof value !== "string" || value.length > limit) throw new Error("Confira os campos e tente novamente.");
  return value.trim();
}
function optionalField(data: FormData, name: string, limit: number) {
  return data.has(name) ? field(data, name, limit) : undefined;
}
export async function createInvitationAction(data: FormData): Promise<InvitationFormState> {
  const access = await getCurrentTenantAccess("thirdparty.manage");
  if (!access.authenticated || !access.context) return { error: "Somente a administradora pode criar convites." };
  try {
    const [companyId, unitId] = field(data, "companyUnit", 140).split("|");
    const requested = data.getAll("requested");
    if (requested.some(k => typeof k !== "string")) return { error: "Selecione os documentos solicitados." };
    const medicalAsoRequired = data.get("medicalAsoRequired") === "true";
    const result = createThirdPartyInvitation(access.session.userId, { companyId, unitId, contractorName: field(data, "contractorName", 140), contractorCnpj: field(data, "contractorCnpj", 24), scope: field(data, "scope", 240), requested: requested as string[], medicalAsoRequired, expiresInHours: Number(field(data, "expiresInHours", 3)) });
    revalidatePath("/"); return { success: "Convite fictício criado. Abra ou copie o link agora; ele não será exibido novamente após sair desta seção.", link: result.link };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível criar o convite." }; }
}
export async function revokeInvitationAction(data: FormData): Promise<InvitationFormState> {
  const access = await getCurrentTenantAccess("thirdparty.manage");
  if (!access.authenticated || !access.context) return { error: "Somente a administradora pode revogar convites." };
  try { revokeThirdPartyInvitation(access.session.userId, field(data, "invitationId", 64)); revalidatePath("/"); return { success: "Link revogado. Os documentos recebidos foram preservados." }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível revogar." }; }
}
export async function openPortalAction(data: FormData): Promise<PortalFormState> {
  try { return { portal: openThirdPartyPortal(field(data, "token", 64)) }; }
  catch { return { error: "Link indisponível, expirado ou com muitas solicitações. Solicite um novo convite à consultoria ou tente novamente em um minuto." }; }
}
export async function uploadPortalAction(data: FormData): Promise<PortalFormState> {
  try {
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > 7 * 1024 * 1024) return { error: "Selecione um PDF fictício de até 7 MB." };
    if (file.type && file.type !== "application/pdf" && file.type !== "application/octet-stream") return { error: "Envie somente PDF fictício." };
    const issueId = data.get("issueId");
    const correction = typeof issueId === "string" && issueId ? { issueId: field(data, "issueId", 64), revision: Number(field(data, "revision", 12)), notes: field(data, "correctionNote", 1200) } : undefined;
    const portal = receiveThirdPartyPdf(field(data, "token", 64), field(data, "kind", 24), file.name, new Uint8Array(await file.arrayBuffer()), correction, optionalField(data, "validUntil", 10));
    revalidatePath("/"); return { portal, success: "PDF recebido e preservado. A consultoria ainda precisa avaliar o documento; recebimento não confirma conformidade." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Envio não concluído. Confira o link e tente novamente." }; }
}

export async function openIssueAction(data: FormData): Promise<InvitationFormState> {
  const access = await getCurrentTenantAccess("documents.review");
  if (!access.authenticated || !access.context) return { error: "Revisão não autorizada." };
  try {
    openThirdPartyIssue(access.session.userId, { invitationId: field(data, "invitationId", 64), receiptId: field(data, "receiptId", 64), reason: field(data, "reason", 600), requestedChange: field(data, "requestedChange", 1200), evidence: field(data, "evidence", 1200), assigneeUserId: field(data, "assigneeUserId", 64) });
    revalidatePath("/"); return { success: "Pendência criada. Motivo e correção solicitada já aparecem no portal do convite." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível criar a pendência." }; }
}
export async function updateIssueAction(data: FormData): Promise<InvitationFormState> {
  const access = await getCurrentTenantAccess("documents.review");
  if (!access.authenticated || !access.context) return { error: "Revisão não autorizada." };
  try {
    const action = field(data, "operation", 12);
    if (!["assign", "comment", "resolve", "reopen"].includes(action)) return { error: "Ação inválida." };
    const optional = (name: string) => data.has(name) ? field(data, name, 1200) : undefined;
    updateThirdPartyIssue(access.session.userId, { invitationId: field(data, "invitationId", 64), issueId: field(data, "issueId", 64), revision: Number(field(data, "revision", 12)), action: action as "assign" | "comment" | "resolve" | "reopen", notes: field(data, "notes", 1200), evidence: optional("evidence"), requestedChange: optional("requestedChange"), assigneeUserId: optional("assigneeUserId") });
    revalidatePath("/"); return { success: "Atualização preservada no histórico da pendência." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível atualizar a pendência." }; }
}
export async function renewInvitationAction(data: FormData): Promise<InvitationFormState> {
  const access = await getCurrentTenantAccess("thirdparty.manage");
  if (!access.authenticated || !access.context) return { error: "Somente a administradora pode renovar o link." };
  try {
    const result = renewThirdPartyInvitation(access.session.userId, field(data, "invitationId", 64));
    revalidatePath("/"); return { link: result.link, success: "Novo link local por 24 horas. O endereço anterior foi invalidado; recebimentos e histórico foram preservados." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível renovar o link." }; }
}
