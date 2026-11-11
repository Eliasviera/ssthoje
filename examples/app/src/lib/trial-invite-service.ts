import "server-only";
import { createHash } from "node:crypto";
import { createInvite, listInvites, revokeInvite, findPendingInvite } from "./invite-store.ts";
import { createTrialAccount, extendTrial, listTrialAccounts } from "./trial-accounts.ts";
import { requirePlatformMaster, throttle } from "./platform-store.ts";

const attempts = new Map<string, { count: number; until: number }>();
function registrationThrottle(token: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = createHash("sha256").update(token).digest("hex");
  const attempt = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
  if (++attempt.count > 5 || attempts.size >= 1000) throw new Error("Muitas tentativas. Aguarde 15 minutos e tente novamente.");
  attempts.set(key, attempt);
}
export function getTrialAdministration(actorUserId: string) {
  requirePlatformMaster(actorUserId);
  return { invites: listInvites(), accounts: listTrialAccounts() };
}
export function manageTrialInvitation(actorUserId: string, input: { operation: string; value: string }) {
  requirePlatformMaster(actorUserId);
  throttle(actorUserId);
  if (input.operation === "create") return { token: createInvite({ label: input.value, actorUserId }).token };
  if (input.operation === "revoke") { revokeInvite(input.value, new Date(), actorUserId); return {}; }
  if (input.operation === "extend") { extendTrial(input.value, new Date(), actorUserId); return {}; }
  throw new Error("Ação indisponível. Atualize a página.");
}
export function registerTrialInvitation(input: { token: string; displayName: string; email: string; password: string; acknowledged: boolean }) {
  if (typeof input.token !== "string" || input.token.length > 100) throw new Error("Convite indisponível.");
  registrationThrottle(input.token);
  if (!input.acknowledged) throw new Error("Confirme que usará apenas dados fictícios.");
  if (!findPendingInvite(input.token)) throw new Error("Convite indisponível, usado ou expirado. Solicite outro ao responsável.");
  return createTrialAccount(input);
}
