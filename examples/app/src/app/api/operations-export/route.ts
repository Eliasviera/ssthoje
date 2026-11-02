import { getSession } from "@/lib/session";
import { requirePlatformMaster } from "@/lib/platform-service";
import { exportOperationsSnapshot } from "@/lib/operations-governance";
export async function GET(){
  const session=await getSession();if(!session)return Response.json({error:"Entre novamente."},{status:401});
  try{requirePlatformMaster(session.userId);}catch{return Response.json({error:"Acesso exclusivo ao Master."},{status:403});}
  try{return new Response(JSON.stringify(exportOperationsSnapshot(session.userId),null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":'attachment; filename="sst-operacao-ficticia.json"',"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}catch{return Response.json({error:"Exportação indisponível. Aguarde e tente novamente."},{status:503});}
}
