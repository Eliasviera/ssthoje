"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { scheduleThirdPartyIntegration } from "@/lib/third-party-service";

export type IntegrationFormState = { error?: string; success?: string };
function field(data: FormData, name: string, limit: number) {
  const value = data.get(name);
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error("Confira os campos obrigatórios.");
  return value.trim();
}
export async function scheduleIntegrationAction(data: FormData): Promise<IntegrationFormState> {
  const access = await getCurrentTenantAccess("thirdparty.manage");
  if (!access.authenticated || !access.context) return { error: "Agendamento não autorizado." };
  try {
    scheduleThirdPartyIntegration(access.session.userId, { invitationId: field(data, "invitationId", 64), approvalId: field(data, "approvalId", 64), scheduledOn: field(data, "scheduledOn", 10) });
    revalidatePath("/integracoes/terceiros");
    return { success: "Agendamento local registrado. Não libera entrada nem envia convites externos." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível agendar." }; }
}
