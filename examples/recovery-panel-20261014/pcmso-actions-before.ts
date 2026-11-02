"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompaniesForTenant } from "@/lib/client-store";
import { assignPcmso, changePcmso } from "@/lib/pcmso-service";

export type PcmsoFormState = { error?: string; success?: string };
const attempts = new Map<string, { count: number; start: number }>();
function checkRate(userId: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (now - value.start > 60000) attempts.delete(key);
  const entry = attempts.get(userId) ?? { count: 0, start: now };
  if (++entry.count > 30) throw new Error("Muitas alterações. Aguarde um minuto e tente novamente.");
  attempts.set(userId, entry);
}
function field(data: FormData, name: string, limit: number) {
  const value = data.get(name);
  if (typeof value !== "string" || value.length > limit) throw new Error("Confira os campos e tente novamente.");
  return value.trim();
}
export async function assignPcmsoAction(_state: PcmsoFormState, data: FormData): Promise<PcmsoFormState> {
  const access = await getCurrentTenantAccess("pcmso.assign");
  if (!access.authenticated || !access.context) return { error: "Somente a administradora pode vincular o coordenador." };
  try {
    checkRate(access.session.userId);
    const [companyId, unitId] = field(data, "companyUnit", 140).split("|");
    const company = listClientCompaniesForTenant(access.context.tenant.id).find(c => c.id === companyId && c.status === "active");
    const unit = company?.units.find(u => u.id === unitId);
    if (!company || !unit) return { error: "Selecione uma empresa e unidade ativas desta consultoria." };
    assignPcmso(access.session.userId, { companyId, unitId, companyName: company.tradeName || company.legalName, unitName: unit.name }, field(data, "coordinatorId", 64));
    revalidatePath("/"); return { success: "Coordenador fictício vinculado. O conteúdo fica restrito ao médico." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível vincular. Tente novamente." }; }
}
export async function changePcmsoAction(_state: PcmsoFormState, data: FormData): Promise<PcmsoFormState> {
  const access = await getCurrentTenantAccess("pcmso.manage");
  if (!access.authenticated || !access.context) return { error: "Ação exclusiva do coordenador médico vinculado." };
  try {
    checkRate(access.session.userId);
    const operation = field(data, "operation", 10);
    if (operation !== "save" && operation !== "submit" && operation !== "review") return { error: "Ação inválida." };
    const version = Number(field(data, "version", 10));
    if (!Number.isSafeInteger(version) || version < 0) return { error: "Versão inválida. Atualize a página." };
    const id = field(data, "recordId", 64);
    const records = (await import("@/lib/pcmso-service")).listAssignedPcmso(access.session.userId);
    const record = records.find(r => r.id === id);
    const company = record && listClientCompaniesForTenant(access.context.tenant.id).find(c => c.id === record.companyId && c.status === "active" && c.units.some(u => u.id === record.unitId));
    if (!company) return { error: "PCMSO indisponível ou empresa arquivada. Consulte a administradora." };
    changePcmso(access.session.userId, id, version, operation, operation === "save" ? field(data, "content", 12000) : undefined);
    revalidatePath("/"); return { success: operation === "save" ? "Versão salva e preservada." : operation === "submit" ? "Enviado para revisão interna." : "Revisão interna registrada, sem assinatura." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente." }; }
}
