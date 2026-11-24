import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { PDFDocument } from "pdf-lib";
import { createMagaluInventoryObjectStore, InventoryObjectStoreError } from "../src/lib/inventory-magalu-object-store.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
function fixture() {
  let tenant = "cliente-ficticio-a", enabled = true, corrupt = false, deny = false;
  const objects = new Map<string, { bytes: Buffer; mime: string; digest: string }>();
  const requests: Array<{ method: string; path: string; query: Record<string, unknown>; headers: Record<string, string> }> = [];
  const credentials = { accessKeyId: "CHAVE_FICTICIA_TESTE", secretAccessKey: "SEGREDO_FICTICIO_SEM_VALOR_REAL" };
  const client = new S3Client({ region: "br-se1", endpoint: "https://br-se1.magaluobjects.com", forcePathStyle: true, credentials, maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", requestHandler: {
    async handle(request: { method: string; path: string; query: Record<string, unknown>; headers: Record<string, string>; body?: unknown }) {
      requests.push({ method: request.method, path: request.path, query: request.query, headers: request.headers });
      if (Object.hasOwn(request.query, "versioning")) return { response: { statusCode: 200, headers: { "content-type": "application/xml" }, body: Readable.from([`<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>${enabled ? "Enabled" : "Suspended"}</Status></VersioningConfiguration>`]) } };
      if (request.method === "PUT") {
        objects.set(request.path, { bytes: Buffer.from(request.body as Uint8Array), mime: request.headers["content-type"], digest: request.headers["x-amz-meta-sha256"] });
        return { response: { statusCode: 200, headers: { "x-amz-version-id": "versao-ficticia-1", etag: '"etag-ficticio"' }, body: Readable.from([]) } };
      }
      const object = objects.get(request.path);
      assert.ok(object);
      const bytes = Buffer.from(object.bytes); if (corrupt) bytes[0] ^= 1;
      return { response: { statusCode: 200, headers: { "x-amz-version-id": "versao-ficticia-1", "content-length": String(bytes.length), "content-type": object.mime, "x-amz-meta-sha256": object.digest }, body: Readable.from(request.method === "HEAD" ? [] : [bytes]) } };
    },
  } });
  const store = createMagaluInventoryObjectStore({ region: "br-se1", bucket: "bucket-ficticio-testes", ...credentials, maxFileBytes: 1024 * 1024 }, async (_action, resourceId) => {
    if (deny) throw new Error("Sem permissão no servidor");
    return { tenantId: tenant, actorId: "ator-ficticio", resourceId };
  }, client);
  return { store, requests, tenant: (v: string) => { tenant = v; }, disable: () => { enabled = false; }, corrupt: () => { corrupt = true; }, deny: () => { deny = true; } };
}

test("Magalu candidato: SDK serializa envio privado, versão fixa, leitura e link temporário", async () => {
  const f = fixture();
  const receipt = await f.store.put("espaco-ficticio", "image/png", png);
  assert.deepEqual(await f.store.get(receipt), png);
  const put = f.requests.find(r => r.method === "PUT");
  assert.equal(put?.headers["x-amz-acl"], "private");
  assert.ok(put?.path.includes("/inventory/cliente-ficticio-a/espaco-ficticio/"));
  const url = new URL(await f.store.temporaryDownload(receipt));
  assert.equal(url.hostname, "br-se1.magaluobjects.com");
  assert.equal(url.searchParams.get("versionId"), "versao-ficticia-1");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "60");
  assert.equal(url.searchParams.get("response-content-disposition"), "attachment");
  assert.ok(f.requests.filter(r => r.method === "GET" && !Object.hasOwn(r.query, "versioning")).every(r => r.query.versionId === receipt.versionId));
});

test("Magalu candidato: bloqueia leitura/link entre clientes antes de chamar transporte", async () => {
  const f = fixture(), receipt = await f.store.put("croqui", "image/png", png);
  f.tenant("cliente-ficticio-b"); const count = f.requests.length;
  await assert.rejects(f.store.get(receipt), InventoryObjectStoreError);
  await assert.rejects(f.store.temporaryDownload(receipt), InventoryObjectStoreError);
  assert.equal(f.requests.length, count);
  f.deny(); await assert.rejects(f.store.put("croqui", "image/png", png), /Sem permissão/);
  assert.equal(f.requests.length, count);
});

test("Magalu candidato: exige versionamento antes de enviar e recusa bytes corrompidos", async () => {
  const f = fixture(); f.disable();
  await assert.rejects(f.store.put("croqui", "image/png", png), InventoryObjectStoreError);
  assert.equal(f.requests.filter(r => r.method === "PUT").length, 0);
  const g = fixture(), receipt = await g.store.put("croqui", "image/png", png);
  g.corrupt(); await assert.rejects(g.store.get(receipt), InventoryObjectStoreError);
});

test("Magalu candidato: preserva dois PDFs completos, sem substituir chave", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([200,200]);
  const bytes = await pdf.save();
  const f = fixture();
  const a = await f.store.put("croqui", "application/pdf", bytes);
  const b = await f.store.put("croqui", "application/pdf", bytes);
  assert.notEqual(a.id, b.id);
  assert.equal((await PDFDocument.load(await f.store.get(a))).getPageCount(), 1);
  assert.equal((await PDFDocument.load(await f.store.get(b))).getPageCount(), 1);
  await assert.rejects(f.store.temporaryDownload(a, 301), InventoryObjectStoreError);
  await assert.rejects(f.store.put("../fora", "image/png", png), InventoryObjectStoreError);
});

test("Magalu candidato: rejeita arquivo grande antes da rede e recibo sem versão", async () => {
  const f = fixture();
  await assert.rejects(f.store.put("croqui", "image/png", Buffer.alloc(1024 * 1024 + 1)), InventoryObjectStoreError);
  assert.equal(f.requests.length, 0);
  const receipt = await f.store.put("croqui", "image/png", png);
  const count = f.requests.length;
  await assert.rejects(f.store.get({ ...receipt, versionId: "null" }), InventoryObjectStoreError);
  await assert.rejects(f.store.temporaryDownload({ ...receipt, id: "../fora" }), InventoryObjectStoreError);
  assert.equal(f.requests.length, count);
});
