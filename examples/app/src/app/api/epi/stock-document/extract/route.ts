import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { extractEpiStockDocumentFields } from "@/lib/epi-stock-pdf-extractor";

export async function POST(request: NextRequest) {
  const access = await getCurrentTenantAccess("epi.manage");
  if (!access.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!access.context) return NextResponse.json({ error: "Sem permissão para revisar documentos do estoque." }, { status: 403 });

  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json({ error: "Selecione um arquivo PDF." }, { status: 400 });
  }
  if (file.size < 8 || file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "O PDF deve ter até 15 MB." }, { status: 400 });
  }

  try {
    const extracted = await extractEpiStockDocumentFields(new Uint8Array(await file.arrayBuffer()));
    if (!extracted.hasText) {
      return NextResponse.json({ error: "Este PDF não contém texto selecionável. PDF escaneado exige OCR, ainda não disponível." }, { status: 422 });
    }
    return NextResponse.json({ ok: true, fields: extracted.fields }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o PDF. Confira se o arquivo está íntegro e tente novamente." }, { status: 422 });
  }
}
