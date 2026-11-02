import type { FullText } from "./pdf-full-text";

// Source occurrences only. They never become approved inventory items or people.
export function buildPgrSourceCandidates(source: FullText) {
  const roles: Array<{ role: string; sector?: string; page: number }> = [];
  const riskRows: Array<{ raw: string; page: number }> = [];
  const actionPages: number[] = [];
  const exposurePages: number[] = [];
  for (const page of source.pages) {
    if (page.status !== "text") continue;
    const lines = page.text.split(/\r?\n/).map(line => line.trim());
    // This label arrangement is explicit in this family of PGR reports.
    if (/Caracterização da força de trabalho/i.test(page.text) || lines.some(line => /^.+\s+Setor$/.test(line))) {
      const sector = lines.find(line => /^.+\s+Setor$/.test(line))?.replace(/\s+Setor$/, "");
      for (const line of lines) {
        const match = line.match(/^(.+?)\s+Função$/);
        if (match) roles.push({ role: match[1], sector, page: page.number });
      }
    }
    if (/Classificação dos Riscos/.test(page.text)) {
      for (const line of lines) {
        // Preserve the whole row: columns must be checked against the original.
        if (/^\d+\s+\d+\s*-\s*.+\s+\d+\s*-\s*.+\s+\d+\s*-\s*.+/.test(line)) riskRows.push({ raw: line, page: page.number });
      }
    }
    if (/Ação Recomendada\s*:/.test(page.text)) actionPages.push(page.number);
    if (/Avaliaç[ãa]o Quantitativa|Intensidade\s*\/\s*Concentraç[ãa]o|Limite de Toler[âa]ncia/i.test(page.text)) exposurePages.push(page.number);
  }
  return { roles, riskRows, actionPages, exposurePages };
}
