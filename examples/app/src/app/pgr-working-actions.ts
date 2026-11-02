"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { readCompanyPgrDigitalization } from "@/lib/pgr-digitalization-store";
import { readWorkingHistory, saveWorkingEntry, type WorkingFields } from "@/lib/pgr-working-store";
import { isWorkingTarget, workingFieldLabels } from "@/lib/pgr-working-document";
export type WorkingState = { error?: string; success?: string };
export async function saveWorkingAction(_previous: WorkingState, data: FormData): Promise<WorkingState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated || !access.context) return { error: "Seu perfil não permite editar o inventário." };
  const value = (key: string) => typeof data.get(key) === "string" ? (data.get(key) as string).trim() : "";
  const profile = readCompanyPgrDigitalization(access.context.tenant.id, value("companyId"));
  if (!profile || profile.sha256 !== value("sha256")) return { error: "Origem indisponível ou alterada. Atualize a página." };
  const kind = value("kind"), id = value("id");
  if (kind !== "role" && kind !== "risk" && kind !== "action") return { error: "Tipo de item inválido." };
  if (!isWorkingTarget(profile, kind, id, readWorkingHistory(access.context.tenant.id, profile.companyId, profile.sha256))) return { error: "Item não pertence a este PGR." };
  if (!/^\d+$/.test(value("revision"))) return { error: "Revisão inválida." };
  const fields = Object.fromEntries([...new Set(["name", "sector", "role", "activity", "description", "harm", "controls", "evidence", ...Object.keys(workingFieldLabels(kind))])].map(key => [key, value(key)])) as WorkingFields;
  try {
    saveWorkingEntry(access.context.tenant.id, profile.companyId, profile.sha256, { id, kind, fields, reason: value("reason"), actorUserId: access.session.userId }, Number(value("revision")));
    revalidatePath(`/empresas/${profile.companyId}`);
    return { success: "Alteração salva no PGR de trabalho. Revisão técnica pendente." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar." }; }
}
