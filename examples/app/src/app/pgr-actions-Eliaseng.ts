"use server";

import { revalidatePath } from "next/cache";
import { appendAuditEvent } from "@/lib/audit-log";
import { listClientCompanies } from "@/lib/client-service";
import { parsePgrForm } from "@/lib/pgr-input";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { savePgrDraft, transitionPgrDraft } from "@/lib/pgr-store";

export type PgrFormState = { error?: string; success?: string };

export async function savePgrDraftAction(_previous: PgrFormState, data: FormData): Promise<PgrFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Somente a equipe autorizada pode criar ou editar rascunhos nesta demonstração." };
  const parsed = parsePgrForm(data);
  if ("error" in parsed) return parsed;
  const { draftId, expectedRevision, ...input } = parsed.value;
  const tenantId = access.context.tenant.id;
  const company = (await listClientCompanies(tenantId)).find((entry) => entry.id === input.companyId && entry.status === "active");
  if (!company || !company.units.some((unit) => unit.id === input.unitId)) return { error: "Selecione uma empresa e unidade ativas desta consultoria." };
  const saved = savePgrDraft(tenantId, input, { userId: access.session.userId, role: access.context.membership.role }, draftId, expectedRevision);
  if (!saved) return { error: "O rascunho mudou ou não está disponível para edição. Atualize a página antes de tentar novamente." };
  appendAuditEvent({ tenantId, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: draftId ? "pgr.updated" : "pgr.created", targetId: saved.id });
  revalidatePath("/"); return { success: "Rascunho salvo no computador." };
}

export async function submitPgrDraftAction(data: FormData) {
  const access = await getCurrentTenantAccess("pgr.manage"); if (!access.authenticated || !access.context) return;
  const id = data.get("draftId"), revision = data.get("expectedRevision"); if (typeof id !== "string" || !id || id.length > 64 || typeof revision !== "string" || !/^\d{1,12}$/.test(revision)) return;
  const record = transitionPgrDraft(access.context.tenant.id, id, "in_review", { userId: access.session.userId, role: access.context.membership.role }, Number(revision));
  if (!record) return;
  appendAuditEvent({ tenantId: record.tenantId, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "pgr.submitted", targetId: record.id }); revalidatePath("/");
}

export async function approvePgrDraftAction(data: FormData) {
  const access = await getCurrentTenantAccess("documents.review"); if (!access.authenticated || !access.context) return;
  const id = data.get("draftId"), revision = data.get("expectedRevision"); if (typeof id !== "string" || !id || id.length > 64 || typeof revision !== "string" || !/^\d{1,12}$/.test(revision)) return;
  const record = transitionPgrDraft(access.context.tenant.id, id, "approved", { userId: access.session.userId, role: access.context.membership.role }, Number(revision));
  if (!record) return;
  appendAuditEvent({ tenantId: record.tenantId, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "pgr.approved", targetId: record.id }); revalidatePath("/");
}
