import "server-only";

export type EpiStockDocumentFields = {
  productName?: string;
  ca?: string;
  quantity?: string;
  sourceReference?: string;
  supplier?: string;
  batchCode?: string;
  productValidUntil?: string;
  unitCost?: string;
};

type PdfParser = (buffer: Uint8Array) => Promise<{ text?: string }>;

const fieldLabels = [
  "descri[cç][aã]o\\s+(?:do\\s+)?produto",
  "produto",
  "C\\.?\\s*A\\.?",
  "quantidade",
  "qtd\\.?",
  "qtde\\.?",
  "nota\\s*fiscal(?:\\s+(?:n[úu]mero|n\\.?\\s*[º°o]?))?",
  "NF-?e?(?:\\s+n\\.?\\s*[º°o]?)?",
  "n[úu]mero\\s+da\\s+nota",
  "documento",
  "refer[eê]ncia",
  "fornecedor",
  "emitente",
  "raz[aã]o\\s+social",
  "lote",
  "batch",
  "validade(?:\\s+(?:do\\s+)?produto)?",
  "vencimento(?:\\s+(?:do\\s+)?produto)?",
  "valor\\s+unit[aá]rio",
  "pre[cç]o\\s+unit[aá]rio",
  "custo\\s+unit[aá]rio",
  "vlr\\.?\\s*un\\.?",
];

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return undefined;
}

function asIsoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : undefined;
}

function labeledLine(text: string, labels: string[]): string | undefined {
  const label = labels.join("|");
  const nextField = fieldLabels.join("|");
  return firstMatch(text, [
    new RegExp(`(?:^|\\s)(?:${label})\\s*[:\\-]\\s*([^\\r\\n]{2,160}?)(?=\\s+(?:${nextField})\\s*[:#\\-]|[\\r\\n]|$)`, "i"),
  ]);
}

export async function extractEpiStockDocumentFields(
  input: Uint8Array,
  parser?: PdfParser,
): Promise<{ fields: EpiStockDocumentFields; hasText: boolean }> {
  if (input.length < 8 || input.length > 15 * 1024 * 1024 || !Buffer.from(input).subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    throw new Error("O arquivo não é um PDF válido ou excede 15 MB.");
  }

  const parse = parser ?? (await import("pdf-parse/lib/pdf-parse.js")).default as PdfParser;
  const result = await parse(Uint8Array.from(input));
  const text = result.text ?? "";
  if (!text.trim()) return { fields: {}, hasText: false };

  const quantity = firstMatch(text, [
    /\b(?:quantidade|qtd\.?|qtde\.?)\s*[:\-]?\s*(\d{1,7})\b/i,
    /\b(\d{1,7})\s*(?:unidades?|un\.?)\b/i,
  ]);
  const dateText = firstMatch(text, [
    /\b(?:validade|vencimento)\s+(?:do\s+)?produto\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
    /\b(?:lote|batch)\s*[:\-]?\s*[A-Z0-9./_-]+\s+(?:validade|vencimento)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
  ]);

  const fields: EpiStockDocumentFields = {
    productName: labeledLine(text, ["descri[cç][aã]o\\s+(?:do\\s+)?produto", "produto"]),
    ca: firstMatch(text, [/\bC\.?\s*A\.?\s*[:#\-]?\s*(\d{1,8})\b/i]),
    quantity,
    sourceReference: firstMatch(text, [
      /\b(?:nota\s*fiscal|NF-?e?|n[úu]mero\s+da\s+nota)\s*(?:(?:n[úu]mero|n\.?\s*[º°o]?)\s*)?[:#\-]?\s*([A-Z0-9./-]{3,30})/i,
      /\b(?:documento|refer[eê]ncia)\s*[:#\-]\s*([A-Z0-9./-]{3,30})/i,
    ]),
    supplier: labeledLine(text, ["fornecedor", "emitente", "raz[aã]o\\s+social"]),
    batchCode: firstMatch(text, [/\b(?:lote|batch)\s*[:#\-]?\s*([A-Z0-9./_-]{2,80})/i]),
    productValidUntil: asIsoDate(dateText),
    unitCost: firstMatch(text, [
      /\b(?:valor|pre[cç]o|custo)\s+unit[aá]rio\s*[:#\-]?\s*(?:R\$\s*)?(\d[\d.]*,\d{1,2}|\d+(?:\.\d{1,2})?)/i,
      /\b(?:vlr\.?|valor)\s+un\.?\s*[:#\-]?\s*(?:R\$\s*)?(\d[\d.]*,\d{1,2}|\d+(?:\.\d{1,2})?)/i,
    ]),
  };
  return { fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)), hasText: true };
}
