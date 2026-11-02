import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listDds } from "@/lib/dds-store";

function decode(dataUrl: string) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

function safe(text: string) {
  return text.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentTenantAccess("dds.read");
  if (!access.context) return new Response("Acesso negado.", { status: access.authenticated ? 403 : 401 });
  const { id } = await params;
  const record = listDds(access.context.tenant.id).find((item) => item.id === id);
  if (!record) return new Response("DDS não encontrado.", { status: 404 });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 800;
  const margin = 40;

  const ensure = (height: number) => {
    if (y - height < 50) { page = pdf.addPage([595, 842]); y = 800; }
  };
  const line = (text: string, size = 10, f: PDFFont = font) => {
    ensure(size + 6);
    page.drawText(safe(text).slice(0, 110), { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 6;
  };

  line("Diálogo Diário de Segurança (DDS)", 16, bold);
  y -= 4;
  line(`Tema: ${record.theme || "(não informado)"}`, 11, bold);
  line(`Data: ${record.heldOn.split("-").reverse().join("/")}   Local: ${record.location}`);
  line(`Responsável (líder/encarregado): ${record.responsible}`);
  line(`Situação: ${record.status === "closed" ? "Encerrado" : "Em coleta"}`);
  if (record.notes) line(`Observações: ${record.notes}`);
  y -= 6;

  if (record.groupPhoto) {
    const photo = await pdf.embedJpg(decode(record.groupPhoto.image));
    const scaled = photo.scaleToFit(300, 200);
    ensure(scaled.height + 24);
    page.drawImage(photo, { x: margin, y: y - scaled.height, width: scaled.width, height: scaled.height });
    y -= scaled.height + 6;
    line(`Foto do grupo registrada em ${new Date(record.groupPhoto.capturedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`, 8);
  }
  y -= 6;

  const drawSignature = async (name: string, signature?: { image: string; signedAt: string }) => {
    ensure(46);
    page.drawText(safe(name).slice(0, 60), { x: margin, y: y - 14, size: 10, font });
    if (signature) {
      const image = await pdf.embedPng(decode(signature.image));
      const scaled = image.scaleToFit(160, 36);
      page.drawImage(image, { x: 300, y: y - 36, width: scaled.width, height: scaled.height });
      page.drawText(new Date(signature.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), { x: 470, y: y - 14, size: 7, font });
    } else {
      page.drawText("sem assinatura", { x: 300, y: y - 14, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    }
    y -= 44;
  };

  line("Responsável", 11, bold);
  await drawSignature(record.responsible, record.responsibleSignature);
  line("Participantes", 11, bold);
  for (const attendee of record.attendees) {
    await drawSignature(`${attendee.workerName}${attendee.registered ? "" : " (não cadastrado)"}`, attendee.signature);
  }

  y -= 6;
  line("Assinaturas simples desenhadas na tela, sem validade de assinatura qualificada (ICP-Brasil).", 8);
  line("Documento gerado pelo SST HOJE. Revisão humana necessária; não substitui avaliação do responsável técnico.", 8);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dds-${record.heldOn}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
