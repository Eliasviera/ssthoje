import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { extractPgrFromPdfBuffer } from "@/lib/pgr-pdf-extractor";

export async function POST(req: NextRequest) {
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!access.context) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Apenas PDF é aceito" }, { status: 400 });
  if (file.size === 0 || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "O PDF deve ter entre 1 byte e 25 MB." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return NextResponse.json({ error: "O arquivo enviado não parece ser um PDF válido." }, { status: 400 });
  const extracted = await extractPgrFromPdfBuffer(bytes);

  return NextResponse.json({ ok: true, extracted }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
}
