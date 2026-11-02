"use server";
import { getSession } from "@/lib/session";
import { issueSandboxOtp, verifySandboxOtp } from "@/lib/otp-sandbox";
import { revalidatePath } from "next/cache";
export type OtpState={message:string;issued?:{id:string;code:string;expiresAt:number;tenantId:string}};
export async function otpAction(_state:OtpState,data:FormData):Promise<OtpState> {
  const session=await getSession();if(!session)return {message:"Entre novamente."};
  try {
    const field=(name:string)=>{const v=data.get(name);if(typeof v!=="string"||v.length>100)throw new Error("Confira os campos.");return v;};
    const tenantId=field("tenantId"),operation=field("operation");
    if(operation==="issue"){const issued=issueSandboxOtp(session.userId,tenantId);revalidatePath("/master/integracoes");return {message:"Código fictício gerado nesta tela. Nenhuma mensagem enviada.",issued:{...issued,tenantId}};}
    if(operation!=="verify")throw new Error("Operação inválida.");
    verifySandboxOtp(session.userId,tenantId,field("id"),field("code"));revalidatePath("/master/integracoes");return {message:"Código fictício confirmado e encerrado. Este teste não concede acesso nem confirma entrega de EPI."};
  }catch(e){revalidatePath("/master/integracoes");return {message:e instanceof Error?e.message:"Não foi possível testar o código."};}
}
