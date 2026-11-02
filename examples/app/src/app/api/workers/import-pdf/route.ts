import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { extractWorkersFromPdfBuffer } from "@/lib/worker-pdf-extractor";

export async function POST(req: NextRequest) {
  const access = await getCurrentTenantAccess("workers.manage");
  if (!access.authenticated) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!access.context) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Apenas PDF é aceito" }, { status: 400 });
  if (file.size < 8 || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "O PDF deve ter até 15 MB." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (Buffer.from(bytes).subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: "O arquivo não parece ser um PDF válido." }, { status: 400 });
  const extracted = await extractWorkersFromPdfBuffer(bytes);

  return NextResponse.json({ ok: true, extracted: { companyName: extracted.companyName, workers: extracted.workers.filter(worker=>worker.name).map(({id,name,role,department})=>({id,name,role,department})) } }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
}
