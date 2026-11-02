import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LegacyStorageVerificationError,
  prepareLegacyReceiptPrivateObject,
  type PrivateObjectStore,
  verifyLegacyReceiptReadback,
} from "../src/lib/third-party-legacy-storage-verification.ts";
import { createLocalPrivateObjectStore } from "../src/lib/third-party-private-filesystem-store.ts";

const bytes = Buffer.from("%PDF-1.7\nsynthetic third-party PDF bytes\n");
const digest = createHash("sha256").update(bytes).digest("hex");
const storageKey = Buffer.alloc(32, 19);
const input = () => ({
  receipt: { tenantId: "tenant-a", receiptId: "receipt-a", digest, size: bytes.byteLength },
  expectedObjectId: "opaque-object-a",
  sourceBytes: Buffer.from(bytes),
  object: { tenantId: "tenant-a", objectId: "opaque-object-a", digest, size: bytes.byteLength, state: "verified" as "verified" | "quarantined" | "unavailable" },
  readbackBytes: Buffer.from(bytes),
});

test("verifies tenant, source bytes, private readback digest and size", () => {
  assert.deepEqual(verifyLegacyReceiptReadback(input()), {
    tenantId: "tenant-a",
    receiptId: "receipt-a",
    objectId: "opaque-object-a",
    digest,
    size: bytes.byteLength,
  });
});

test("rejects a cross-tenant object before comparing bytes", () => {
  const candidate = input();
  candidate.object.tenantId = "tenant-b";
  assert.throws(() => verifyLegacyReceiptReadback(candidate), (error) =>
    error instanceof LegacyStorageVerificationError && error.code === "tenant_mismatch");
});

test("rejects legacy metadata that does not match the reread source", () => {
  const candidate = input();
  candidate.sourceBytes = Buffer.from("changed source");
  assert.throws(() => verifyLegacyReceiptReadback(candidate), (error) =>
    error instanceof LegacyStorageVerificationError && error.code === "source_mismatch");
});

test("rejects a private object unless its current state is verified", () => {
  const candidate = input();
  candidate.object.state = "quarantined";
  assert.throws(() => verifyLegacyReceiptReadback(candidate), (error) =>
    error instanceof LegacyStorageVerificationError && error.code === "object_unverified");
});

test("rejects changed or truncated private readback bytes", () => {
  const candidate = input();
  candidate.readbackBytes = Buffer.from("different bytes");
  assert.throws(() => verifyLegacyReceiptReadback(candidate), (error) =>
    error instanceof LegacyStorageVerificationError && error.code === "object_mismatch");
});

test("rejects a readback whose opaque object ID differs from the stored result", () => {
  const candidate = input();
  candidate.object.objectId = "different-object";
  assert.throws(() => verifyLegacyReceiptReadback(candidate), (error) =>
    error instanceof LegacyStorageVerificationError && error.code === "object_mismatch");
});

test("rejects malformed evidence metadata", () => {
  const candidate = input();
  candidate.receipt.digest = "not-a-digest";
  assert.throws(() => verifyLegacyReceiptReadback(candidate), (error) =>
    error instanceof LegacyStorageVerificationError && error.code === "invalid_evidence");
});

function memoryStore(readbackBytes = Buffer.from(bytes), existing = false) {
  const calls = { puts: 0, reads: 0, removals: 0, idempotencyKey: "" };
  const store: PrivateObjectStore = {
    async put(value) {
      calls.puts++;
      calls.idempotencyKey = value.idempotencyKey;
      return { objectId: "opaque-object-a", created: !existing };
    },
    async read({ tenantId, objectId }) {
      calls.reads++;
      return {
        object: { tenantId, objectId, digest, size: bytes.byteLength, state: "verified" },
        bytes: Buffer.from(readbackBytes),
      };
    },
    async removeUncommitted() { calls.removals++; },
  };
  return { store, calls };
}

test("prepares and verifies a private copy using an idempotency key", async () => {
  const backend = memoryStore();
  const result = await prepareLegacyReceiptPrivateObject({
    store: backend.store,
    receipt: input().receipt,
    sourceBytes: Buffer.from(bytes),
    idempotencyKey: "tenant-a:receipt-a:copy-1",
  });
  assert.equal(result.objectId, "opaque-object-a");
  assert.equal(backend.calls.idempotencyKey, "tenant-a:receipt-a:copy-1");
  assert.equal(backend.calls.reads, 1);
  assert.equal(backend.calls.removals, 0);
});

test("removes only a newly created copy when readback verification fails", async () => {
  const backend = memoryStore(Buffer.from("corrupt object"));
  await assert.rejects(() => prepareLegacyReceiptPrivateObject({
    store: backend.store,
    receipt: input().receipt,
    sourceBytes: Buffer.from(bytes),
    idempotencyKey: "tenant-a:receipt-a:copy-2",
  }), (error) => error instanceof LegacyStorageVerificationError && error.code === "object_mismatch");
  assert.equal(backend.calls.removals, 1);
});

