import "server-only";

import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PgrPdfImportResult } from "./pgr-pdf-import";

const require = createRequire(join(process.cwd(), "package.json"));

type PdfParseResult = { text?: string; info?: { Title?: string } };
type PdfTextItem = { str?: string; transform?: number[] };
type PdfPageData = { getTextContent: (options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{ items: PdfTextItem[] }> };
type PdfParse = (buffer: Buffer, options?: { pagerender: (page: PdfPageData) => Promise<string> }) => Promise<PdfParseResult>;

async function renderPdfPage(page: PdfPageData): Promise<string> {
  const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: true });
  const items = content.items
    .filter((item) => typeof item.str === "string" && item.str.trim() && typeof item.transform?.[4] === "number" && typeof item.transform[5] === "number")
    .map((item) => ({ str: item.str!, x: item.transform![4], y: item.transform![5] }))
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const rows: Array<{ y: number; items: typeof items }> = [];
  for (const item of items) {
    const row = rows.at(-1);
    if (!row || Math.abs(row.y - item.y) >= 2.5) rows.push({ y: item.y, items: [item] });
    else row.items.push(item);
  }
  return rows.map((row) => row.items.sort((left, right) => left.x - right.x).map((item) => item.str).join(" ")).join("\n");
}

async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  try {
    const pdfParse = require("pdf-parse") as PdfParse;
    const data = await pdfParse(buffer, { pagerender: renderPdfPage });
    return { text: data.text || "", info: data.info };
  } catch {
    return { text: "", info: {} };
  }
}

function cleanText(s: string): string {
  if (!s) return "";
  return s
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[�]+/g, " ")
    .trim();
}

function extractCnpj(text: string): string | undefined {
  const m = text.match(/CNPJ\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2})\b/i);
  return m?.[1];
}

