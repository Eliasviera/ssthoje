export function parsePgrReviewTarget(itemKey: string) {
  const match = /^(role|risk|exposure|action):(0|[1-9]\d*)$/.exec(itemKey);
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
  return { kind: match[1], index: Number(match[2]) };
}

export function pgrReviewTargetExists(itemKey: string, profile: { roles: unknown[]; risks: unknown[]; exposures: unknown[]; actions: unknown[] }) {
  const target = parsePgrReviewTarget(itemKey);
  if (!target) return false;
  const collections = { role: profile.roles, risk: profile.risks, exposure: profile.exposures, action: profile.actions };
  return target.index < collections[target.kind as keyof typeof collections].length;
}
