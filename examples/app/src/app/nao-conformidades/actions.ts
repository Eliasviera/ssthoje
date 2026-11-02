"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { createNonconformity, transitionNonconformity, NonconformityError, type NcStatus } from "@/lib/nonconformity-store";
export type NcFormState = { error?: string; success?: string };
function field(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max) throw new NonconformityError("Confira os campos obrigatórios e seus limites.");
  return value.trim();
}
function failure(error: unknown): NcFormState {
  return { error: error instanceof NonconformityError ? error.message : "Não foi possível salvar. Atualize a página e tente novamente." };
}
export async function createNcAction(_previous: NcFormState, data: FormData): Promise<NcFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.context) return { error: "Seu perfil não pode registrar ocorrências." };
  try {
    const scope = field(data, "scope", 281).split("|");
    if (scope.length !== 2 || !scope[0] || !scope[1]) throw new NonconformityError("Selecione empresa e unidade.");
    const [companyId, unitId] = scope;
    const companies = await listClientCompanies(access.context.tenant.id);
    const company = companies.find(item => item.id === companyId && item.status === "active");
    if (!company?.units.some(unit => unit.id === unitId)) throw new NonconformityError("Selecione empresa e unidade ativas desta consultoria.");
    createNonconformity({ tenantId: access.context.tenant.id, actorUserId: access.session.userId, companyId, unitId,
      title: field(data, "title", 140), description: field(data, "description", 2000), evidence: field(data, "evidence", 2000),
      location: field(data, "location", 500), responsible: field(data, "responsible", 120),
      actionPlan: field(data, "actionPlan", 1200), dueDate: field(data, "dueDate", 10) });
    revalidatePath("/nao-conformidades");
    return { success: "Ocorrência registrada. Acompanhe a correção e a revisão humana no relatório." };
  } catch (error) { return failure(error); }
}
export async function transitionNcAction(_previous: NcFormState, data: FormData): Promise<NcFormState> {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.context) return { error: "Seu perfil não pode acompanhar ocorrências." };
  try {
    const revision = field(data, "revision", 10);
    if (!/^[1-9]\d*$/.test(revision)) throw new NonconformityError("Atualize a revisão da ocorrência.");
    transitionNonconformity(access.context.tenant.id, field(data, "id", 36), Number(revision),
      field(data, "status", 20) as NcStatus, field(data, "note", 2000), access.session.userId);
    revalidatePath("/nao-conformidades");
    return { success: "Acompanhamento registrado com histórico preservado." };
  } catch (error) { return failure(error); }
}