test("does not remove a pre-existing idempotent object after a failed verification", async () => {
  const backend = memoryStore(Buffer.from("corrupt object"), true);
  await assert.rejects(() => prepareLegacyReceiptPrivateObject({
    store: backend.store,
    receipt: input().receipt,
    sourceBytes: Buffer.from(bytes),
    idempotencyKey: "tenant-a:receipt-a:copy-3",
  }));
  assert.equal(backend.calls.removals, 0);
});

test("preserves verification and cleanup failures for controlled recovery", async () => {
  const backend = memoryStore();
  const verificationFailure = new Error("synthetic readback failure");
  const cleanupFailure = new Error("synthetic cleanup failure");
  const store: PrivateObjectStore = {
    ...backend.store,
    async read() { throw verificationFailure; },
    async removeUncommitted() { throw cleanupFailure; },
  };
  await assert.rejects(() => prepareLegacyReceiptPrivateObject({
    store,
    receipt: input().receipt,
    sourceBytes: Buffer.from(bytes),
    idempotencyKey: "tenant-a:receipt-a:cleanup-failure",
  }), (error) => error instanceof AggregateError
    && error.errors[0] === verificationFailure
    && error.errors[1] === cleanupFailure);
});

test("does not write when the source metadata or bytes disagree", async () => {
  const backend = memoryStore();
  await assert.rejects(() => prepareLegacyReceiptPrivateObject({
    store: backend.store,
    receipt: input().receipt,
    sourceBytes: Buffer.from("changed source"),
    idempotencyKey: "tenant-a:receipt-a:copy-4",
  }), (error) => error instanceof LegacyStorageVerificationError && error.code === "source_mismatch");
  assert.equal(backend.calls.puts, 0);
});

test("backend mutation of its upload buffer cannot alter the verified source snapshot", async () => {
  const backend = memoryStore();
  const store: PrivateObjectStore = {
    ...backend.store,
    async put(value) {
      value.bytes.fill(0);
      return { objectId: "opaque-object-a", created: true };
    },
  };
  const result = await prepareLegacyReceiptPrivateObject({
    store,
    receipt: input().receipt,
    sourceBytes: Buffer.from(bytes),
    idempotencyKey: "tenant-a:receipt-a:copy-5",
  });
  assert.equal(result.digest, digest);
});

test("caller mutation after invocation cannot change the bytes verified after storage", async () => {
  let releasePut!: () => void;
  let startedPut!: () => void;
  const putStarted = new Promise<void>((resolve) => { startedPut = resolve; });
  const putGate = new Promise<void>((resolve) => { releasePut = resolve; });
  const backend = memoryStore();
  const store: PrivateObjectStore = {
    ...backend.store,
    async put() {
      startedPut();
      await putGate;
      return { objectId: "opaque-object-a", created: true };
    },
  };
  const callerBytes = Buffer.from(bytes);
  const pending = prepareLegacyReceiptPrivateObject({
    store,
    receipt: input().receipt,
    sourceBytes: callerBytes,
    idempotencyKey: "tenant-a:receipt-a:copy-6",
  });
  await putStarted;
  callerBytes.fill(0);
  releasePut();
  const result = await pending;
  assert.equal(result.digest, digest);
});

test("prepares, reads back and retries through the real local adapter using only synthetic bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "sst-legacy-storage-e2e-"));
  try {
    const store = createLocalPrivateObjectStore(root, storageKey);
    const receipt = { tenantId: "tenant-a", receiptId: "receipt-a", digest, size: bytes.length };
    const idempotencyKey = "tenant-a:receipt-a:synthetic-e2e";
    const first = await prepareLegacyReceiptPrivateObject({ store, receipt, sourceBytes: Buffer.from(bytes), idempotencyKey });
    const retry = await prepareLegacyReceiptPrivateObject({ store, receipt, sourceBytes: Buffer.from(bytes), idempotencyKey });
    assert.deepEqual(retry, first);
    const readback = await store.read({ tenantId: first.tenantId, objectId: first.objectId });
    assert.equal(readback.object.state, "verified");
    assert.deepEqual(readback.bytes, bytes);
    assert.deepEqual(await readdir(join(root, "tenant-a")), [first.objectId]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("removes a newly created local object when real adapter readback is quarantined", async () => {
  const root = await mkdtemp(join(tmpdir(), "sst-legacy-storage-quarantine-"));
  try {
    const localStore = createLocalPrivateObjectStore(root, storageKey);
    let createdObjectId = "";
    const store: PrivateObjectStore = {
      ...localStore,
      async put(value) {
        const stored = await localStore.put(value);
        createdObjectId = stored.objectId;
        return stored;
      },
      async read(value) {
        await writeFile(join(root, value.tenantId, value.objectId, "content.pdf"), Buffer.from("%PDF-1.7\naltered synthetic bytes\n"));
        return localStore.read(value);
      },
    };
    await assert.rejects(() => prepareLegacyReceiptPrivateObject({
      store,
      receipt: input().receipt,
      sourceBytes: Buffer.from(bytes),
      idempotencyKey: "tenant-a:receipt-a:quarantine-e2e",
    }), (error) => error instanceof LegacyStorageVerificationError && error.code === "object_unverified");
    assert.ok(createdObjectId);
    assert.deepEqual(await readdir(join(root, "tenant-a")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
