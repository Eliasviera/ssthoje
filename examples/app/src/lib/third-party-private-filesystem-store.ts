import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PrivateObjectStore } from "./third-party-legacy-storage-verification";

const MAX_BYTES = 7 * 1024 * 1024;
const TENANT_ID = /^[a-zA-Z0-9_-]{1,120}$/;
const OBJECT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const REGISTRY_OBJECT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const REGISTRY_QUERY = "SELECT tenant_id, object_id FROM third_party_legacy_reconciliation_candidate.list_registered_private_file_objects() ORDER BY object_id";
const snapshotBrand: unique symbol = Symbol("registered-private-object-snapshot");
const identity = (info: Awaited<ReturnType<typeof lstat>>) => [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");

export type RegisteredPrivateObjectSnapshot = Readonly<{ tenantId: string; [snapshotBrand]: true }>;

interface RegistryQueryResult {
  rows: unknown[];
}

interface RegistryQueryable {
  query(statement: string, values: unknown[]): Promise<RegistryQueryResult>;
}

const registeredObjectsBySnapshot = new WeakMap<object, ReadonlySet<string>>();

export async function readRegisteredPrivateObjectSnapshot(
  queryable: RegistryQueryable,
  trustedTenantId: string,
): Promise<RegisteredPrivateObjectSnapshot> {
  if (!TENANT_ID.test(trustedTenantId)) throw new PrivateFilesystemStoreError("invalid_input");
  const result = await queryable.query(REGISTRY_QUERY, []);
  if (!result || !Array.isArray(result.rows)) throw new PrivateFilesystemStoreError("invalid_input");
  const ids = new Set<string>();
  for (const row of result.rows) {
    if (!row || typeof row !== "object") throw new PrivateFilesystemStoreError("invalid_input");
    const record = row as Record<string, unknown>;
    if (record.tenant_id !== trustedTenantId || typeof record.object_id !== "string" || !REGISTRY_OBJECT_ID.test(record.object_id)) {
      throw new PrivateFilesystemStoreError("invalid_input");
    }
    ids.add(record.object_id.toLowerCase());
  }
  const snapshot = Object.freeze({ tenantId: trustedTenantId, [snapshotBrand]: true as const });
  registeredObjectsBySnapshot.set(snapshot, ids);
  return snapshot;
}

export interface LocalPrivateObjectRecoveryPlan {
  scanned: number;
  blocked: number;
  staleTemporaryDirectories: number;
  candidates: Array<{ tenantId: string; objectId: string; digest: string; size: number; createdAt: string }>;
}

interface PrivateObjectManifest {
  version: 1;
  tenantId: string;
  objectId: string;
  digest: string;
  size: number;
  createdAt: string;
  mac: string;
}

function manifestMac(key: Uint8Array, value: Omit<PrivateObjectManifest, "mac">): string {
  return createHmac("sha256", key).update(JSON.stringify(value), "utf8").digest("hex");
}

export class PrivateFilesystemStoreError extends Error {
  readonly code: "invalid_input" | "unsafe_path" | "object_conflict" | "unavailable";

  constructor(code: PrivateFilesystemStoreError["code"]) {
    super("O armazenamento privado local não concluiu a operação.");
    this.name = "PrivateFilesystemStoreError";
    this.code = code;
  }
}

function normalizeStorageError(error: unknown): unknown {
  if (error instanceof PrivateFilesystemStoreError) return error;
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
    && ["EBUSY", "EACCES", "EIO", "EMFILE", "ENFILE", "ENOSPC", "ENOENT", "ENOTDIR", "EPERM"].includes(error.code)
  ) {
    return new PrivateFilesystemStoreError("unavailable");
  }
  return error;
}

async function withStorageErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeStorageError(error);
  }
}

