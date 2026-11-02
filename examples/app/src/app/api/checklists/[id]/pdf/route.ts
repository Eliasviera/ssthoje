import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listInspections } from "@/lib/checklist-store";
import { listClientCompanies } from "@/lib/client-service";

const kindLabel = { area: "Checklist de área", equipment: "Checklist de equipamento" } as const;
const answerLabel = { ok: "Conforme", nok: "NÃO CONFORME", na: "Não se aplica" } as const;

function safe(text: string) {
  return text.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentTenantAccess("checklist.read");
  if (!access.context) return new Response("Acesso negado.", { status: access.authenticated ? 403 : 401 });
  const tenantId = access.context.tenant.id;
  const { id } = await params;
  const inspection = listInspections(tenantId).find((item) => item.id === id);
  if (!inspection) return new Response("Inspeção não encontrada.", { status: 404 });
  const company = (await listClientCompanies(tenantId)).find((item) => item.id === inspection.companyId);
  const unit = company?.units.find((item) => item.id === inspection.unitId);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 800;
  const margin = 40;
  const ensure = (height: number) => {
    if (y - height < 50) { page = pdf.addPage([595, 842]); y = 800; }
  };
  const line = (text: string, size = 10, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    ensure(size + 6);
    page.drawText(safe(text).slice(0, 110), { x: margin, y, size, font: f, color });
    y -= size + 6;
  };

  line(`${kindLabel[inspection.kind]}: ${inspection.templateName}`, 15, bold);
  y -= 4;
  line(`Objeto inspecionado: ${inspection.subject}`, 11, bold);
  line(`Empresa: ${company?.tradeName || company?.legalName || "-"}   Unidade: ${unit?.name ?? "-"}`);
  line(`Data: ${inspection.performedOn.split("-").reverse().join("/")}   Inspetor: ${inspection.inspector}`);
  const nok = inspection.results.filter((result) => result.answer === "nok").length;
  line(`Itens não conformes: ${nok} de ${inspection.results.length}`, 10, bold);
  y -= 6;

  for (const result of inspection.results) {
    line(`${result.text}`, 10, bold);
    line(`   ${answerLabel[result.answer]}${result.note ? ` - ${result.note}` : ""}`, 9, font, result.answer === "nok" ? rgb(0.7, 0.1, 0.1) : rgb(0.2, 0.2, 0.2));
  }

  y -= 10;
  ensure(60);
  line("Assinatura do inspetor", 10, bold);
  const signature = await pdf.embedPng(Buffer.from(inspection.signature.image.slice(inspection.signature.image.indexOf(",") + 1), "base64"));
  const scaled = signature.scaleToFit(180, 40);
  ensure(scaled.height + 14);
  page.drawImage(signature, { x: margin, y: y - scaled.height, width: scaled.width, height: scaled.height });
  y -= scaled.height + 6;
  line(`Assinado em ${new Date(inspection.signature.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`, 8);
  y -= 6;
  line("Assinatura simples desenhada na tela, sem validade de assinatura qualificada (ICP-Brasil).", 8);
  line("Documento gerado pelo SST HOJE. Itens não conformes devem ser tratados em Não conformidades, com revisão humana.", 8);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="checklist-${inspection.performedOn}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