function extractRazao(text: string): string | undefined {
  const m = text.match(/Raz[ãa]o\s+social\s*:?\s*([^\r\n]{2,160}?)(?=\s*(?:Nome\s+fantasia|Unidade|CNPJ|Munic[ií]pio\/UF|Endere[çc]o)|$)/i);
  if (m?.[1] && !/^(?:Resp\.?|Respons[áa]vel|Fun[çc][ãa]o|CPF)\b/i.test(m[1].trim())) return cleanText(m[1]);
  const companyAfterCnpj = text.match(/CNPJ\s*:?\s*([^\r\n]{5,180}?)\s*Raz[ãa]o\s+Social/i)?.[1];
  const legalSuffix = companyAfterCnpj?.match(/([\p{L}\p{N}][\p{L}\p{N} .,&'’\/-]{3,140}\b(?:LTDA|S\.?\s*A\.?|EIRELI|ME|EPP)\b)/iu);
  if (legalSuffix?.[1]) return cleanText(legalSuffix[1]);
  const m2 = text.match(/(EMA\s+MAXIBUS[^\n\r]{2,140}?\bLTDA|METAL[ÚU]RGICA[^\n\r]{2,140}?\bLTDA|[A-Z][A-Z\s]+\bLTDA)\b/i);
  if (m2?.[0]) return cleanText(m2[0]);
  const m3 = text.match(/Cliente[:\s]+([^\n\r]+?)(?=\s+Ambiente|\s+Posto|\s+$)/i);
  if (m3?.[1]) return cleanText(m3[1]);
  return undefined;
}

function extractRevision(text: string): string {
  // Avoid grabbing long numbers like phone/registration numbers
  const m = text.match(/(?:Vers[ãa]o|Revis[ãa]o|Rev\.?)\s*:?\s*(0*[1-9]\d{0,2})\b/i);
  if (m?.[1] && m[1].length <= 3) return `Rev. ${m[1].replace(/^0+/, "") || "01"}`;
  return "Rev. 01";
}

function extractTitle(text: string): string {
  const m = text.match(/PROGRAMA DE GERENCIAMENTO DE RISCOS|PGR/i);
  if (m) {
    const razao = extractRazao(text);
    if (razao) return `PGR - ${razao}`;
  }
  return "PGR Importado";
}

function extractCityState(text: string): { city?: string; state?: string } {
  const labeled = text.match(/Cidade\s*\/\s*UF\s*[:\-]?\s*([\p{L}][\p{L} .'-]{1,70}?)\s*[-/]\s*([A-Z]{2})\b/iu)
    ?? text.match(/Munic[ií]pio\s*\/\s*UF\s*[:\-]?\s*([\p{L}][\p{L} .'-]{1,70}?)\s+([A-Z]{2})(?=\s+(?:Efetivo\b|CNPJ\b|$))/iu)
    ?? text.match(/(?:Munic[ií]pio|Cidade)\s*[:\-]?\s*([^\r\n,;|]{2,80}?)\s*(?:[-/]\s*|,\s*(?:UF\s*[:\-]?\s*)?)([A-Z]{2})\b/i);
  if (!labeled) return {};
  return { city: cleanText(labeled[1]), state: labeled[2].toUpperCase() };
}

function extractUnitName(text: string): string | undefined {
  const labeled = text.match(/(?:Unidade|Estabelecimento)(?:\s+(?:de\s+trabalho|operacional))?\s*[:\-]\s*([^\r\n|]{2,100}?)(?=\s*(?:CNPJ|Munic[ií]pio\/UF|Munic[ií]pio|Endere[çc]o)|$)/i);
  if (labeled?.[1]) return cleanText(labeled[1]);
  const compactLabel = text.match(/(?:^|\s)Unidade([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][^\r\n|]{1,80}?)(?=\s*(?:CNPJ|Munic[ií]pio\/UF|Munic[ií]pio|Endere[çc]o)|$)/i);
  return compactLabel?.[1] ? cleanText(compactLabel[1]) : undefined;
}

function extractTradeName(text: string): string | undefined {
  const match = text.match(/(?:Nome\s+Fantasia|Nome\s+Comercial)\s*[:\-]?\s*([^\r\n]{2,120}?)(?=\s*(?:Unidade|CNPJ|Munic[ií]pio\/UF|Endere[çc]o)|$)/i);
  return match?.[1] ? cleanText(match[1]) : undefined;
}

function extractReportedInventoryRisks(text: string): PgrPdfImportResult["risks"] {
  const inventoryStart = text.search(/6\.\s*Invent[áa]rio de riscos ocupacionais/i);
  if (inventoryStart < 0) return [];
  const inventoryEndMatch = /7\.\s*Plano de a[çc][ãa]o/i.exec(text.slice(inventoryStart));
  const inventoryText = text.slice(inventoryStart, inventoryEndMatch ? inventoryStart + inventoryEndMatch.index : undefined);
  const reportPattern = /Relato recebido\s*:\s*/gi;
  const markers = [...inventoryText.matchAll(reportPattern)];
  const risks: PgrPdfImportResult["risks"] = [];

  markers.forEach((marker, index) => {
    const reportStart = marker.index! + marker[0].length;
    const nextMarkerStart = markers[index + 1]?.index ?? inventoryText.length;
    let reportEnd = nextMarkerStart;
    const elementTable = inventoryText.slice(reportStart, nextMarkerStart).search(/Elemento\s*Registro\s*\/\s*valida[çc][ãa]o necess[áa]ria/i);
    if (elementTable >= 0) reportEnd = reportStart + elementTable;
    const report = cleanText(inventoryText.slice(reportStart, reportEnd));
    if (!report) return;

    const before = inventoryText.slice(0, marker.index!);
    const headingLines = before.split(/\r?\n/).map((line) => cleanText(line)).filter((line) =>
      line && !/^PGR\s*[-·]/i.test(line) && !/^PROGRAMA DE GERENCIAMENTO DE RISCOS/i.test(line) && !/^6\.\s*Invent[áa]rio/i.test(line));
    let activity = headingLines.at(-1) ?? "";
    const previousLine = headingLines.at(-2) ?? "";
    if (/^[a-záàâãéèêíïóôõöúç]/.test(activity) && previousLine && !/[.!?:;]$/.test(previousLine)) {
      activity = `${previousLine} ${activity}`;
    }
    activity = cleanText(activity).slice(0, 300);
    if (!activity || activity.length < 2) return;

    const explicitHazards = report.match(/Perigos?\s*:\s*([\s\S]*?)(?=\s*(?:Controles (?:relatados|indicados|informados)|Verificar|Avalia[çc][ãa]o informada|Classifica[çc][ãa]o informada|Frequ[êe]ncia|$))/i);
    const firstSentenceEnd = report.search(/\.\s+(?=[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ])/);
    const hazard = cleanText(explicitHazards?.[1] ?? (firstSentenceEnd >= 0 ? report.slice(0, firstSentenceEnd + 1) : report)).slice(0, 3000);
    const controls = report.match(/Controles (?:relatados|indicados|informados)\s*:\s*([\s\S]*?)(?=\s*(?:Verificar|Avalia[çc][ãa]o informada|Classifica[çc][ãa]o informada|Frequ[êe]ncia|$))/i);
    const existingMeasures = controls?.[1]
      ? cleanText(controls[1]).split(/;\s*/).map((measure) => measure.trim()).filter(Boolean).slice(0, 20)
      : [];

    risks.push({
      id: randomUUID(),
      activity,
      hazard,
      sourceCircumstance: report,
      possibleHarm: undefined,
      existingMeasures,
    });
  });

  return risks.slice(0, 80);
}

function extractFunctionInventoryRisks(text: string): PgrPdfImportResult["risks"] {
  const tableStartMatch = /(?:IV\.|4\.)\s*Invent[áa]rio de riscos ocupacionais\s*[-—]\s*por fun[çc][ãa]o/i.exec(text);
  if (!tableStartMatch) return [];
  const start = tableStartMatch.index + tableStartMatch[0].length;
  const nextSection = /\n\s*(?:V\.|5\.)\s+/i.exec(text.slice(start));
  const table = text.slice(start, nextSection ? start + nextSection.index : undefined);
  const rolePattern = /^(Eletricista de Força\s+e Controle|Operador de Munck|Ajudante Geral|Mecânico|Soldador|Caldeireiro|Administrador)\s*/gim;
  const matches = [...table.matchAll(rolePattern)];
  const risks: PgrPdfImportResult["risks"] = [];

  matches.forEach((match, index) => {
    const contentStart = match.index! + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? table.length;
    const row = cleanText(table.slice(contentStart, contentEnd));
    if (!row) return;
    const probabilityIndex = row.search(/\bProb\s*:/i);
    const hazard = cleanText(probabilityIndex >= 0 ? row.slice(0, probabilityIndex) : row).slice(0, 3000);
    const measuresMatch = row.match(/(?:Intolerável|Indesejado|Tolerável|Aceitável|Moderado|Alto|Médio|Baixo)\s*(.+)$/i);
    const existingMeasures = measuresMatch?.[1] ? [cleanText(measuresMatch[1]).slice(0, 1000)] : [];
    if (!hazard) return;

    risks.push({
      id: randomUUID(),
      activity: cleanText(match[1]).slice(0, 300),
      hazard,
      sourceCircumstance: row.slice(0, 3000),
      possibleHarm: undefined,
      existingMeasures,
      role: cleanText(match[1]).slice(0, 200),
    });
  });

  return risks.slice(0, 80);
}

function extractEmaMaxibusRisks(text: string): { risks: PgrPdfImportResult["risks"]; truncated: boolean } {
  const sections = text.split(/Perigos\s*\/\s*fatores de riscos e riscos\s*:/i).slice(1);
  const risks: PgrPdfImportResult["risks"] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const activity = section.match(/Posto\s*\/\s*Atividade\s+([^\r\n]+)/i)?.[1];
    const hazard = section.match(/(?:^|\n)Perigo\s+([^\r\n]+)/i)?.[1];
    if (!activity || !hazard) continue;
    const cleanedActivity = cleanText(activity);
    const cleanedHazard = cleanText(hazard);
    if (cleanedActivity.length < 2 || cleanedActivity.length > 300 || cleanedHazard.length < 3 || cleanedHazard.length > 3000) continue;
    if (/^(?:Ambiente de Trabalho|Perigos?\/fatores|Perigos? e riscos)$/i.test(cleanedActivity)) continue;

    const measure = section.match(/Medidas de preven[çc][ãa]o existentes\s*\nTipo\s+Descri[çc][ãa]o\s+Eficaz\s*\n([^\r\n]+)/i)?.[1];
    const source = section.match(/Fonte Geradora\s+Meio Propag\.\s*\n([^\r\n]+)/i)?.[1];
    const circumstance = section.match(/Circunst[âa]ncia\s+Descri[çc][ãa]o dos riscos gerados pelo perigo\s*\n([^\r\n]+)/i)?.[1];
    const exposureRow = section.match(/Tempo exp\.\s+Frequ[êe]ncia\s+Agravos a Sa[úu]de\s*\n([^\r\n]+)/i)?.[1];
    const possibleHarm = exposureRow?.replace(/^(?:Di[áa]rio|Semanal|Mensal|Anual|Eventual|Permanente)\s+/i, "").trim();
    const reportParts = [
      source ? `Fonte geradora / meio de propagação: ${cleanText(source)}` : "",
      circumstance ? `Circunstância informada: ${cleanText(circumstance)}` : "",
      exposureRow ? `Tempo, frequência e agravos informados: ${cleanText(exposureRow)}` : "",
    ].filter(Boolean);
    const measureText = measure
      ? cleanText(measure).replace(/^(?:Med\.Adm\.|EPI|EPC|Engenharia)\s*/i, "").replace(/\s+(?:SIM|NÃO|NAO)$/i, "")
      : "";
    const key = `${cleanedActivity.toLowerCase()}|${cleanedHazard.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    risks.push({
      id: randomUUID(),
      activity: cleanedActivity,
      hazard: cleanedHazard,
      sourceCircumstance: reportParts.join("\n").slice(0, 3000),
      possibleHarm: possibleHarm ? cleanText(possibleHarm).slice(0, 3000) : undefined,
      existingMeasures: measureText ? [measureText.slice(0, 1000)] : [],
      role: cleanedActivity.slice(0, 200),
    });
  }

  return { risks: risks.slice(0, 80), truncated: risks.length > 80 };
}

export async function extractPgrFromPdfBuffer(input: Uint8Array): Promise<PgrPdfImportResult> {
  const buffer = Buffer.from(input);
  const data = await parsePdf(buffer);
  const text = data.text || "";

  const cnpj = extractCnpj(text);
  const legalName = extractRazao(text);
  const tradeName = extractTradeName(text);
  const revision = extractRevision(text);
  const title = extractTitle(text);

  let risks: PgrPdfImportResult["risks"] = [];
  let risksTruncated = false;

  // Try EMA MAXIBUS format first (tables by Posto/Atividade)
  if (/Posto\s*\/\s*Atividade/i.test(text) && /Medidas de preven[çc][ãa]o/i.test(text)) {
    const extracted = extractEmaMaxibusRisks(text);
    risks = extracted.risks;
    risksTruncated = extracted.truncated;
  }

  if (risks.length === 0) risks = extractReportedInventoryRisks(text);

  if (risks.length === 0) risks = extractFunctionInventoryRisks(text);

  // If not found, try generic pattern matching for PGR tables
  if (risks.length === 0) {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const l = cleanText(line);
      if (!l) continue;
      if (l.toLowerCase().includes("função") && l.toLowerCase().includes("perigo")) continue;
      if (l.toLowerCase().includes("razão social") || l.toLowerCase().includes("cnpj")) continue;
      if (l.toLowerCase().includes("matrícula") || l.toLowerCase().includes("nome do colaborador") || l.toLowerCase().includes("data de nascimento")) continue;

      if (/(mecânico|eletricista|soldador|caldeireiro|operador|ajudante|administrador|encarregado|técnico|aprendiz|auxiliar|servente|pedreiro)/i.test(l) && l.length > 15) {
        const hazardMatch = l.match(/(Choque|Ruído|Fumos|Trabalho em Espaço|Tombamento|Esforço|Postura|Projeção|Prensagem|Escorregamento|Queda|Incêndio|Explosão)[^,.;]*/i);
        if (!hazardMatch) continue;
        const hazard = hazardMatch[0].trim();
        const measures = l.match(/(Uso de|Desenergização|Máscara|Emissão|Inspeção|Treinamento|Adequação|Orientação|EPI)[^.;]*/gi) || [];

        risks.push({
          id: randomUUID(),
          activity: l.slice(0, hazardMatch.index).trim().slice(0, 80) || l.substring(0, 80).trim(),
          hazard,
          possibleHarm: undefined,
          existingMeasures: measures.slice(0, 5).map((m) => cleanText(m)),
        });
      }
    }
  }

  const location = extractCityState(text);
  const unitName = extractUnitName(text);
  const notices: string[] = [];
  const readableText = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (text.trim().length < 80 || readableText / Math.max(text.length, 1) < 0.25) notices.push("O PDF parece não conter texto selecionável. Se for um documento digitalizado, os dados não foram reconhecidos automaticamente.");
  if (risksTruncated) notices.push("O PDF contém mais itens de risco do que a pré-visualização comporta. Foram trazidos os primeiros 80; confira o documento original para completar o inventário.");
  if (risks.length === 0) notices.push("Nenhum risco foi reconhecido com segurança. Não foram preenchidos riscos de exemplo; confira o PGR manualmente.");

  return {
    fileId: randomUUID(),
    fileName: data.info?.Title || "PGR.pdf",
    company: {
      legalName,
      tradeName,
      cnpj,
      ...location,
    },
    unit: {
      name: unitName,
    },
    inventory: {
      title,
      revision: revision === "Rev. 01" && !/(?:Vers[ãa]o|Revis[ãa]o|Rev\.?)/i.test(text) ? "Não identificada" : revision,
    },
    risks: risks.slice(0, 80),
    notices,
  };
}
