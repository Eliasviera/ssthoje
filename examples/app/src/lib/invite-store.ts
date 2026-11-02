import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class InviteError extends Error {}

export type InviteStatus = "pending" | "used" | "revoked" | "expired";
export type InviteRecord = {
  id: string;
  tokenHash: string;
  label: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedByEmail?: string;
  revokedAt?: string;
};

export const INVITE_VALID_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function storePath() {
  return join(process.cwd(), "data", "invites.json");
}

function readAll(): InviteRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!Array.isArray(value)) throw new InviteError("O arquivo local de convites tem formato inválido.");
    return value as InviteRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(records: InviteRecord[]) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteStatus(record: InviteRecord, now = new Date()): InviteStatus {
  if (record.revokedAt) return "revoked";
  if (record.usedAt) return "used";
  return new Date(record.expiresAt).getTime() <= now.getTime() ? "expired" : "pending";
}

// O token em texto puro só existe neste retorno; o arquivo guarda apenas o hash.
export function createInvite(input: { label: string; actorUserId: string; now?: Date }): { invite: InviteRecord; token: string } {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label || label.length > 120) throw new InviteError("Informe um nome de referência para o convite.");
  const now = input.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const invite: InviteRecord = {
    id: randomUUID(), tokenHash: hashToken(token), label, createdByUserId: input.actorUserId,
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS).toISOString(),
  };
  const records = readAll();
  records.push(invite);
  writeAll(records);
  return { invite, token };
}

export function findPendingInvite(token: string, now = new Date()): InviteRecord | null {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const hash = hashToken(token);
  const record = readAll().find((item) => item.tokenHash === hash);
  return record && inviteStatus(record, now) === "pending" ? { ...record } : null;
}

export function consumeInvite(token: string, usedByEmail: string, now = new Date()): InviteRecord {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) throw new InviteError("Convite indisponível.");
  const hash = hashToken(token);
  const records = readAll();
  const record = records.find((item) => item.tokenHash === hash);
  if (!record || inviteStatus(record, now) !== "pending") throw new InviteError("Convite indisponível, usado ou expirado.");
  record.usedAt = now.toISOString();
  record.usedByEmail = usedByEmail.trim().toLowerCase().slice(0, 200);
  writeAll(records);
  return { ...record };
}

export function revokeInvite(id: string, now = new Date()): InviteRecord {
  const records = readAll();
  const record = records.find((item) => item.id === id);
  if (!record) throw new InviteError("Convite indisponível.");
  if (record.usedAt) throw new InviteError("Convite já usado não pode ser revogado.");
  record.revokedAt ??= now.toISOString();
  writeAll(records);
  return { ...record };
}

export function listInvites(now = new Date()): (Omit<InviteRecord, "tokenHash"> & { status: InviteStatus })[] {
  return readAll()
    .map(({ tokenHash: _hash, ...rest }) => ({ ...rest, status: inviteStatus({ ...rest, tokenHash: "" }, now) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
