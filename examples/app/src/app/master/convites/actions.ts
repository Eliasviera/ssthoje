"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { manageTrialInvitation } from "@/lib/trial-invite-service";
export type InviteActionState = { error?: string; success?: string; path?: string };
export async function manageInviteAction(_state: InviteActionState, data: FormData): Promise<InviteActionState> {
  const session = await getSession();
  if (!session) return { error: "Entre novamente como Master." };
  try {
    const result = manageTrialInvitation(session.userId, { operation: String(data.get("operation") ?? ""), value: String(data.get("value") ?? "") });
    revalidatePath("/master/convites");
    return { success: "Ação registrada.", path: result.token ? `/convite/${result.token}` : undefined };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar. Tente novamente." }; }
}
