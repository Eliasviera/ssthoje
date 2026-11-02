export const PLANS = {
  essencial: { name: "Essencial", companies: 100, workers: 1000, storageMB: 100, credits: 100, monthly: 9900, annual: 99000, modules: "Cadastros e documentos" },
  profissional: { name: "Profissional", companies: 300, workers: 3000, storageMB: 500, credits: 500, monthly: 19900, annual: 199000, modules: "Cadastros, documentos e operação" },
} as const;
export const OPTIONAL_MODULES = { operations: "Prazos e preferências operacionais", thirdparty: "Novas operações de terceiros", epi: "Novas operações de EPI" } as const;
export type OptionalModule = keyof typeof OPTIONAL_MODULES;
export type PlanConfig = { plan: keyof typeof PLANS; cycle: "monthly" | "annual"; extraCompanies: number; extraWorkers: number; extraStorageMB: number; extraCredits: number; disabledModules?: OptionalModule[] };
export type PlanAccount = { config: PlanConfig; storageUsedMB: number; creditsUsed: number; revision: number };
export type PlanEvent = { id: string; tenantId: string; actorUserId: string; occurredAt: string; reason: string; before: PlanAccount; after: PlanAccount };
export const DEFAULT_PLAN: PlanAccount = { config: { plan: "essencial", cycle: "monthly", extraCompanies: 0, extraWorkers: 0, extraStorageMB: 0, extraCredits: 0 }, storageUsedMB: 0, creditsUsed: 0, revision: 0 };
export function planTotals(config: PlanConfig) {
  const base = PLANS[config.plan];
  return { companies: base.companies + config.extraCompanies, workers: base.workers + config.extraWorkers, storageMB: base.storageMB + config.extraStorageMB, credits: base.credits + config.extraCredits, price: base[config.cycle] };
}
