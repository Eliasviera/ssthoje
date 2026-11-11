"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { appendAuditEvent } from "@/lib/audit-log";
import { archiveTemplate, completeInspection, createTemplate, listTemplates, ChecklistError, type ChecklistKind } from "@/lib/checklist-store";

export type ChecklistFormState = { error?: string; success?: string };

function field(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max) throw new ChecklistError("Confira os campos e seus limites.");
  return value.trim();
}
function failure(error: unknown): ChecklistFormState {
  return { error: error instanceof ChecklistError || (error instanceof Error && error.name === "DdsError") ? (error as Error).message : "Não foi possível salvar. Atualize a página e tente novamente." };
}
type Context = NonNullable<Awaited<ReturnType<typeof getCurrentTenantAccess>>["context"]>;
function audit(context: Context, userId: string, action: "checklist.template_created" | "checklist.template_archived" | "checklist.completed") {
  appendAuditEvent({ tenantId: context.tenant.id, actorUserId: userId, actorRole: context.membership.role, action });
}

export async function createTemplateAction(_previous: ChecklistFormState, data: FormData): Promise<ChecklistFormState> {
  const access = await getCurrentTenantAccess("checklist.manage");
  if (!access.context) return { error: "Seu perfil não pode criar modelos." };
  try {
    const rawItems = data.getAll("items").map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean);
    const criticalItems = new Set(data.getAll("criticalItems").map(String));
    const items = rawItems.map((textValue, index) => ({ text: textValue, critical: criticalItems.has(String(index)) }));
    createTemplate({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, kind: field(data, "kind", 10) as ChecklistKind,
      name: field(data, "name", 120), items });
    audit(access.context, access.session.userId, "checklist.template_created");
    revalidatePath("/checklists");
    return { success: "Modelo criado." };
  } catch (error) { return failure(error); }
}

export async function archiveTemplateAction(_previous: ChecklistFormState, data: FormData): Promise<ChecklistFormState> {
  const access = await getCurrentTenantAccess("checklist.manage");
  if (!access.context) return { error: "Seu perfil não pode arquivar modelos." };
  try {
    archiveTemplate(access.context.tenant.id, field(data, "id", 36));
    audit(access.context, access.session.userId, "checklist.template_archived");
    revalidatePath("/checklists");
    return { success: "Modelo arquivado. Inspeções anteriores foram preservadas." };
  } catch (error) { return failure(error); }
}

export async function syncPendingInspectionAction(_previous: ChecklistFormState, data: FormData): Promise<ChecklistFormState> {
  const access = await getCurrentTenantAccess("checklist.apply");
  if (!access.context) return { error: "Seu perfil não pode registrar inspeções." };
  try {
    const tenantId = access.context.tenant.id;
    const templateId = field(data, "templateId", 36);
    const scope = field(data, "scope", 281).split("|");
    const answers: Record<string, { answer: string; note: string }> = {};
    for (const [key, value] of data.entries()) {
      if (key.startsWith("answer:") && typeof value === "string") answers[key.slice(7)] = { answer: value, note: field(data, `note:${key.slice(7)}`, 500) };
    }
    const freeNotes = [0, 1].map((index) => ({ label: field(data, `free${index}label`, 80), text: field(data, `free${index}text`, 500) })).filter((entry) => entry.label || entry.text);
    completeInspection({ tenantId, actorUserId: access.session.userId, templateId, companyId: scope[0] || "", unitId: scope[1] || "",
      subject: field(data, "subject", 160), performedOn: field(data, "performedOn", 10), inspector: field(data, "inspector", 120),
      answers, freeNotes, equipmentId: field(data, "equipmentId", 60) || undefined, image: field(data, "image", 120000) });
    audit(access.context, access.session.userId, "checklist.completed");
    revalidatePath("/checklists");
    return { success: "Inspeção sincronizada do aparelho." };
  } catch (error) { return failure(error); }
}

export async function completeInspectionAction(_previous: ChecklistFormState, data: FormData): Promise<ChecklistFormState> {
  const access = await getCurrentTenantAccess("checklist.apply");
  if (!access.context) return { error: "Seu perfil não pode aplicar checklists." };
  try {
    const tenantId = access.context.tenant.id;
    const templateId = field(data, "templateId", 36);
    const template = listTemplates(tenantId).find((item) => item.id === templateId);
    if (template?.kind === "area" && !(await getCurrentTenantAccess("checklist.manage")).context) {
      throw new ChecklistError("Checklists de área são aplicados pelo TST. Operadores aplicam checklists de equipamento.");
    }
    const scope = field(data, "scope", 281).split("|");
    if (scope.length !== 2 || !scope[0] || !scope[1]) throw new ChecklistError("Selecione empresa e unidade.");
    const [companyId, unitId] = scope;
    const company = (await listClientCompanies(tenantId)).find((item) => item.id === companyId && item.status === "active");
    if (!company?.units.some((unit) => unit.id === unitId)) throw new ChecklistError("Selecione empresa e unidade ativas desta consultoria.");
    const answers: Record<string, { answer: string; note: string }> = {};
    for (const [key, value] of data.entries()) {
      if (key.startsWith("answer:") && typeof value === "string") answers[key.slice(7)] = { answer: value, note: field(data, `note:${key.slice(7)}`, 500) };
    }
    const freeNotes = [0, 1].map((index) => ({
      label: field(data, `free${index}label`, 80),
      text: field(data, `free${index}text`, 500),
    })).filter((entry) => entry.label || entry.text);
    completeInspection({ tenantId, actorUserId: access.session.userId, templateId, companyId, unitId,
      subject: field(data, "subject", 160), performedOn: field(data, "performedOn", 10), inspector: field(data, "inspector", 120),
      answers, freeNotes, equipmentId: field(data, "equipmentId", 60) || undefined, image: field(data, "image", 120000) });
    audit(access.context, access.session.userId, "checklist.completed");
    revalidatePath("/checklists");
    return { success: "Inspeção registrada com assinatura. Itens não conformes devem ser tratados em Não conformidades." };
  } catch (error) { return failure(error); }
}
