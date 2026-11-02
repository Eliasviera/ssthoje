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
    createTemplate({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, kind: field(data, "kind", 10) as ChecklistKind,
      name: field(data, "name", 120), items: field(data, "items", 30000).split("\n") });
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
    completeInspection({ tenantId, actorUserId: access.session.userId, templateId, companyId, unitId,
      subject: field(data, "subject", 160), performedOn: field(data, "performedOn", 10), inspector: field(data, "inspector", 120),
      answers, image: field(data, "image", 120000) });
    audit(access.context, access.session.userId, "checklist.completed");
    revalidatePath("/checklists");
    return { success: "Inspeção registrada com assinatura. Itens não conformes devem ser tratados em Não conformidades." };
  } catch (error) { return failure(error); }
}
