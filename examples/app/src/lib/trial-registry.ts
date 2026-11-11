import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TrialAccount } from "./trial-accounts.ts";
import type { InviteRecord } from "./invite-store.ts";

// Leitor de identidade também usado por CLIs locais sem o runtime Next.
// Nunca importar este módulo em componentes cliente.
export function readRegisteredTrialAccounts(): TrialAccount[] {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(join(process.cwd(), "data", "invites.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  if (!Array.isArray(raw)) throw new Error("Cadastro local de testes indisponível.");
  return (raw as InviteRecord[]).flatMap((record) => record.usedAt && record.account ? [{ ...record.account }] : []);
}
export function isTrialActive(account: Pick<TrialAccount, "expiresAt">, now = new Date()) {
  return new Date(account.expiresAt).getTime() > now.getTime();
}
export function findRegisteredTrialAccount(userId: string) {
  return readRegisteredTrialAccounts().find((account) => account.userId === userId) ?? null;
}
export function listRegisteredTrialAccounts(): Omit<TrialAccount, "passwordHash">[] {
  return readRegisteredTrialAccounts().map((account) => {
    const { passwordHash, ...rest } = account;
    void passwordHash;
    return rest;
  });
}
