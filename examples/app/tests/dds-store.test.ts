import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { attachDdsPhoto, closeDds, createDds, DdsError, listDds, setDdsTheme, signDdsAttendee, signDdsResponsible, validateSignatureImage } from "../src/lib/dds-store.ts";
import { hasTenantPermission } from "../src/lib/tenant-access.ts";

const png = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString("base64")}`;
const jpg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 1)]).toString("base64")}`;
const base = { companyId: "c", unitId: "u", heldOn: "2026-11-02", location: "Pátio", responsible: "Líder", notes: "", actorUserId: "u1" };

function release(tenantId: string, id: string) {
  const withPhoto = attachDdsPhoto({ tenantId, id, revision: 1, image: jpg, actorUserId: "u1" });
  return setDdsTheme({ tenantId, id, revision: withPhoto.revision, theme: "Tema livre", actorUserId: "u1" });
}

function withTempData(run: () => void) {
  const original = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), "dds-tests-"));
  process.chdir(dir);
  try { run(); } finally { process.chdir(original); rmSync(dir, { recursive: true, force: true }); }
}

test("DDS exige foto e tema antes das assinaturas e valida a foto", () => withTempData(() => {
  const record = createDds({ ...base, tenantId: "a", attendees: [{ workerName: "Ana" }] });
  assert.throws(() => signDdsResponsible({ tenantId: "a", id: record.id, revision: 1, image: png, actorUserId: "u1" }), /foto/);
  assert.throws(() => setDdsTheme({ tenantId: "a", id: record.id, revision: 1, theme: "X", actorUserId: "u1" }), /foto/);
  assert.throws(() => attachDdsPhoto({ tenantId: "a", id: record.id, revision: 1, image: png, actorUserId: "u1" }), DdsError);
  const withPhoto = attachDdsPhoto({ tenantId: "a", id: record.id, revision: 1, image: jpg, actorUserId: "u1" });
  assert.throws(() => signDdsResponsible({ tenantId: "a", id: record.id, revision: withPhoto.revision, image: png, actorUserId: "u1" }), /tema/);
  assert.throws(() => attachDdsPhoto({ tenantId: "a", id: record.id, revision: withPhoto.revision, image: jpg, actorUserId: "u1" }), /já foi registrada/);
}));

test("DDS isola consultorias e exige assinatura do responsável para encerrar", () => withTempData(() => {
  const created = createDds({ ...base, tenantId: "a", attendees: [{ workerId: "w1", workerName: "Ana" }, { workerName: "Visitante" }] });
  const record = release("a", created.id);
  assert.equal(listDds("a").length, 1);
  assert.equal(listDds("b").length, 0);
  assert.equal(record.attendees[1].registered, false);
  assert.throws(() => signDdsAttendee({ tenantId: "b", id: record.id, attendeeId: record.attendees[0].id, revision: record.revision, image: png, actorUserId: "x" }), DdsError);
  const signed = signDdsAttendee({ tenantId: "a", id: record.id, attendeeId: record.attendees[0].id, revision: record.revision, image: png, actorUserId: "u1" });
  assert.throws(() => closeDds({ tenantId: "a", id: record.id, revision: signed.revision, actorUserId: "u1" }), /responsável/);
  const withResponsible = signDdsResponsible({ tenantId: "a", id: record.id, revision: signed.revision, image: png, actorUserId: "u1" });
  const closed = closeDds({ tenantId: "a", id: record.id, revision: withResponsible.revision, actorUserId: "u1" });
  assert.equal(closed.status, "closed");
  assert.throws(() => signDdsAttendee({ tenantId: "a", id: record.id, attendeeId: record.attendees[1].id, revision: closed.revision, image: png, actorUserId: "u1" }), /encerrado/);
}));

test("DDS rejeita assinatura inválida, revisão antiga e participante repetido", () => withTempData(() => {
  assert.throws(() => validateSignatureImage("data:image/png;base64,AAAA"), DdsError);
  assert.throws(() => validateSignatureImage("data:text/html;base64,AAAA"), DdsError);
  assert.throws(() => createDds({ ...base, tenantId: "a", attendees: [{ workerId: "w1", workerName: "Ana" }, { workerId: "w1", workerName: "Ana" }] }), /repetido/);
  const record = createDds({ ...base, tenantId: "a", attendees: [{ workerName: "Ana" }] });
  assert.throws(() => signDdsResponsible({ tenantId: "a", id: record.id, revision: 99, image: png, actorUserId: "u1" }), /mudou/);
}));

test("somente perfis autorizados gerenciam DDS", () => {
  assert.ok(hasTenantPermission("sst_tst", "dds.manage"));
  assert.ok(hasTenantPermission("cliente", "dds.read"));
  assert.ok(!hasTenantPermission("cliente", "dds.manage"));
  assert.ok(!hasTenantPermission("terceiro", "dds.read"));
});
