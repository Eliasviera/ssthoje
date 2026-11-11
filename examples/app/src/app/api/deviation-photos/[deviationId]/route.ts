import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { readDeviationPhotoForViewer } from "@/lib/deviation-store";

export async function GET(_request: Request, context: { params: Promise<{ deviationId: string }> }) {
  const access = await getCurrentTenantAccess("deviation.report");
  if (!access.authenticated || !access.context) return new Response("Não encontrado", { status: 404 });
  const { deviationId } = await context.params;
  const canManage = (await getCurrentTenantAccess("deviation.manage")).context !== null;
  const file = readDeviationPhotoForViewer({
    tenantId: access.context.tenant.id,
    id: deviationId,
    viewer: { userId: access.session.userId, canManage },
  });
  if (!file) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
