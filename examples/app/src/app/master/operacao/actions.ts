"use server";
import { getSession } from "@/lib/session";
import { enqueueSandboxJob,processSandboxJob,deliverSandboxOutbox,type JobScenario } from "@/lib/job-sandbox";
import { revalidatePath } from "next/cache";
export async function jobAction(_state:{message:string},data:FormData){
  const session=await getSession();if(!session)return {message:"Entre novamente."};
  try{
    const field=(name:string)=>{const value=data.get(name);if(typeof value!=="string"||value.length>600)throw new Error("Confira os campos.");return value;};
    const operation=field("operation");let message:string;
    if(operation==="enqueue"){enqueueSandboxJob(session.userId,field("tenantId"),field("scenario") as JobScenario,field("key"),field("reason"));message="Tarefa fictícia registrada na fila.";}
    else if(operation==="process")message=processSandboxJob(session.userId);
    else if(operation==="deliver")message=deliverSandboxOutbox(session.userId);
    else throw new Error("Operação inválida.");
    revalidatePath("/master/operacao");return {message};
  }catch(e){return {message:e instanceof Error?e.message:"Não foi possível registrar. Atualize a página."};}
}
