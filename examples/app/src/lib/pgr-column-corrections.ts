import type { enrichPgrProfile } from "./pgr-profile-projection";

export type ColumnCorrections = { schemaVersion: number; method: string; sha256: string;
  corrections: Array<{ page: number; before: Array<string | null>; source: string; propagation: string; anchorX: number; boundaryX: number; crossingWords: Array<{text:string;x0:number;x1:number;top:number}> }> };
const characters = (value: string) => value.replace(/\s+/g, "");

export function isPgrColumnCorrectionVerified(profile: { sha256: string; columnCorrectionProof?: ColumnCorrections }, risk: { page: number; details: Record<string, string | Array<string | null>> }) {
  const proof = profile.columnCorrectionProof;
  if (!proof || proof.sha256 !== profile.sha256 || proof.method !== "printed-header-whole-word-v1" || proof.schemaVersion !== 1) return false;
  const found = proof.corrections.filter(entry => entry.page === risk.page);
  if (found.length !== 1) return false;
  const entry = found[0];
  return risk.details.sourceGenerator === entry.source && risk.details.propagationMedium === entry.propagation
    && JSON.stringify(entry.before) === JSON.stringify(risk.details.sourceAndPropagationRawCells)
    && !!entry.source.trim() && !!entry.propagation.trim()
    && characters(entry.source + entry.propagation) === characters(entry.before.filter(Boolean).join(""))
    && Number.isFinite(entry.anchorX) && Number.isFinite(entry.boundaryX) && entry.crossingWords.length > 0
    && entry.crossingWords.every(word => Number.isFinite(word.x0) && Number.isFinite(word.x1) && Number.isFinite(word.top) && Math.abs(word.x0 - entry.anchorX) <= 1 && word.x0 < entry.boundaryX && entry.boundaryX < word.x1);
}

export function applyPgrColumnCorrections(profile: ReturnType<typeof enrichPgrProfile>, proof: ColumnCorrections) {
  if (proof.schemaVersion !== 1 || proof.method !== "printed-header-whole-word-v1" || proof.sha256 !== profile.sha256) throw new Error("Evidência de colunas incompatível com a origem.");
  const updated = structuredClone(profile);
  const seen = new Set<number>();
  for (const correction of proof.corrections) {
    if (seen.has(correction.page)) throw new Error("Página repetida na evidência de colunas.");
    seen.add(correction.page);
    const matches = updated.risks.filter(risk => risk.page === correction.page);
    if (matches.length !== 1) throw new Error("Ficha de origem ambígua para a correção.");
    const risk = matches[0];
    if (JSON.stringify(risk.details.sourceAndPropagationRawCells) !== JSON.stringify(correction.before)
      || !correction.source.trim() || !correction.propagation.trim()
      || characters(correction.source + correction.propagation) !== characters(correction.before.filter(Boolean).join(""))
      || !Number.isFinite(correction.anchorX) || !Number.isFinite(correction.boundaryX)
      || !correction.crossingWords.length
      || correction.crossingWords.some(word => !Number.isFinite(word.x0) || !Number.isFinite(word.x1) || !Number.isFinite(word.top) || Math.abs(word.x0 - correction.anchorX) > 1 || !(word.x0 < correction.boundaryX && correction.boundaryX < word.x1))) throw new Error("Correção sem conservação de caracteres ou coordenadas verificáveis.");
    risk.details.sourceGenerator = correction.source;
    risk.details.propagationMedium = correction.propagation;
    risk.details.columnCorrectionMethod = proof.method;
  }
  return { ...updated, columnCorrectionProof: proof };
}
