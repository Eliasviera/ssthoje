export const THIRD_PARTY_DOCUMENT_KINDS = ["PGR", "PCMSO", "LTCAT", "Ficha de EPI", "Treinamento", "O.S.", "Outro"] as const;
export type ThirdPartyDocumentKind = typeof THIRD_PARTY_DOCUMENT_KINDS[number];

export const CLIENT_THIRD_PARTY_REQUIREMENTS = [...THIRD_PARTY_DOCUMENT_KINDS, "ASO"] as const;
export type ClientThirdPartyRequirement = typeof CLIENT_THIRD_PARTY_REQUIREMENTS[number];
