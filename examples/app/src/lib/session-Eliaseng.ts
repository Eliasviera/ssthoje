import "server-only";

import { cookies } from "next/headers";
import { findDemoAccountById } from "./demo-accounts";
import { createSessionToken, SESSION_SECONDS, verifySessionToken, type SessionToken } from "./session-token";

const COOKIE_NAME = "sst_hoje_session";
export type DemoSession = SessionToken;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("SESSION_SECRET precisa ter pelo menos 32 bytes. Configure o arquivo .env.local.");
  }
  return secret;
}

export async function createSession(userId: string, email: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const session: DemoSession = { userId, email, expiresAt };
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionToken(session, getSessionSecret()), {
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
  try {
    return verifySessionToken(token, getSessionSecret(), findDemoAccountById);
  } catch {
    return null;
  }
}
