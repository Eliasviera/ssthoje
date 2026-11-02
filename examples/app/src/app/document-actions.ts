"use server";

import { revalidatePath } from "next/cache";
import { appendAuditEvent } from "@/lib/audit-log";
import { listClientCompanies } from "@/lib/client-service";
import { DOCUMENT_KINDS } from "@/lib/document-categories";
import { archiveDocumentGroup, createDocumentVersion, replaceDocumentVersion } from "@/lib/document-store";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { StorageQuotaError } from "@/lib/storage-quota";

export type DocumentFormState = { error?: string; success?: string };
const MAX_PDF_BYTES = 7 * 1024 * 1024;

function getText(formData: FormData, name: string, maxLength: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function getPdf(formData: FormData): Promise<{ file: File; bytes: Uint8Array } | { error: string }> {
  const value = formData.get("file");
  if (!(value instanceof File) || !value.size) return { error: "Selecione um arquivo PDF." };
  if (value.size > MAX_PDF_BYTES) return { error: "O PDF precisa ter até 7 MB." };
  const fileName = value.name.split(/[\\/]/).pop() ?? "";
  if (!fileName.toLowerCase().endsWith(".pdf") || (value.type && value.type !== "application/pdf" && value.type !== "application/octet-stream")) {
    return { error: "Envie apenas um arquivo com extensão PDF." };
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!header.includes("%PDF-")) return { error: "O arquivo selecionado não parece ser um PDF válido." };
  return { file: value, bytes };
}

function isValidDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export async function createDocumentAction(_previousState: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const access = await getCurrentTenantAccess("documents.manage");
  if (!access.authenticated || !access.context) return { error: "Sua conta não tem permissão para cadastrar documentos." };
  const title = getText(formData, "title", 160);
  const kind = getText(formData, "kind", 24);
  const companyId = getText(formData, "companyId", 64);
  const unitId = getText(formData, "unitId", 64);
  const validUntil = getText(formData, "validUntil", 10);
  if (!title) return { error: "Informe um nome para o documento." };
  if (!DOCUMENT_KINDS.includes(kind as (typeof DOCUMENT_KINDS)[number])) return { error: "Selecione uma categoria de documento." };
  if (!companyId || !unitId) return { error: "Selecione uma empresa e uma unidade ativas." };
  if (!isValidDate(validUntil)) return { error: "Confira a data de validade informada." };
  const company = (await listClientCompanies(access.context.tenant.id)).find((entry) => entry.id === companyId && entry.status === "active");
  const unit = company?.units.find((entry) => entry.id === unitId);
  if (!company || !unit) return { error: "A empresa ou unidade selecionada não está disponível nesta consultoria." };
  const upload = await getPdf(formData);
  if ("error" in upload) return { error: upload.error };

  const fileName = upload.file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, "").slice(0, 140) || "documento.pdf";
  try { createDocumentVersion({
    tenantId: access.context.tenant.id,
    companyId,
    unitId,
    title,
    kind: kind as (typeof DOCUMENT_KINDS)[number],
    originalFileName: fileName,
    size: upload.file.size,
    validUntil,
    uploadedBy: access.session.userId,
  }, upload.bytes, { userId: access.session.userId, role: access.context.membership.role });
  } catch (error) { if (error instanceof StorageQuotaError) return { error: error.message }; throw error; }
  appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "document.uploaded" });
  revalidatePath("/");
  return { success: "Documento fictício salvo nesta consultoria." };
}

export async function replaceDocumentAction(_previousState: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const access = await getCurrentTenantAccess("documents.manage");
  if (!access.authenticated || !access.context) return { error: "Sua conta não tem permissão para substituir documentos." };
  const groupId = getText(formData, "groupId", 64);
  if (!groupId) return { error: "Documento não encontrado." };
  const upload = await getPdf(formData);
  if ("error" in upload) return { error: upload.error };
  const fileName = upload.file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, "").slice(0, 140) || "documento.pdf";
  let replacement;
  try { replacement = replaceDocumentVersion(groupId, upload.bytes, fileName, upload.file.size, { userId: access.session.userId, role: access.context.membership.role }, access.context.tenant.id);
  } catch (error) { if (error instanceof StorageQuotaError) return { error: error.message }; throw error; }
  if (!replacement) return { error: "Este documento não pode ser substituído." };
  appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "document.replaced" });
  revalidatePath("/");
  return { success: `Nova versão ${replacement.version} salva. A anterior foi preservada.` };
}

export async function archiveDocumentAction(formData: FormData) {
  const access = await getCurrentTenantAccess("documents.manage");
  if (!access.authenticated || !access.context) return;
  const groupId = getText(formData, "groupId", 64);
  if (!groupId || !archiveDocumentGroup(groupId, access.context.tenant.id, { userId: access.session.userId, role: access.context.membership.role })) return;
  appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "document.archived" });
  revalidatePath("/");
}
