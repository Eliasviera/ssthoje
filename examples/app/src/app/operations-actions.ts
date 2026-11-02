"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { setOperationalDeadline, setNotificationPreferences, markOperationalNoticeRead } from "@/lib/operations-service";
import type { OperationalCategory } from "@/lib/operations-store";
export type OperationsState = { error?: string; success?: string };
function field(data: FormData, key: string, max: number) { const value = data.get(key); if (typeof value !== "string" || value.length > max) throw new Error("Confira os campos e tente novamente."); return value.trim(); }
export async function changeOperationsAction(data: FormData): Promise<OperationsState> {
  const access = await getCurrentTenantAccess("operations.read");
  if (!access.authenticated || !access.context) return { error: "Painel operacional não autorizado." };
  try {
    const operation = field(data, "operation", 20), userId = access.session.userId;
    if (operation === "deadline") setOperationalDeadline(userId, field(data, "taskKey", 200), field(data, "dueOn", 10), field(data, "reason", 600));
    else if (operation === "preferences") {
      const categories = data.getAll("categories"); if (categories.some(c => typeof c !== "string")) throw new Error("Confira as categorias.");
      setNotificationPreferences(userId, { enabled: data.get("enabled") === "yes", lookaheadDays: Number(field(data, "lookaheadDays", 2)), categories: categories as OperationalCategory[] });
    } else if (operation === "read") markOperationalNoticeRead(userId, field(data, "noticeId", 64));
    else if (operation !== "refresh") throw new Error("Ação inválida.");
    revalidatePath("/"); return { success: operation === "refresh" ? "Painel atualizado a partir dos registros locais." : "Atualização registrada." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível atualizar o painel." }; }
}
