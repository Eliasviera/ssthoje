import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type RigorLevel = "inform" | "authorization" | "block";
export type Policy = { tenantId: string; companyId: string; unitId: string; version: number; validFrom?: string; createdAt?: string; createdBy?: string; reviewer: string; defaultLevel: RigorLevel; levels: Record<string, RigorLevel> };

const fallback: Policy = { tenantId: "", companyId: "", unitId: "", version: 0, reviewer: "Não configurado", defaultLevel: "authorization", levels: {} };
export function getThirdPartyRigorPolicy(tenantId: string, companyId: string, unitId: string): Policy {
  try {
    const value = JSON.parse(readFileSync(join(process.cwd(), "data", "third-party-rigor-policies.json"), "utf8")) as { policies?: Policy[] };
    const policy = value.policies?.find(item => item.tenantId === tenantId && item.companyId === companyId && item.unitId === unitId);
    return policy ?? fallback;
  } catch { return fallback; }
}
export function rigorForBlocker(policy: Policy, blocker: string): RigorLevel {
  const kind = blocker.split(":", 1)[0].trim();
  return policy.levels[kind] ?? policy.defaultLevel;
}
export function listThirdPartyRigorPolicies(tenantId: string): Policy[] {
  try { const value = JSON.parse(readFileSync(join(process.cwd(), "data", "third-party-rigor-policies.json"), "utf8")) as { policies?: Policy[] }; return (value.policies ?? []).filter(item => item.tenantId === tenantId); } catch { return []; }
}
