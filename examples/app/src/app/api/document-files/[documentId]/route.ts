import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { readDocumentFileForTenant } from "@/lib/document-store";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const access = await getCurrentTenantAccess("documents.read");
  if (!access.authenticated || !access.context) return new Response("Não encontrado", { status: 404 });
  const { documentId } = await context.params;
  const file = readDocumentFileForTenant(documentId, access.context.tenant.id);
  if (!file) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": "attachment; filename=\"documento.pdf\"",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
