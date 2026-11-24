import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getObjectStorageProbe, runObjectStorageProbe } from "../src/lib/object-storage-probe.ts";
import type { InventoryObjectReceipt } from "../src/lib/inventory-magalu-object-store.ts";

const original = process.cwd();
const names = ["SST_OBJECT_PROBE_ENABLED", "SST_OBJECT_BUCKET", "SST_OBJECT_REGION", "SST_OBJECT_ACCESS_KEY_ID", "SST_OBJECT_SECRET_ACCESS_KEY"];
let environment: Array<string | undefined>;
beforeEach(() => {
  environment = names.map(n => process.env[n]);
  process.chdir(mkdtempSync(join(tmpdir(), "sst-storage-probe-")));
  Object.assign(process.env, { SST_OBJECT_PROBE_ENABLED: "1", SST_OBJECT_BUCKET: "bucket-ficticio", SST_OBJECT_REGION: "br-se1", SST_OBJECT_ACCESS_KEY_ID: "ID_FICTICIO", SST_OBJECT_SECRET_ACCESS_KEY: "SEGREDO_FICTICIO" });
});
afterEach(() => { process.chdir(original); names.forEach((n, i) => { if (environment[i] === undefined) delete process.env[n]; else process.env[n] = environment[i]; }); });
function fixture(publicAccess = false) {
  let puts = 0; let bytes: Buffer; let receipt: InventoryObjectReceipt;
  const store = { async put(resourceId: string, mime: "application/pdf", input: Uint8Array) {
    puts++; bytes = Buffer.from(input); receipt = { id: randomUUID(), tenantId: "platform-storage-test", resourceId, versionId: "versao-ficticia", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), mime }; return receipt;
  }, async get() { return bytes; }, async temporaryDownload() { return "https://br-se1.magaluobjects.com/bucket-ficticio/ficticio?signature=ficticia"; } };
  return { deps: { createStore: () => store, fetch: async (url: URL | RequestInfo) => new URL(String(url)).search ? new Response(bytes as unknown as BodyInit) : new Response(null, { status: publicAccess ? 200 : 403 }) }, puts: () => puts };
}
test("probe: somente Master, sem rede ou estado de execução para outros perfis", async () => {
  const f = fixture() as unknown as { deps: NonNullable<Parameters<typeof runObjectStorageProbe>[1]>; puts: () => number };
  for (const user of ["sst-demo-user", "sst-demo-user-b", "", "forjado"]) {
    assert.throws(() => getObjectStorageProbe(user), /exclusivo/);
    await assert.rejects(runObjectStorageProbe(user, f.deps), /exclusivo/);
  }
  assert.equal(f.puts(), 0); assert.equal(existsSync("data/object-storage-probe/state.json"), false);
});
test("probe: desativado por padrão mesmo com credenciais e não chama provedor", async () => {
  delete process.env.SST_OBJECT_PROBE_ENABLED;
  const f = fixture() as unknown as { deps: NonNullable<Parameters<typeof runObjectStorageProbe>[1]>; puts: () => number };
  assert.equal(getObjectStorageProbe("sst-demo-master").state, "disabled");
  await assert.rejects(runObjectStorageProbe("sst-demo-master", f.deps), /desativado/);
  assert.equal(f.puts(), 0);
});
test("probe: PDF completo, resultado persistido, auditoria e repetição sem novo envio", async () => {
  const f = fixture() as unknown as { deps: NonNullable<Parameters<typeof runObjectStorageProbe>[1]>; puts: () => number };
  assert.equal((await runObjectStorageProbe("sst-demo-master", f.deps)).state, "verified");
  assert.equal((await runObjectStorageProbe("sst-demo-master", f.deps)).state, "verified");
  assert.equal(f.puts(), 1);
  const stored = readFileSync("data/object-storage-probe/state.json", "utf8");
  assert.ok(!stored.includes("signature") && !stored.includes("SEGREDO"));
  assert.match(readFileSync("data/audit-log.jsonl", "utf8"), /object-storage-probe-verified/);
});
test("probe: acesso público reprova, mantém recibo e bloqueia repetição imediata", async () => {
  const f = fixture(true) as unknown as { deps: NonNullable<Parameters<typeof runObjectStorageProbe>[1]>; puts: () => number };
  await assert.rejects(runObjectStorageProbe("sst-demo-master", f.deps), /não foi concluída/);
  assert.equal(getObjectStorageProbe("sst-demo-master").state, "pending");
  await assert.rejects(runObjectStorageProbe("sst-demo-master", f.deps), /um minuto/);
  assert.equal(f.puts(), 1);
  const path = "data/object-storage-probe/state.json", stored = JSON.parse(readFileSync(path, "utf8"));
  stored.attempts = 3; stored.lastAttempt = "2020-01-01T00:00:00.000Z"; writeFileSync(path, JSON.stringify(stored));
  await assert.rejects(runObjectStorageProbe("sst-demo-master", f.deps), /três tentativas/);
  assert.equal(existsSync("data/object-storage-probe/probe.lock"), false);
});
test("probe: trava exclusiva impede execução concorrente sem novo envio", async () => {
  const f = fixture() as unknown as { deps: NonNullable<Parameters<typeof runObjectStorageProbe>[1]>; puts: () => number }; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const base = f.deps.createStore!;
  const first = runObjectStorageProbe("sst-demo-master", { ...f.deps, createStore: () => { const store = base("sst-demo-master"); return { ...store, async get(receipt: Parameters<typeof store.get>[0]) { await gate; return store.get(receipt); } }; } });
  await assert.rejects(runObjectStorageProbe("sst-demo-master", f.deps), /andamento/);
  release(); await first;
  assert.equal(f.puts(), 1);
});
