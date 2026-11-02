"use server";
import { getSession } from "@/lib/session";
import { changeOperationsPolicy,openOperationsIncident,advanceOperationsIncident } from "@/lib/operations-governance";
import { revalidatePath } from "next/cache";
export async function governanceAction(_state:{message:string},data:FormData){
  const session=await getSession();if(!session)return {message:"Entre novamente."};
  try{const field=(name:string)=>{const v=data.get(name);if(typeof v!=="string"||v.length>600)throw new Error("Confira os campos.");return v;};
    const why=field("reason"),op=field("operation");
    const integer=(name:string)=>{const v=field(name);if(!/^\d{1,6}$/.test(v))throw new Error("Confira os números.");return Number(v);};
    if(op==="policy")changeOperationsPolicy(session.userId,integer("revision"),integer("days"),data.get("hold")==="on",why);
    else if(op==="incident")openOperationsIncident(session.userId,field("title"),why);
    else if(op==="advance"){const next=field("next");if(next!=="investigating"&&next!=="resolved")throw new Error("Estado inválido.");advanceOperationsIncident(session.userId,field("id"),integer("revision"),next,why);}
    else throw new Error("Operação inválida.");
    revalidatePath("/master/governanca");return {message:"Registro fictício salvo com histórico. Nenhum dado foi apagado."};
  }catch(e){return {message:e instanceof Error?e.message:"Não foi possível registrar."};}
}
