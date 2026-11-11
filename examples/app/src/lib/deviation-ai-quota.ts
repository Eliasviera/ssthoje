import "server-only";

import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { saoPauloDate } from "./business-date.ts";

/**
 * Cota da sugestão de IA em desvios.
 *
 * Regras (ver docs/DEVIATION_AI_LIMITS.md):
 * - a análise está ligada ao relato, não a um horário do dia;
 * - a mesma foto, do mesmo tenant, em até 24 horas, reaproveita o resultado e não consome cota;
 * - limite diário por pessoa apenas como proteção contra abuso;
 * - teto mensal por tenant para manter o custo previsível.
 * Nenhuma dessas regras bloqueia o registro do desvio em si.
 */

export const DEFAULT_DAILY_LIMIT_PER_USER = 10;
export const DEFAULT_MONTHLY_LIMIT_PER_TENANT = 500;
const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

type UsageEntry = {
  tenantId: string;
  userId: string;
  day: string;
  month: string;
  photoSha256: string;
  occurredAt: string;
};

type UsageStore = { entries: UsageEntry[] };

export type DeviationAiQuota = {
  day: string;
  month: string;
  usedToday: number;
  dailyLimit: number;
  usedMonth: number;
  monthlyLimit: number;
  allowed: boolean;
  reason?: string;
};

export type ReserveDeviationAiResult = { granted: boolean; cached: boolean; quota: DeviationAiQuota };

function storePath() {
  return join(process.cwd(), "data", "ai-usage.json");
}

function readStore(): UsageStore {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray((value as UsageStore).entries)) return { entries: [] };
    return { entries: (value as UsageStore).entries };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { entries: [] };
    throw error;
  }
}

function writeStore(store: UsageStore) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = store.entries.filter((entry) => {
    const at = Date.parse(entry.occurredAt);
    return Number.isFinite(at) && at >= cutoff;
  });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ entries }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Trava curta entre processos: duas análises simultâneas não podem furar o limite.
function withUsageLock<T>(run: () => T): T {
  const directory = join(process.cwd(), "data");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "ai-usage.lock");
  let descriptor: number | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      descriptor = openSync(path, "wx");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      sleep(25);
    }
  }
  if (descriptor === null) throw new Error("Muitas análises ao mesmo tempo. Tente novamente em instantes.");
  try {
    return run();
  } finally {
    closeSync(descriptor);
    unlinkSync(path);
  }
}

function limitFromEnv(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : fallback;
}

export function dailyAiLimit() {
  return limitFromEnv("DEVIATION_AI_DAILY_LIMIT", DEFAULT_DAILY_LIMIT_PER_USER);
}

export function monthlyAiLimit() {
  return limitFromEnv("DEVIATION_AI_MONTHLY_LIMIT", DEFAULT_MONTHLY_LIMIT_PER_TENANT);
}

function computeQuota(store: UsageStore, input: { tenantId: string; userId: string; day: string }): DeviationAiQuota {
  const month = input.day.slice(0, 7);
  const dailyLimit = dailyAiLimit();
  const monthlyLimit = monthlyAiLimit();
  const doDia = store.entries.filter((entry) => entry.tenantId === input.tenantId && entry.userId === input.userId && entry.day === input.day);
  const doMes = store.entries.filter((entry) => entry.tenantId === input.tenantId && entry.month === month);
  const base = {
    day: input.day,
    month,
    usedToday: doDia.length,
    dailyLimit,
    usedMonth: doMes.length,
    monthlyLimit,
  };
  if (doDia.length >= dailyLimit) {
    return {
      ...base,
      allowed: false,
      reason: `Limite de ${dailyLimit} análises de IA por pessoa neste dia atingido. O relato pode ser registrado manualmente e a sugestão volta amanhã.`,
    };
  }
  if (doMes.length >= monthlyLimit) {
    return {
      ...base,
      allowed: false,
      reason: `Limite de ${monthlyLimit} análises de IA neste mês para esta consultoria atingido. O relato pode ser registrado manualmente.`,
    };
  }
  return { ...base, allowed: true };
}

export function getDeviationAiQuota(input: { tenantId: string; userId: string; day?: string }): DeviationAiQuota {
  const day = input.day ?? saoPauloDate();
  return computeQuota(readStore(), { tenantId: input.tenantId, userId: input.userId, day });
}

export function reserveDeviationAiAnalysis(input: {
  tenantId: string;
  userId: string;
  photoSha256: string;
  day?: string;
}): ReserveDeviationAiResult {
  if (!/^[a-f0-9]{64}$/.test(input.photoSha256)) throw new Error("A foto enviada não pôde ser identificada.");
  const day = input.day ?? saoPauloDate();
  return withUsageLock(() => {
    const store = readStore();
    const now = Date.now();
    const cached = store.entries.some((entry) => {
      if (entry.tenantId !== input.tenantId || entry.photoSha256 !== input.photoSha256) return false;
      const at = Date.parse(entry.occurredAt);
      return Number.isFinite(at) && now - at < CACHE_WINDOW_MS;
    });
    const quota = computeQuota(store, { tenantId: input.tenantId, userId: input.userId, day });
    if (cached) return { granted: true, cached: true, quota };
    if (!quota.allowed) return { granted: false, cached: false, quota };

    store.entries.push({
      tenantId: input.tenantId,
      userId: input.userId,
      day,
      month: day.slice(0, 7),
      photoSha256: input.photoSha256,
      occurredAt: new Date(now).toISOString(),
    });
    writeStore(store);
    return { granted: true, cached: false, quota: computeQuota(store, { tenantId: input.tenantId, userId: input.userId, day }) };
  });
}

/** Devolve a cota quando a análise falha depois da reserva: falha não consome limite. */
export function releaseDeviationAiAnalysis(input: { tenantId: string; userId: string; photoSha256: string }) {
  withUsageLock(() => {
    const store = readStore();
    for (let index = store.entries.length - 1; index >= 0; index -= 1) {
      const entry = store.entries[index];
      if (entry.tenantId === input.tenantId && entry.userId === input.userId && entry.photoSha256 === input.photoSha256) {
        store.entries.splice(index, 1);
        writeStore(store);
        return;
      }
    }
  });
}

export function listDeviationAiUsageForTenant(tenantId: string, month: string) {
  return readStore().entries.filter((entry) => entry.tenantId === tenantId && entry.month === month).map((entry) => ({ ...entry }));
}