function objectIdFor(key: Uint8Array, tenantId: string, idempotencyKey: string): string {
  const bytes = createHmac("sha256", key).update(`${tenantId}\0${idempotencyKey}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertPdf(bytes: Uint8Array): void {
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_BYTES || Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new PrivateFilesystemStoreError("invalid_input");
  }
}

export function createLocalPrivateObjectStore(rootDirectory: string, hmacKey: Uint8Array): PrivateObjectStore & {
  planRecovery(input: { registrySnapshot: RegisteredPrivateObjectSnapshot; minimumAgeMs: number; now?: Date }): Promise<LocalPrivateObjectRecoveryPlan>;
} {
  const root = resolve(rootDirectory);
  const key = Uint8Array.from(hmacKey);
  if (!rootDirectory || key.byteLength < 32) {
    throw new PrivateFilesystemStoreError("invalid_input");
  }

  async function assertDirectory(path: string): Promise<void> {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) {
      throw new PrivateFilesystemStoreError("unsafe_path");
    }
  }

  async function tenantDirectory(tenantId: string, create: boolean): Promise<string> {
    if (!TENANT_ID.test(tenantId)) throw new PrivateFilesystemStoreError("invalid_input");
    await assertDirectory(root);
    const directory = join(root, tenantId);
    if (create) {
      try { await mkdir(directory, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    await assertDirectory(directory);
    return directory;
  }

  async function readFileSafely(path: string, parent: string, maxBytes: number): Promise<Buffer> {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes || await realpath(path) !== path) {
      throw new PrivateFilesystemStoreError("unsafe_path");
    }
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const initial = await handle.stat();
      if (!initial.isFile() || identity(initial) !== identity(before)) throw new PrivateFilesystemStoreError("unsafe_path");
      const chunks: Buffer[] = [];
      let total = 0;
      const chunk = Buffer.alloc(64 * 1024);
      for (;;) {
        const result = await handle.read(chunk, 0, chunk.length, null);
        if (!result.bytesRead) break;
        total += result.bytesRead;
        if (total > maxBytes) throw new PrivateFilesystemStoreError("unsafe_path");
        chunks.push(Buffer.from(chunk.subarray(0, result.bytesRead)));
      }
      const bytes = Buffer.concat(chunks, total);
      const after = await handle.stat();
      await assertDirectory(parent);
      const current = await lstat(path);
      if (identity(after) !== identity(initial) || identity(current) !== identity(before) || await realpath(path) !== path) {
        throw new PrivateFilesystemStoreError("unsafe_path");
      }
      return bytes;
    } finally {
      await handle.close();
    }
  }

  async function readObject(tenantId: string, objectId: string) {
    if (!OBJECT_ID.test(objectId)) throw new PrivateFilesystemStoreError("invalid_input");
    const directory = await tenantDirectory(tenantId, false);
    const objectDirectory = join(directory, objectId);
    await assertDirectory(objectDirectory);
    const contentPath = join(objectDirectory, "content.pdf");
    const manifestPath = join(objectDirectory, "manifest.json");
    const bytes = await readFileSafely(contentPath, objectDirectory, MAX_BYTES);
    const manifestBytes = await readFileSafely(manifestPath, objectDirectory, 4096);
    const actualDigest = digest(bytes);
    let manifest: unknown;
    try { manifest = JSON.parse(manifestBytes.toString("utf8")); }
    catch { manifest = null; }
    const record = manifest && typeof manifest === "object" ? manifest as Record<string, unknown> : {};
    const payload = {
      version: record.version,
      tenantId: record.tenantId,
      objectId: record.objectId,
      digest: record.digest,
      size: record.size,
      createdAt: record.createdAt,
    };
    const expectedMac = manifestMac(key, payload as Omit<PrivateObjectManifest, "mac">);
    const suppliedMac = typeof record.mac === "string" && SHA256.test(record.mac) ? Buffer.from(record.mac, "hex") : Buffer.alloc(0);
    const verified = suppliedMac.length === 32
      && timingSafeEqual(Buffer.from(expectedMac, "hex"), suppliedMac)
      && record.version === 1
      && record.tenantId === tenantId
      && record.objectId === objectId
      && typeof record.digest === "string" && SHA256.test(record.digest)
      && record.digest === actualDigest
      && Number.isSafeInteger(record.size) && record.size === bytes.byteLength
      && typeof record.createdAt === "string" && Number.isFinite(Date.parse(record.createdAt))
      && bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES;
    return {
      object: {
        tenantId,
        objectId,
        digest: verified ? record.digest as string : actualDigest,
        size: verified ? record.size as number : bytes.byteLength,
        state: verified ? "verified" as const : "quarantined" as const,
      },
      bytes,
    };
  }

  return {
    async put(input) {
      return withStorageErrors(async () => {
        if (!TENANT_ID.test(input.tenantId) || !input.idempotencyKey.trim() || input.idempotencyKey.length > 200
            || !/^[a-f0-9]{64}$/.test(input.digest) || !Number.isSafeInteger(input.size)
            || input.size !== input.bytes.byteLength || input.size < 1 || input.size > MAX_BYTES) {
          throw new PrivateFilesystemStoreError("invalid_input");
        }
        const bytes = Uint8Array.from(input.bytes);
        assertPdf(bytes);
        if (digest(bytes) !== input.digest) throw new PrivateFilesystemStoreError("invalid_input");
        const objectId = objectIdFor(key, input.tenantId, input.idempotencyKey);
        const directory = await tenantDirectory(input.tenantId, true);
        const target = join(directory, objectId);
        const temporary = join(directory, `.tmp-${randomUUID()}`);
        await mkdir(temporary, { mode: 0o700 });
        let operationError: unknown;
        let operationFailed = false;
        try {
          const contentPath = join(temporary, "content.pdf");
          const contentHandle = await open(contentPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
          try { await contentHandle.writeFile(bytes); await contentHandle.sync(); }
          finally { await contentHandle.close(); }
          const manifestPath = join(temporary, "manifest.json");
          const manifestHandle = await open(manifestPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
          try {
            const payload = { version: 1 as const, tenantId: input.tenantId, objectId, digest: input.digest, size: input.size, createdAt: new Date().toISOString() };
            const manifest: PrivateObjectManifest = { ...payload, mac: manifestMac(key, payload) };
            await manifestHandle.writeFile(JSON.stringify(manifest), "utf8");
            await manifestHandle.sync();
          } finally { await manifestHandle.close(); }

          try {
            await rename(temporary, target);
            return { objectId, created: true };
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST" && code !== "ENOTEMPTY" && code !== "EPERM") throw error;
            if (code === "EPERM") {
              try { await lstat(target); }
              catch { throw error; }
            }
            const existing = await readObject(input.tenantId, objectId);
            if (existing.object.state !== "verified" || existing.object.digest !== input.digest || existing.object.size !== input.size) {
              throw new PrivateFilesystemStoreError("object_conflict");
            }
            return { objectId, created: false };
          }
        } catch (error) {
          operationFailed = true;
          operationError = error;
          throw error;
        } finally {
          try {
            await rm(temporary, { recursive: true, force: true });
          } catch (cleanupError) {
            if (operationFailed) {
              throw new AggregateError(
                [normalizeStorageError(operationError), normalizeStorageError(cleanupError)],
                "A cópia temporária privada não pôde ser removida com segurança.",
              );
            }
            throw cleanupError;
          }
        }
      });
    },
    async read(input) {
      return withStorageErrors(() => readObject(input.tenantId, input.objectId));
    },
    async removeUncommitted(input) {
      return withStorageErrors(async () => {
        if (!OBJECT_ID.test(input.objectId)) throw new PrivateFilesystemStoreError("invalid_input");
        const directory = await tenantDirectory(input.tenantId, false);
        const objectDirectory = join(directory, input.objectId);
        await assertDirectory(objectDirectory);
        const contentPath = join(objectDirectory, "content.pdf");
        const manifestPath = join(objectDirectory, "manifest.json");
        for (const path of [contentPath, manifestPath]) {
          const info = await lstat(path);
          if (!info.isFile() || info.isSymbolicLink() || await realpath(path) !== path) {
            throw new PrivateFilesystemStoreError("unsafe_path");
          }
        }
        await unlink(contentPath);
        await unlink(manifestPath);
        await assertDirectory(directory);
        await rmdir(objectDirectory);
      });
    },
    async planRecovery(input) {
      return withStorageErrors(async () => {
        const registeredObjects = input.registrySnapshot && registeredObjectsBySnapshot.get(input.registrySnapshot);
        if (!registeredObjects || !Number.isSafeInteger(input.minimumAgeMs) || input.minimumAgeMs < 0
            || (input.now !== undefined && !Number.isFinite(input.now.getTime()))) {
          throw new PrivateFilesystemStoreError("invalid_input");
        }
        await assertDirectory(root);
        const now = input.now?.getTime() ?? Date.now();
        const plan: LocalPrivateObjectRecoveryPlan = { scanned: 0, blocked: 0, staleTemporaryDirectories: 0, candidates: [] };
        const tenantPath = join(root, input.registrySnapshot.tenantId);
        try { await assertDirectory(tenantPath); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return plan;
          plan.blocked++;
          return plan;
        }
        for (const objectEntry of await readdir(tenantPath, { withFileTypes: true })) {
          const objectPath = join(tenantPath, objectEntry.name);
          if (objectEntry.name.startsWith(".tmp-")) {
            try {
              const info = await lstat(objectPath);
              if (info.isDirectory() && !info.isSymbolicLink() && now - info.mtimeMs >= input.minimumAgeMs) plan.staleTemporaryDirectories++;
              else if (!info.isDirectory() || info.isSymbolicLink()) plan.blocked++;
            } catch { plan.blocked++; }
            continue;
          }
          if (!OBJECT_ID.test(objectEntry.name)) { plan.blocked++; continue; }
          plan.scanned++;
          try {
            const result = await readObject(input.registrySnapshot.tenantId, objectEntry.name);
            if (result.object.state !== "verified") { plan.blocked++; continue; }
            const manifestBytes = await readFileSafely(join(objectPath, "manifest.json"), objectPath, 4096);
            const record = JSON.parse(manifestBytes.toString("utf8")) as PrivateObjectManifest;
            const createdAtMs = Date.parse(record.createdAt);
            if (registeredObjects.has(objectEntry.name)) continue;
            if (now - createdAtMs < input.minimumAgeMs) continue;
            plan.candidates.push({ tenantId: input.registrySnapshot.tenantId, objectId: objectEntry.name, digest: record.digest, size: record.size, createdAt: record.createdAt });
          } catch { plan.blocked++; }
        }
        return plan;
      });
    },
  };
}
