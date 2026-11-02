import "server-only";

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { WorkerPdfImportResult, ImportedWorker } from "./worker-pdf-import";

async function parsePdf(buffer: Buffer): Promise<{ text: string; info?: {Title?:string} }> {
  try {
    const imported:unknown=await import("pdf-parse");
    const pdfParse=(imported as {default:(input:Buffer)=>Promise<{text?:string;info?:{Title?:string}} >}).default;
    const data = await pdfParse(buffer);
    return { text: data.text || "", info: data.info };
  } catch {
    return { text: buffer.toString("latin1"), info: {} };
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

export async function extractWorkersFromPdf(filePath: string): Promise<WorkerPdfImportResult> {
  const buffer = readFileSync(filePath);
  return extractWorkersFromPdfBuffer(buffer);
}

export async function extractWorkersFromPdfBuffer(input: Uint8Array): Promise<WorkerPdfImportResult> {
  const buffer = Buffer.from(input);
  const data = await parsePdf(buffer);
  const text = data.text || "";

  const workers: ImportedWorker[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\n|\r/);

  // Find header
  let headers: string[] = [];
  let headerIndex = -1;
  for (let i = 0; i < Math.min(100, lines.length); i++) {
    const normalized = lines[i].replace(/\t/g, " | ");
    const parts = normalized.split(/\s{2,}|\t|\|/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const lowerParts = parts.map((p) => p.toLowerCase());
    if (
      lowerParts.some((p) => p.includes("matr")) &&
      (lowerParts.some((p) => p.includes("nome")) || lowerParts.some((p) => p.includes("cargo")) || lowerParts.some((p) => p.includes("função")))
    ) {
      headers = parts;
      headerIndex = i;
      break;
    }
    if (lowerParts.some((p) => p.includes("nome")) && lowerParts.some((p) => p.includes("cpf")) && parts.length >= 3) {
      headers = parts;
      headerIndex = i;
      break;
    }
    if (lowerParts.some((p) => p.includes("nome")) && (lowerParts.some((p) => p.includes("cargo")) || lowerParts.some((p) => p.includes("função"))) && parts.length >= 2) {
      headers = parts;
      headerIndex = i;
      break;
    }
  }

  const getHeaderIndex = (keywords: string[]) => {
    if (headers.length === 0) return -1;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase();
      if (keywords.some((k) => h.includes(k))) return i;
    }
    return -1;
  };

  const matIdx = getHeaderIndex(["matr", "chapa", "registro", "cod"]);
  const nomeIdx = getHeaderIndex(["nome"]);
  const cargoIdx = getHeaderIndex(["cargo", "função", "funcao", "descrição do cargo", "posto"]);
  const setorIdx = getHeaderIndex(["setor", "departamento", "dept", "divisão", "secao"]);
  const admIdx = getHeaderIndex(["admiss", "data adm", "dt adm"]);
  const cpfIdx = getHeaderIndex(["cpf"]);
  const nascIdx = getHeaderIndex(["nasc", "data nasc", "dt nasc", "nascimento", "dt. nasc"]);

  let companyName: string | undefined = undefined;
  const companyMatch = text.match(/Raz[ãa]o Social[:\s]+([^\n\r]+)/i) || text.match(/Empresa[:\s]+([^\n\r]+)/i);
  if (companyMatch?.[1]) companyName = cleanText(companyMatch[1]);

  for (let li = 0; li < lines.length; li++) {
    if (li === headerIndex) continue;
    const rawLine = lines[li];
    const normalized = rawLine.replace(/\t/g, " | ");
    const parts = normalized.split(/\s{2,}|\t|\|/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    const fullLine = cleanText(normalized);
    if (!fullLine) continue;
    const lower = fullLine.toLowerCase();

    if (lower.includes("total") || lower.includes("página") || lower.startsWith("relatório") || lower.includes("razão social") || lower.includes("endereço")) continue;
    if (lower === "empresa") continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (parts[idx]) raw[h] = parts[idx];
    });

    let registration = matIdx >= 0 && parts[matIdx] ? cleanText(parts[matIdx]) : undefined;
    let name = nomeIdx >= 0 && parts[nomeIdx] ? cleanText(parts[nomeIdx]) : undefined;
    let role = cargoIdx >= 0 && parts[cargoIdx] ? cleanText(parts[cargoIdx]) : undefined;
    const department = setorIdx >= 0 && parts[setorIdx] ? cleanText(parts[setorIdx]) : undefined;
    let admissionDate = admIdx >= 0 && parts[admIdx] ? cleanText(parts[admIdx]) : undefined;
    let cpf = cpfIdx >= 0 && parts[cpfIdx] ? cleanText(parts[cpfIdx]) : undefined;
    let birthDate = nascIdx >= 0 && parts[nascIdx] ? cleanText(parts[nascIdx]) : undefined;

    if (headers.length === 0) {
      for (let p = 0; p < parts.length; p++) {
        const part = cleanText(parts[p]);
        if (!part) continue;
        if (!registration && /^\d{3,}$/.test(part.replace(/\D/g, "")) && part.length < 12) registration = part;
        if (!cpf && /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(part)) cpf = part;
        if (!birthDate && /\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(part) && !admissionDate) birthDate = part;
        else if (!admissionDate && /\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(part)) admissionDate = part;
        if (!name && /^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ]+(\s+[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ]+)+$/.test(part)) name = part;
        if (!role && /(assistente|auxiliar|analista|coordenador|gerente|supervisor|operador|técnico|técnica|eletricista|mecânico|soldador|caldeireiro|almoxarife|motorista|vigia|porteiro|secretária|recepcionista|engenheiro|estagiário|aprendiz|encarregado|líder|chefe)/i.test(part) && part.length < 90) role = part;
      }
    } else {
      if (!cpf) {
        for (const v of Object.values(raw)) {
          if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(v)) { cpf = cleanText(v); break; }
        }
      }
      if (!birthDate) {
        for (const [k, v] of Object.entries(raw)) {
          if (/nasc/i.test(k) && /\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(v)) { birthDate = cleanText(v); break; }
        }
      }
      if (!admissionDate) {
        for (const [k, v] of Object.entries(raw)) {
          if (/admiss/i.test(k) && /\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(v)) { admissionDate = cleanText(v); break; }
        }
      }
    }

    if (cpf && !raw["CPF"]) raw["CPF"] = cpf;
    if (birthDate && !raw["Data de Nascimento"]) raw["Data de Nascimento"] = birthDate;
    if (admissionDate && !raw["Admissão"]) raw["Admissão"] = admissionDate;
    if (role && !raw["Cargo/Função"]) raw["Cargo/Função"] = role;

    if (!name && !role && !registration) continue;
    if (name && (name.toLowerCase().includes("total") || name.toLowerCase().includes("página"))) continue;

    const key = `${registration || ""}|${cpf || ""}|${name || ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    workers.push({
      id: randomUUID(),
      registration,
      name,
      cpf,
      birthDate,
      role,
      function: role,
      department,
      sector: department,
      admissionDate,
      raw,
    });
  }

  return {
    fileId: randomUUID(),
    fileName: data.info?.Title || "Lista_Colaboradores.pdf",
    companyName,
    workers: workers.slice(0, 1000),
  };
}
