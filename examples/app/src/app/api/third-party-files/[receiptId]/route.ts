import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { readThirdPartyPdf } from "@/lib/third-party-service";
export async function GET(_request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const access = await getCurrentTenantAccess("thirdparty.read");
  if (!access.authenticated || !access.context) return new Response("Acesso não autorizado.", { status: 403 });
  try {
    const { receiptId } = await params;
    const file = readThirdPartyPdf(access.session.userId, receiptId);
    if (!file) return new Response("Documento indisponível.", { status: 404 });
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="documento-ficticio.pdf"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Documento indisponível.", { status: 404 }); }
}
