"use server";
import { getSession } from "@/lib/session";
import { runObjectStorageProbe } from "@/lib/object-storage-probe";
import { revalidatePath } from "next/cache";
export type StorageProbeActionState = { message?: string; success?: boolean };
export async function storageProbeAction(_previous: StorageProbeActionState, data: FormData): Promise<StorageProbeActionState> {
  const session = await getSession();
  if (!session) return { message: "Sua sessão terminou. Entre novamente." };
  if (data.get("acknowledged") !== "on") return { message: "Confirme o envio do arquivo fictício antes de executar." };
  try {
    await runObjectStorageProbe(session.userId);
    revalidatePath("/master/integracoes");
    return { success: true, message: "Verificação concluída: envio e download íntegros, link temporário válido e acesso anônimo negado." };
  } catch { return { message: "Não foi possível concluir. Confira a configuração, aguarde um minuto e consulte o histórico administrativo. Após três tentativas, solicite revisão." }; }
}
