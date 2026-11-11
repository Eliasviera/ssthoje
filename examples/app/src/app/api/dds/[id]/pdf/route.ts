import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listDdsForAccess } from "@/lib/company-scoped-reads";
import { renderDdsPdf } from "@/lib/dds-pdf-renderer";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentTenantAccess("dds.read");
  if (!access.context) return new Response("Acesso negado.", { status: access.authenticated ? 403 : 401 });
  const { id } = await params;
  const record = listDdsForAccess(access.context).find((item) => item.id === id);
  if (!record) return new Response("DDS não encontrado.", { status: 404 });
  return renderDdsPdf(record);
}
