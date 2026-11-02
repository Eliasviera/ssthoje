export const DEMO_RISK_CATEGORIES = ["Ruído", "Ergonômico", "Químico", "Biológico", "Acidente", "Outro"] as const;
export type WorkerRiskCategory = (typeof DEMO_RISK_CATEGORIES)[number];
