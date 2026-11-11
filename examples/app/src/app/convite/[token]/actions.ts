"use server";
import { registerTrialInvitation } from "@/lib/trial-invite-service";
import { redirect } from "next/navigation";
export async function activateTrialAction(token: string, _state: { error: string }, data: FormData): Promise<{ error: string }> {
  try {
    registerTrialInvitation({ token, displayName: String(data.get("displayName") ?? ""), email: String(data.get("email") ?? ""), password: String(data.get("password") ?? ""), acknowledged: data.get("acknowledged") === "on" });
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível ativar. Tente novamente." }; }
  redirect("/login?convite=ativado");
}
