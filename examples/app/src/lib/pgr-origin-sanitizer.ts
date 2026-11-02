const PGR_ORIGIN_PATTERNS: RegExp[] = [
  /\bUNIMED(?:\s+SEGUROS|\s+SA[ÚU]DE|\s+PAULISTA)?\b/gi,
  /\bMEDISAN\b/gi,
  /\bPLAMTA\b/gi,
  /\bCONSULTORIA\s+[A-ZÀ-Ú][A-ZÀ-Ú\s]+/gi,
  /ELABORAD[OA]\s+POR[\s:\-–]+[^\n\r.;,]+/gi,
  /CONFECCIONAD[OA]\s+POR[\s:\-–]+[^\n\r.;,]+/gi,
  /REALIZAD[OA]\s+POR[\s:\-–]+[^\n\r.;,]+/gi,
  /PREPARAD[OA]\s+POR[\s:\-–]+[^\n\r.;,]+/gi,
  /RESPONS[AÁ]VEL\s+PELA\s+ELABORA[ÇC][ÃA]O[\s:\-–]+[^\n\r.;,]+/gi,
  /T[ÉE]CNIC[OA]\s+RESPONS[AÁ]VEL(?:\s+PELA\s+ELABORA[ÇC][ÃA]O)?[\s:\-–]+[^\n\r.;,]+/gi,
  /ENGENHEIR[OA]\s+RESPONS[AÁ]VEL[\s:\-–]+[^\n\r.;,]+/gi,
  /EMPRESA\s+ELABORADORA[\s:\-–]+[^\n\r.;,]+/gi,
  /CONSULTORIA\s+RESPONS[AÁ]VEL[\s:\-–]+[^\n\r.;,]+/gi,
];

const MULTI_SPACE = /[ \t]{2,}/g;
const MULTI_NEWLINE = /\n{3,}/g;
const TRAILING_PUNCT = /[\s:;\-,–]+$/;

export function sanitizePgrOriginText(input: unknown): string {
  if (typeof input !== "string") {
    return input as string;
  }

  let text = input;

  for (const pattern of PGR_ORIGIN_PATTERNS) {
    text = text.replace(pattern, "");
  }

  text = text.replace(MULTI_SPACE, " ");
  text = text.replace(MULTI_NEWLINE, "\n\n");
  text = text.replace(TRAILING_PUNCT, "");
  text = text.trim();

  return text;
}

export function withPgrOriginSanitization<T>(value: T, enabled: boolean): T {
  if (!enabled) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizePgrOriginText(value) as T;
  }

  return value;
}
