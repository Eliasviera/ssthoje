import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, SESSION_SECONDS, verifySessionToken } from "../src/lib/session-token.ts";

const secret = "segredo-ficticio-de-teste-com-mais-de-32-bytes";
const account = { userId: "conta-ficticia", email: "conta@ssthoje.local" };
const lookup = (userId: string) => userId === account.userId ? account : null;
const now = 1_800_000_000;
const tokenFor = (patch: Partial<{ userId: string; email: string; expiresAt: number }> = {}) => createSessionToken({ ...account, expiresAt: now + SESSION_SECONDS, ...patch }, secret);

test("sessão assinada valida conta, e-mail associado e expiração", () => {
  assert.deepEqual(verifySessionToken(tokenFor(), secret, lookup, now), { ...account, expiresAt: now + SESSION_SECONDS });
  assert.equal(verifySessionToken(tokenFor({ expiresAt: now }), secret, lookup, now), null);
  assert.equal(verifySessionToken(tokenFor({ email: "outra@ssthoje.local" }), secret, lookup, now), null);
  assert.equal(verifySessionToken(tokenFor({ userId: "conta-desconhecida" }), secret, lookup, now), null);
});

test("adulteração, assinatura inválida e payload extra são recusados", () => {
  const token = tokenFor();
  const [payload, signature] = token.split(".");
  const changedPayload = `${payload.startsWith("A") ? "B" : "A"}${payload.slice(1)}`;
  assert.equal(verifySessionToken(`${changedPayload}.${signature}`, secret, lookup, now), null);
  assert.equal(verifySessionToken(`${payload}.${"A".repeat(43)}`, secret, lookup, now), null);
  assert.equal(verifySessionToken(`${token}.extra`, secret, lookup, now), null);
});

test("duração acima de oito horas, token grande e segredo curto são recusados", () => {
  assert.equal(verifySessionToken(tokenFor({ expiresAt: now + SESSION_SECONDS + 1 }), secret, lookup, now), null);
  assert.equal(verifySessionToken("a".repeat(2049), secret, lookup, now), null);
  assert.throws(() => createSessionToken({ ...account, expiresAt: now + 1 }, "curto"), /32 bytes/);
  assert.throws(() => verifySessionToken("token", "curto", lookup, now), /32 bytes/);
});
