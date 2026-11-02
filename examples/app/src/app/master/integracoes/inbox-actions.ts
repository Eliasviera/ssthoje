"use server";
import { getSession } from "@/lib/session";
import { exerciseAsaasInbox } from "@/lib/asaas-inbox";
import { revalidatePath } from "next/cache";
export async function inboxAction(_state: {message:string}, data:FormData) {
  const session=await getSession(); if(!session) return {message:"Entre novamente."};
  try { const op=data.get("operation"); if(op!=="new" && op!=="replay") throw new Error("Operação inválida."); const duplicate=exerciseAsaasInbox(session.userId,op==="replay"); revalidatePath("/master/integracoes"); return {message:duplicate ? "Reenvio reconhecido no armazenamento. Nenhum novo evento criado." : "Evento fictício persistido. Nenhuma cobrança alterada."}; }
  catch(e) { return {message:e instanceof Error ? e.message : "Falha ao registrar."}; }
}
