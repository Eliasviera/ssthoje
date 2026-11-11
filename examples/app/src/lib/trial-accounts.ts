import "server-only";
import { randomUUID } from "node:crypto";
import { activateInviteAccount, readInviteAccounts, updateInviteAccount } from "./invite-store.ts";
import { findDemoAccountByEmail } from "./demo-accounts.ts";
import { hashTrialPassword } from "./trial-password.ts";
export { isTrialActive } from "./trial-registry.ts";

export class TrialError extends Error {}
export const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export type TrialAccount = {
  userId: string; tenantId: string; tenantName: string; displayName: string;
  email: string; passwordHash: string; inviteId: string; activatedAt: string;
  expiresAt: string; extensionsUsed: number;
};
export function findTrialAccountByEmail(email: string): TrialAccount | null {
  return readInviteAccounts().find((item) => item.email === email.trim().toLowerCase()) ?? null;
}
export function findTrialAccountById(userId: string): TrialAccount | null {
  return readInviteAccounts().find((item) => item.userId === userId) ?? null;
}
export function listTrialAccounts(): Omit<TrialAccount, "passwordHash">[] {
  return readInviteAccounts().map((account) => {
    const { passwordHash, ...publicAccount } = account;
    void passwordHash;
    return publicAccount;
  });
}
export function createTrialAccount(input: { token: string; displayName: string; email: string; password: string; now?: Date }): TrialAccount {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!displayName || displayName.length > 120) throw new TrialError("Informe seu nome, com até 120 caracteres.");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TrialError("Informe um e-mail válido.");
  const passwordHash = hashTrialPassword(input.password);
  const now = input.now ?? new Date();
  return activateInviteAccount(input.token, (inviteId, accounts) => {
    if (findDemoAccountByEmail(email) || accounts.some((item) => item.email === email)) throw new TrialError("Não foi possível cadastrar este e-mail. Use outro ou procure o responsável pelo convite.");
    const id = randomUUID();
    return {
      userId: `trial-user-${id}`, tenantId: `trial-tenant-${id}`,
      tenantName: `Ambiente de teste de ${displayName}`.slice(0, 120),
      displayName, email, passwordHash, inviteId, activatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS).toISOString(), extensionsUsed: 0,
    };
  }, now);
}
// Chamado somente pelo serviço autorizado do Master.
export function extendTrial(userId: string, now = new Date(), actorUserId = "legacy-internal"): TrialAccount {
  return updateInviteAccount(userId, (account) => {
    if (account.extensionsUsed >= 1) throw new TrialError("Esta conta já usou a prorrogação.");
    account.expiresAt = new Date(Math.max(new Date(account.expiresAt).getTime(), now.getTime()) + TRIAL_DAYS * DAY_MS).toISOString();
    account.extensionsUsed += 1;
  }, actorUserId, now);
}
