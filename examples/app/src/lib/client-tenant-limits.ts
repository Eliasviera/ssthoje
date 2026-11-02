export const TENANT_LIMIT_KEYS = ["users", "companies", "workers", "storageBytes"] as const;
export type TenantLimitKey = typeof TENANT_LIMIT_KEYS[number];
export type TenantLimitValues = Record<TenantLimitKey, number>;

const LABELS: Record<TenantLimitKey, string> = {
  users: "usuários ativos",
  companies: "empresas ativas",
  workers: "trabalhadores ativos",
  storageBytes: "armazenamento",
};

function assertNonNegativeIntegers(values: TenantLimitValues, label: string) {
  for (const key of TENANT_LIMIT_KEYS) {
    const value = values[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`O limite de ${LABELS[key]} em ${label} deve ser um inteiro não negativo.`);
    }
  }
}

export function assertClientLimitsWithinPlatformCeilings(
  requested: TenantLimitValues,
  platformCeilings: TenantLimitValues,
  currentUsage: TenantLimitValues,
) {
  assertNonNegativeIntegers(requested, "sua configuração");
  assertNonNegativeIntegers(platformCeilings, "plataforma");
  assertNonNegativeIntegers(currentUsage, "uso atual");

  for (const key of TENANT_LIMIT_KEYS) {
    if (requested[key] > platformCeilings[key]) {
      throw new Error(`O limite de ${LABELS[key]} não pode ultrapassar o teto definido pela plataforma (${platformCeilings[key]}).`);
    }
    if (requested[key] < currentUsage[key]) {
      throw new Error(`O limite de ${LABELS[key]} não pode ficar abaixo do uso atual (${currentUsage[key]}). Nenhum dado foi removido.`);
    }
  }
}

export function assertTenantUsageWithinLimits(
  currentUsage: TenantLimitValues,
  effectiveLimits: TenantLimitValues,
  key: TenantLimitKey,
) {
  assertNonNegativeIntegers(currentUsage, "uso atual");
  assertNonNegativeIntegers(effectiveLimits, "configuração vigente");
  if (currentUsage[key] >= effectiveLimits[key]) {
    throw new Error(`Limite de ${LABELS[key]} atingido. Nenhuma operação foi registrada.`);
  }
}
