import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findDemoAccountById } from "./demo-accounts";

const COOKIE_NAME = "sst_hoje_session";
const SESSION_SECONDS = 60 * 60 * 8;

export type DemoSession = {
  userId: string;
  email: string;
  expiresAt: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("SESSION_SECRET precisa ter pelo menos 32 bytes. Configure o arquivo .env.local.");
  }
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export async function createSession(userId: string, email: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const session: DemoSession = { userId, email, expiresAt };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
    expires: new Date(expiresAt * 1000),
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<DemoSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra !== undefined) return null;

  try {
    const expectedSignature = Buffer.from(sign(payload), "base64url");
    const signature = Buffer.from(providedSignature, "base64url");
    if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) return null;

    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const session = value as Partial<DemoSession>;
    const account = typeof session.userId === "string" ? findDemoAccountById(session.userId) : null;
    if (
      !account ||
      typeof session.email !== "string" ||
      session.email !== account.email ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;

    return session as DemoSession;
  } catch {
    return null;
  }
}
