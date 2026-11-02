import {getCurrentTenantAccess} from "@/lib/tenant-context";
import {readEpiInvoicePdf} from "@/lib/epi-stock-store";

export async function GET(_request:Request,{params}:{params:Promise<{itemId:string;movementId:string}>}) {
  const access=await getCurrentTenantAccess("epi.read");
  if(!access.authenticated||!access.context) return new Response("Documento indisponível.",{status:404});
  const {itemId,movementId}=await params;
  const file=readEpiInvoicePdf(access.session.userId,itemId,movementId);
  if(!file) return new Response("Documento indisponível.",{status:404});
  return new Response(new Uint8Array(file.bytes),{headers:{"Content-Type":"application/pdf","Content-Length":String(file.bytes.byteLength),"Content-Disposition":`attachment; filename="documento-estoque.pdf"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
