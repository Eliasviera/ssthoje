import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_SECONDS = 60 * 60 * 8;
const MAX_TOKEN_LENGTH = 2048;

export type SessionToken = { userId: string; email: string; expiresAt: number };
export type SessionAccount = Pick<SessionToken, "userId" | "email">;

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(session: SessionToken, secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new Error("SESSION_SECRET precisa ter pelo menos 32 bytes.");
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  findAccount: (userId: string) => SessionAccount | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionToken | null {
  if (Buffer.byteLength(secret) < 32) throw new Error("SESSION_SECRET precisa ter pelo menos 32 bytes.");
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(providedSignature)) return null;

  try {
    const expected = Buffer.from(signature(payload, secret), "base64url");
    const provided = Buffer.from(providedSignature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const session = value as Partial<SessionToken>;
    if (
      Object.keys(value).length !== 3 ||
      typeof session.userId !== "string" || !session.userId || session.userId.length > 128 ||
      typeof session.email !== "string" || !session.email || session.email.length > 254 ||
      typeof session.expiresAt !== "number" || !Number.isSafeInteger(session.expiresAt) ||
      session.expiresAt <= nowSeconds || session.expiresAt > nowSeconds + SESSION_SECONDS
    ) return null;

    const account = findAccount(session.userId);
    if (!account || session.email !== account.email) return null;
    return session as SessionToken;
  } catch {
    return null;
  }
}
