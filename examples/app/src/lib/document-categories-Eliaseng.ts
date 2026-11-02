export const DOCUMENT_KINDS = ["PGR", "PCMSO", "LTCAT", "Ficha de EPI", "Treinamento", "Outro"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
