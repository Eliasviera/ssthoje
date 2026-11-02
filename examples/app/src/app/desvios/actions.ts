"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { appendAuditEvent } from "@/lib/audit-log";
import { createDeviation, transitionDeviation, DeviationError } from "@/lib/deviation-store";

export type DeviationFormState = { error?: string; success?: string };

function field(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max) throw new DeviationError("Confira os campos e seus limites.");
  return value.trim();
}
function failure(error: unknown): DeviationFormState {
  return { error: error instanceof DeviationError ? error.message : "Não foi possível salvar. Atualize a página e tente novamente." };
}

export async function reportDeviationAction(_previous: DeviationFormState, data: FormData): Promise<DeviationFormState> {
  const access = await getCurrentTenantAccess("deviation.report");
  if (!access.context) return { error: "Seu perfil não pode registrar desvios." };
  try {
    const tenantId = access.context.tenant.id;
    let companyId = "";
    let unitId = "";
    const scope = field(data, "scope", 281);
    if (scope) {
      const parts = scope.split("|");
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new DeviationError("Selecione empresa e unidade.");
      [companyId, unitId] = parts;
      const company = (await listClientCompanies(tenantId)).find((item) => item.id === companyId && item.status === "active");
      if (!company?.units.some((unit) => unit.id === unitId)) throw new DeviationError("Selecione empresa e unidade ativas desta consultoria.");
    }
    createDeviation({ tenantId, actorUserId: access.session.userId, kind: field(data, "kind", 20), companyId, unitId,
      occurredOn: field(data, "occurredOn", 10), location: field(data, "location", 200), description: field(data, "description", 2000),
      immediateAction: field(data, "immediateAction", 1000), reporterName: access.context.membership.displayName });
    appendAuditEvent({ tenantId, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "deviation.reported" });
    revalidatePath("/desvios");
    return { success: "Relato registrado. Obrigado por avisar." };
  } catch (error) { return failure(error); }
}

export async function transitionDeviationAction(_previous: DeviationFormState, data: FormData): Promise<DeviationFormState> {
  const access = await getCurrentTenantAccess("deviation.manage");
  if (!access.context) return { error: "Seu perfil não pode tratar desvios." };
  try {
    transitionDeviation({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, id: field(data, "id", 36),
      status: field(data, "status", 20), note: field(data, "note", 1000) });
    appendAuditEvent({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, actorRole: access.context.membership.role, action: "deviation.status_changed" });
    revalidatePath("/desvios");
    return { success: "Situação atualizada." };
  } catch (error) { return failure(error); }
}
