import { createHash } from "node:crypto";
import parsePdf from "pdf-parse/lib/pdf-parse.js";

type Page = { pageNumber: number; getTextContent(options: object): Promise<{ items: Array<{ str?: string; transform?: number[] }> }> };
export type FullTextPage = { number: number; text: string; status: "text" | "no_text" | "failed" };
export type FullText = { sha256: string; pageCount: number; pages: FullTextPage[] };
type Parser = (bytes: Buffer, options: { max: number; pagerender(page: Page): Promise<string> }) => Promise<{ numpages: number }>;

// No semantic inference or item limit: every physical page remains represented.
export async function extractFullPdfText(bytes: Buffer, parser?: Parser): Promise<FullText> {
  if (bytes.length > 25 * 1024 * 1024 || !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("PDF inválido ou acima de 25 MB.");
  const parse = parser ?? parsePdf as unknown as Parser;
  const pages = new Map<number, FullTextPage>();
  const result = await parse(bytes, { max: 0, async pagerender(page) {
    const number = page.pageNumber;
    if (!Number.isInteger(number) || number < 1) throw new Error("Página sem identificação.");
    try {
      const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let lastY: number | undefined;
      let text = "";
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5];
        text += (text ? y === lastY ? " " : "\n" : "") + item.str;
        lastY = y;
      }
      pages.set(number, { number, text, status: text.trim() ? "text" : "no_text" });
      return text;
    } catch {
      pages.set(number, { number, text: "", status: "failed" });
      return "";
    }
  } });
  if (!Number.isInteger(result.numpages) || result.numpages < 1) throw new Error("Contagem de páginas indisponível.");
  return { sha256: createHash("sha256").update(bytes).digest("hex"), pageCount: result.numpages,
    pages: Array.from({ length: result.numpages }, (_, index) => pages.get(index + 1) ?? { number: index + 1, text: "", status: "failed" }) };
}
