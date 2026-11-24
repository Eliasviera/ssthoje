import assert from "node:assert/strict";
import test from "node:test";
import { createInventoryAttachmentSandbox } from "../src/lib/inventory-attachment-sandbox.ts";

// Assinaturas sintéticas: não são imagens reais nem evidência de decodificação completa.
const png = () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
function setup(quota = 100, max = 50) {
  let tenant = "cliente-ficticio-a", denied = false;
  const actions: string[] = [];
  const store = createInventoryAttachmentSandbox({ maxFileBytes: max, tenantQuotaBytes: quota, authorize: async (action, resourceId) => {
    actions.push(action);
    if (denied) throw new Error("Acesso negado pelo servidor");
    return { tenantId: tenant, resourceId, actorId: "ator-ficticio" };
  } });
  return { store, actions, tenant: (value: string) => { tenant = value; }, deny: () => { denied = true; } };
}

test("anexos: envio/leitura autorizados, integridade e cópias independentes", async () => {
  const { store, actions } = setup();
  const bytes = png();
  const record = await store.upload({ resourceId: "espaco-ficticio", mime: "image/png", bytes });
  bytes.fill(0); record.sha256 = "adulterado";
  const read = await store.download("espaco-ficticio", record.id);
  assert.deepEqual(read.bytes, png()); assert.notEqual(read.record.sha256, "adulterado");
  read.bytes.fill(0);
  assert.deepEqual((await store.download("espaco-ficticio", record.id)).bytes, png());
  assert.deepEqual(actions, ["upload", "download", "download"]);
  assert.equal(store.inspectForTests().audit.length, 3);
});

test("anexos: tenant e recurso são conferidos no servidor para leitura e nova versão", async () => {
  const fixture = setup();
  const record = await fixture.store.upload({ resourceId: "espaco-a", mime: "image/png", bytes: png() });
  fixture.tenant("cliente-ficticio-b");
  await assert.rejects(fixture.store.download("espaco-a", record.id), { code: "not_found" });
  await assert.rejects(fixture.store.upload({ resourceId: "espaco-a", mime: "image/png", bytes: png(), previousId: record.id }), { code: "not_found" });
  fixture.tenant("cliente-ficticio-a");
  await assert.rejects(fixture.store.download("espaco-b", record.id), { code: "not_found" });
  fixture.deny();
  await assert.rejects(fixture.store.download("espaco-a", record.id), /Acesso negado/);
  await assert.rejects(fixture.store.upload({ resourceId: "espaco-a", mime: "image/png", bytes: png() }), /Acesso negado/);
  assert.equal(fixture.store.inspectForTests().count, 1);
});

test("anexos: versões preservam original e contam integralmente na cota", async () => {
  const { store } = setup(24);
  const first = await store.upload({ resourceId: "croqui", mime: "image/png", bytes: png() });
  const second = await store.upload({ resourceId: "croqui", mime: "image/png", bytes: png(), previousId: first.id });
  assert.notEqual(first.id, second.id); assert.equal(second.previousId, first.id);
  assert.deepEqual((await store.download("croqui", first.id)).bytes, png());
  await assert.rejects(store.upload({ resourceId: "croqui", mime: "image/png", bytes: png() }), { code: "quota_exceeded" });
  assert.equal(store.inspectForTests().usage["cliente-ficticio-a"], 24);
});

test("anexos: envios concorrentes não ultrapassam a cota do piloto", async () => {
  const { store } = setup(12);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.upload({ resourceId: "croqui", mime: "image/png", bytes: png() })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(store.inspectForTests().count, 1);
  assert.equal(store.inspectForTests().audit.length, 1);
});

test("anexos: recusa assinatura divergente, tipo não permitido, tamanho e IDs inválidos", async () => {
  const { store } = setup();
  for (const mime of ["image/jpeg", "application/pdf", "image/svg+xml", "__proto__"]) {
    await assert.rejects(store.upload({ resourceId: "croqui", mime: mime as "image/png", bytes: png() }), { code: "invalid_input" });
  }
  await assert.rejects(store.upload({ resourceId: "../fora", mime: "image/png", bytes: png() }), { code: "invalid_input" });
  await assert.rejects(store.upload({ resourceId: "croqui", mime: "image/png", bytes: Buffer.alloc(51) }), { code: "file_too_large" });
  await assert.rejects(store.download("croqui", "../../arquivo"), { code: "invalid_input" });
  assert.equal(store.inspectForTests().count, 0);
});

test("anexos: aceita assinaturas sintéticas JPEG/PDF e separa cotas de clientes", async () => {
  const f = setup(12);
  await f.store.upload({ resourceId: "croqui", mime: "image/png", bytes: png() });
  f.tenant("cliente-ficticio-b");
  await f.store.upload({ resourceId: "croqui", mime: "image/jpeg", bytes: Buffer.from([255,216,255,0]) });
  await f.store.upload({ resourceId: "croqui", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7") });
  assert.deepEqual(f.store.inspectForTests().usage, { "cliente-ficticio-a": 12, "cliente-ficticio-b": 12 });
});
