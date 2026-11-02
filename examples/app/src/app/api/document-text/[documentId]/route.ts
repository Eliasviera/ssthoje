import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { readDocumentFileForTenant } from "@/lib/document-store";
import { extractFullPdfText } from "@/lib/pdf-full-text";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const access = await getCurrentTenantAccess("documents.read");
  if (!access.authenticated || !access.context) return new Response("Não encontrado", { status: 404 });
  const { documentId } = await context.params;
  const file = readDocumentFileForTenant(documentId, access.context.tenant.id);
  if (!file) return new Response("Não encontrado", { status: 404 });
  try {
    const result = await extractFullPdfText(file.bytes);
    const text = [`Texto extraído de ${result.pageCount} páginas. Confira tabelas, imagens e assinaturas no PDF original.`, `SHA-256: ${result.sha256}`, ...result.pages.map(page => `\n=== Página ${page.number} ===\n${page.status === "text" ? page.text : page.status === "failed" ? "[FALHA DE EXTRAÇÃO: consultar original]" : "[SEM TEXTO SELECIONÁVEL: consultar original / OCR]"}`)].join("\n");
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="documento-texto-integral.txt"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Não foi possível extrair o texto. Consulte o PDF original.", { status: 422, headers: { "Cache-Control": "private, no-store" } }); }
}
