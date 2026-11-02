import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { consumeInvite, createInvite, findPendingInvite, InviteError, listInvites, revokeInvite } from "../src/lib/invite-store.ts";

function withTempData(run: () => void) {
  const original = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), "invite-tests-"));
  process.chdir(dir);
  try { run(); } finally { process.chdir(original); rmSync(dir, { recursive: true, force: true }); }
}

test("convite guarda só o hash, vale 7 dias e é de uso único", () => withTempData(() => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.throws(() => createInvite({ label: " ", actorUserId: "m", now }), InviteError);
  const { invite, token } = createInvite({ label: "Testador 1", actorUserId: "m", now });
  assert.equal(readFileSync(join(process.cwd(), "data", "invites.json"), "utf8").includes(token), false);
  assert.equal(invite.expiresAt, "2026-11-09T12:00:00.000Z");
  assert.ok(findPendingInvite(token, now));
  assert.equal(findPendingInvite("curto", now), null);
  assert.equal(findPendingInvite(`${token}x`, now), null);
  consumeInvite(token, " Teste@Exemplo.com ", now);
  assert.equal(findPendingInvite(token, now), null);
  assert.throws(() => consumeInvite(token, "outro@exemplo.com", now), /indispon/);
  assert.equal(listInvites(now)[0].status, "used");
  assert.equal(listInvites(now)[0].usedByEmail, "teste@exemplo.com");
  assert.equal("tokenHash" in listInvites(now)[0], false);
}));

test("convite expira, pode ser revogado e usado não pode", () => withTempData(() => {
  const now = new Date("2026-11-02T12:00:00Z");
  const later = new Date("2026-11-10T12:00:00Z");
  const a = createInvite({ label: "A", actorUserId: "m", now });
  assert.equal(findPendingInvite(a.token, later), null);
  assert.throws(() => consumeInvite(a.token, "a@x.com", later), InviteError);
  const b = createInvite({ label: "B", actorUserId: "m", now });
  revokeInvite(b.invite.id, now);
  assert.throws(() => consumeInvite(b.token, "b@x.com", now), InviteError);
  const c = createInvite({ label: "C", actorUserId: "m", now });
  consumeInvite(c.token, "c@x.com", now);
  assert.throws(() => revokeInvite(c.invite.id, now), /usado/);
  assert.throws(() => revokeInvite("nao-existe", now), InviteError);
}));
