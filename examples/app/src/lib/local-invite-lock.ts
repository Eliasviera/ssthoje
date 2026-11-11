import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// Trava exclusiva entre processos. Uma trava abandonada exige revisão manual;
// nunca é removida por timeout enquanto outro processo pode estar gravando.
export function withInviteLock<T>(run: () => T): T {
  const directory = join(process.cwd(), "data");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "invites.lock");
  let descriptor: number;
  try { descriptor = openSync(path, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Cadastro em andamento. Aguarde e tente novamente.");
    throw error;
  }
  try { return run(); } finally { closeSync(descriptor); unlinkSync(path); }
}
