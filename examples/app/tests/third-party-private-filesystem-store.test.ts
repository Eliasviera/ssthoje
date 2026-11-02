import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPrivateObjectStore, PrivateFilesystemStoreError, readRegisteredPrivateObjectSnapshot } from "../src/lib/third-party-private-filesystem-store.ts";

const bytes = Buffer.from("%PDF-1.7\nsynthetic private object bytes only\n");
const digest = createHash("sha256").update(bytes).digest("hex");
const key = Buffer.alloc(32, 19);

async function withStore(run: (root: string, store: ReturnType<typeof createLocalPrivateObjectStore>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "sst-private-objects-"));
  try { await run(root, createLocalPrivateObjectStore(root, key)); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("writes atomically, scopes by tenant and verifies idempotent readback", async () => withStore(async (root, store) => {
  const input = { tenantId: "tenant-a", idempotencyKey: "receipt-a:copy-1", digest, size: bytes.length, bytes };
  const [first, retry] = await Promise.all([store.put(input), store.put(input)]);
  assert.match(first.objectId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(first.objectId, retry.objectId);
  assert.notEqual(first.created, retry.created);
  const result = await store.read({ tenantId: "tenant-a", objectId: first.objectId });
  assert.equal(result.object.state, "verified");
  assert.equal(result.object.digest, digest);
  assert.deepEqual(result.bytes, bytes);
  assert.ok((await readFile(join(root, "tenant-a", first.objectId, "manifest.json"))).length > 0);
  await assert.rejects(store.read({ tenantId: "tenant-b", objectId: first.objectId }));
}));

test("classifies missing storage paths as unavailable without creating data outside the configured root", async () => {
  const parent = await mkdtemp(join(tmpdir(), "sst-private-missing-root-"));
  try {
    const root = join(parent, "missing", "store");
    const store = createLocalPrivateObjectStore(root, key);
    await assert.rejects(
      store.put({ tenantId: "tenant-a", idempotencyKey: "missing-root", digest, size: bytes.length, bytes }),
      (error) => error instanceof PrivateFilesystemStoreError && error.code === "unavailable",
    );
    await assert.rejects(
      store.read({ tenantId: "tenant-a", objectId: "00000000-0000-4000-8000-000000000001" }),
      (error) => error instanceof PrivateFilesystemStoreError && error.code === "unavailable",
    );
    assert.deepEqual(await readdir(parent), []);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("rejects an idempotency conflict without replacing the original private object", async () => withStore(async (root, store) => {
  const original = await store.put({ tenantId: "tenant-a", idempotencyKey: "same-key", digest, size: bytes.length, bytes });
  const changedBytes = Buffer.from("%PDF-1.7\nchanged synthetic payload\n");
  await assert.rejects(
    store.put({
      tenantId: "tenant-a",
      idempotencyKey: "same-key",
      digest: createHash("sha256").update(changedBytes).digest("hex"),
      size: changedBytes.length,
      bytes: changedBytes,
    }),
    (error) => error instanceof PrivateFilesystemStoreError && error.code === "object_conflict",
  );
  const preserved = await store.read({ tenantId: "tenant-a", objectId: original.objectId });
  assert.equal(preserved.object.state, "verified");
  assert.deepEqual(preserved.bytes, bytes);
}));

test("rejects mismatched hashes and invalid PDF bytes before writing", async () => withStore(async (root, store) => {
  await assert.rejects(store.put({ tenantId: "tenant-a", idempotencyKey: "bad", digest: "0".repeat(64), size: bytes.length, bytes }),
    (error) => error instanceof PrivateFilesystemStoreError && error.code === "invalid_input");
  const plainText = Buffer.from("not a pdf");
  await assert.rejects(store.put({ tenantId: "tenant-a", idempotencyKey: "bad-pdf", digest: createHash("sha256").update(plainText).digest("hex"), size: plainText.length, bytes: plainText }),
    (error) => error instanceof PrivateFilesystemStoreError && error.code === "invalid_input");
  assert.deepEqual(await readdir(root), []);
}));

test("marks altered object content quarantined on readback", async () => withStore(async (root, store) => {
  const stored = await store.put({ tenantId: "tenant-a", idempotencyKey: "tamper", digest, size: bytes.length, bytes });
  await writeFile(join(root, "tenant-a", stored.objectId, "content.pdf"), Buffer.from("%PDF-1.7\nchanged"));
  const readback = await store.read({ tenantId: "tenant-a", objectId: stored.objectId });
  assert.equal(readback.object.state, "quarantined");
}));

test("marks an altered manifest quarantined on readback", async () => withStore(async (root, store) => {
  const stored = await store.put({ tenantId: "tenant-a", idempotencyKey: "tampered-manifest", digest, size: bytes.length, bytes });
  const manifestPath = join(root, "tenant-a", stored.objectId, "manifest.json");
  const manifest = JSON.parse((await readFile(manifestPath)).toString("utf8")) as Record<string, unknown>;
  manifest.createdAt = "2000-01-01T00:00:00.000Z";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const readback = await store.read({ tenantId: "tenant-a", objectId: stored.objectId });
  assert.equal(readback.object.state, "quarantined");
}));

test("bounds readback memory when a private file grows beyond the PDF limit", async () => withStore(async (root, store) => {
  const stored = await store.put({ tenantId: "tenant-a", idempotencyKey: "oversize", digest, size: bytes.length, bytes });
  const oversized = Buffer.alloc(7 * 1024 * 1024 + 1);
  Buffer.from("%PDF-").copy(oversized);
  await writeFile(join(root, "tenant-a", stored.objectId, "content.pdf"), oversized);
  await assert.rejects(store.read({ tenantId: "tenant-a", objectId: stored.objectId }),
    (error) => error instanceof PrivateFilesystemStoreError && error.code === "unsafe_path");
}));

test("removes only the exact tenant-scoped uncommitted object", async () => withStore(async (root, store) => {
  const stored = await store.put({ tenantId: "tenant-a", idempotencyKey: "remove", digest, size: bytes.length, bytes });
  await store.removeUncommitted({ tenantId: "tenant-a", objectId: stored.objectId });
  await assert.rejects(store.read({ tenantId: "tenant-a", objectId: stored.objectId }));
  assert.deepEqual(await readdir(join(root, "tenant-a")), []);
}));

test("recovery planning lists only old unregistered objects and never removes them", async () => withStore(async (root, store) => {
  const registered = await store.put({ tenantId: "tenant-a", idempotencyKey: "registered", digest, size: bytes.length, bytes });
  const orphan = await store.put({ tenantId: "tenant-a", idempotencyKey: "orphan", digest, size: bytes.length, bytes });
  const registrySnapshot = await readRegisteredPrivateObjectSnapshot({
    async query(statement, values) {
      assert.match(statement, /list_registered_private_file_objects\(\) ORDER BY object_id$/);
      assert.deepEqual(values, []);
      return { rows: [{ tenant_id: "tenant-a", object_id: registered.objectId }] };
    },
  }, "tenant-a");
  const plan = await store.planRecovery({
    registrySnapshot,
    minimumAgeMs: 0,
    now: new Date(Date.now() + 1000),
  });
  assert.equal(plan.scanned, 2);
  assert.equal(plan.blocked, 0);
  assert.deepEqual(plan.candidates.map(({ objectId }) => objectId), [orphan.objectId]);
  assert.equal((await store.read({ tenantId: "tenant-a", objectId: orphan.objectId })).object.state, "verified");
  assert.equal((await readdir(join(root, "tenant-a"))).length, 2);
}));

test("recovery planning blocks altered manifests and only counts old temporary directories", async () => withStore(async (root, store) => {
  const stored = await store.put({ tenantId: "tenant-a", idempotencyKey: "tampered-manifest", digest, size: bytes.length, bytes });
  const manifestPath = join(root, "tenant-a", stored.objectId, "manifest.json");
  const manifest = JSON.parse((await readFile(manifestPath)).toString("utf8")) as Record<string, unknown>;
  manifest.createdAt = "2000-01-01T00:00:00.000Z";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const temporary = join(root, "tenant-a", ".tmp-interrupted-write");
  await mkdir(temporary);
  const old = new Date("2000-01-01T00:00:00.000Z");
  await utimes(temporary, old, old);

  const registrySnapshot = await readRegisteredPrivateObjectSnapshot({ async query() { return { rows: [] }; } }, "tenant-a");
  const plan = await store.planRecovery({ registrySnapshot, minimumAgeMs: 60_000 });
  assert.equal(plan.scanned, 1);
  assert.equal(plan.blocked, 1);
  assert.equal(plan.staleTemporaryDirectories, 1);
  assert.deepEqual(plan.candidates, []);
  assert.ok((await readdir(join(root, "tenant-a"))).includes(stored.objectId));
  assert.ok((await readdir(join(root, "tenant-a"))).includes(".tmp-interrupted-write"));
}));

test("registry snapshot refuses cross-tenant or malformed rows and does not hide query failures", async () => {
  await assert.rejects(readRegisteredPrivateObjectSnapshot({
    async query() { return { rows: [{ tenant_id: "tenant-b", object_id: "00000000-0000-4000-8000-000000000001" }] }; },
  }, "tenant-a"), (error) => error instanceof PrivateFilesystemStoreError && error.code === "invalid_input");
  await assert.rejects(readRegisteredPrivateObjectSnapshot({
    async query() { return { rows: [{ tenant_id: "tenant-a", object_id: "not-a-uuid" }] }; },
  }, "tenant-a"), (error) => error instanceof PrivateFilesystemStoreError && error.code === "invalid_input");
  await assert.rejects(readRegisteredPrivateObjectSnapshot({
    async query() { throw new Error("database unavailable"); },
  }, "tenant-a"), /database unavailable/);
});

test("rejects a tenant directory redirected by a symlink or junction", async (t) => {
  await withStore(async (root, store) => {
    const outside = join(root, "outside");
    await mkdir(outside);
    try {
      await symlink(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        t.skip("symlink/junction creation is not permitted in this environment");
        return;
      }
      throw error;
    }
    await assert.rejects(store.put({ tenantId: "linked", idempotencyKey: "redirect", digest, size: bytes.length, bytes }),
      (error) => error instanceof PrivateFilesystemStoreError && error.code === "unsafe_path");
  });
});

test("rejects an object directory redirected outside the tenant root", async (t) => {
  await withStore(async (root, store) => {
    const outside = join(root, "outside");
    await mkdir(outside);
    const objectId = "00000000-0000-4000-8000-000000000001";
    const tenantPath = join(root, "tenant-a");
    await mkdir(tenantPath);

    try {
      await symlink(outside, join(tenantPath, objectId), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        t.skip("symlink/junction creation is not permitted in this environment");
        return;
      }
      throw error;
    }
    await assert.rejects(store.read({ tenantId: "tenant-a", objectId }),
      (error) => error instanceof PrivateFilesystemStoreError && error.code === "unsafe_path");
  });
});

test("rejects a file symlink and leaves its outside target intact", async (t) => {
  await withStore(async (root, store) => {
    const tenantPath = join(root, "tenant-a");
    const objectId = "00000000-0000-4000-8000-000000000001";
    await mkdir(join(tenantPath, objectId), { recursive: true });
    const outsideContent = join(root, "outside.pdf");
    await writeFile(outsideContent, bytes);
    try {
      await symlink(outsideContent, join(tenantPath, objectId, "content.pdf"), "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        t.skip("file symlink creation is not permitted in this environment");
        return;
      }
      throw error;
    }
    await assert.rejects(store.read({ tenantId: "tenant-a", objectId }),
      (error) => error instanceof PrivateFilesystemStoreError && error.code === "unsafe_path");
    assert.deepEqual(await readFile(outsideContent), bytes);
  });
});
