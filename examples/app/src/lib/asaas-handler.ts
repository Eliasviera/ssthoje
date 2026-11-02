import { asaasConfig, asaasReady, authenticateAsaas, InboxError, receiveAsaas } from "./asaas-inbox.ts";
export async function handleAsaasWebhook(request: Request) {
  const c=asaasConfig();
  if(!asaasReady(c)) return Response.json({error:"Receptor sandbox indisponível."},{status:503});
  if(!authenticateAsaas(request.headers.get("asaas-access-token"),c)) return Response.json({error:"Não autorizado."},{status:401});
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({error:"Envie JSON."},{status:415});
  const reader=request.body?.getReader(); if(!reader) return Response.json({error:"Corpo ausente."},{status:400});
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>32768) { await reader.cancel(); return Response.json({error:"Evento excede o limite."},{status:413}); } chunks.push(value); }
    let payload:unknown; try { payload=JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return Response.json({error:"JSON inválido."},{status:400}); }
    const result=receiveAsaas(payload,c,"asaas_sandbox");
    return Response.json({received:true,duplicate:result.duplicate});
  } catch(e) { return Response.json({error:e instanceof InboxError ? e.message : "Não foi possível persistir o evento."},{status:e instanceof InboxError ? e.status : 503}); }
  finally { reader.releaseLock(); }
}
