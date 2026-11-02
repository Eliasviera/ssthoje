import "server-only";

import { createHash } from "node:crypto";

export type LegacyReceiptEvidence = Readonly<{
  tenantId: string;
  receiptId: string;
  digest: string;
  size: number;
}>;

export type PrivateObjectReadback = Readonly<{
  tenantId: string;
  objectId: string;
  digest: string;
  size: number;
  state: "verified" | "quarantined" | "unavailable";
}>;

export type LegacyStorageVerification = Readonly<{
  tenantId: string;
  receiptId: string;
  objectId: string;
  digest: string;
  size: number;
}>;

export type PrivateObjectStore = Readonly<{
  put(input: Readonly<{
    tenantId: string;
    idempotencyKey: string;
    digest: string;
    size: number;
    bytes: Uint8Array;
  }>): Promise<Readonly<{ objectId: string; created: boolean }>>;
  read(input: Readonly<{ tenantId: string; objectId: string }>): Promise<Readonly<{
    object: PrivateObjectReadback;
    bytes: Uint8Array;
  }>>;
  removeUncommitted(input: Readonly<{ tenantId: string; objectId: string }>): Promise<void>;
}>;

export class LegacyStorageVerificationError extends Error {
  readonly code: "invalid_evidence" | "tenant_mismatch" | "source_mismatch" | "object_unverified" | "object_mismatch";

  constructor(code: LegacyStorageVerificationError["code"]) {
    super("O arquivo não pôde ser verificado para reconciliação.");
    this.name = "LegacyStorageVerificationError";
    this.code = code;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertEvidence(receipt: LegacyReceiptEvidence, object: PrivateObjectReadback): void {
  if (
    !receipt.tenantId.trim()
    || !receipt.receiptId.trim()
    || !object.tenantId.trim()
    || !object.objectId.trim()
    || !/^[a-f0-9]{64}$/.test(receipt.digest)
    || !/^[a-f0-9]{64}$/.test(object.digest)
    || !Number.isSafeInteger(receipt.size)
    || receipt.size < 0
    || !Number.isSafeInteger(object.size)
    || object.size < 0
  ) {
    throw new LegacyStorageVerificationError("invalid_evidence");
  }
}

export function verifyLegacySourceBytes(receipt: LegacyReceiptEvidence, sourceBytes: Uint8Array): string {
  if (
    !receipt.tenantId.trim()
    || !receipt.receiptId.trim()
    || !/^[a-f0-9]{64}$/.test(receipt.digest)
    || !Number.isSafeInteger(receipt.size)
    || receipt.size < 0
  ) {
    throw new LegacyStorageVerificationError("invalid_evidence");
  }

  const digest = sha256(sourceBytes);
  if (sourceBytes.byteLength !== receipt.size || digest !== receipt.digest) {
    throw new LegacyStorageVerificationError("source_mismatch");
  }
  return digest;
}

/**
 * Compares an authorized legacy read and private-object readback. This does not
 * perform authorization, storage I/O, or a database write; callers must do so.
 */
export function verifyLegacyReceiptReadback(input: Readonly<{
  receipt: LegacyReceiptEvidence;
  expectedObjectId: string;
  sourceBytes: Uint8Array;
  object: PrivateObjectReadback;
  readbackBytes: Uint8Array;
}>): LegacyStorageVerification {
  const { receipt, expectedObjectId, sourceBytes, object, readbackBytes } = input;
  assertEvidence(receipt, object);

  if (!expectedObjectId.trim()) {
    throw new LegacyStorageVerificationError("invalid_evidence");
  }
  if (receipt.tenantId !== object.tenantId) {
    throw new LegacyStorageVerificationError("tenant_mismatch");
  }

  const sourceDigest = verifyLegacySourceBytes(receipt, sourceBytes);

  if (object.state !== "verified") {
    throw new LegacyStorageVerificationError("object_unverified");
  }

  if (object.objectId !== expectedObjectId) {
    throw new LegacyStorageVerificationError("object_mismatch");
  }

  const readbackDigest = sha256(readbackBytes);
  if (
    readbackBytes.byteLength !== object.size
    || readbackDigest !== object.digest
    || object.size !== receipt.size
    || object.digest !== receipt.digest
    || readbackDigest !== sourceDigest
  ) {
    throw new LegacyStorageVerificationError("object_mismatch");
  }

  return {
    tenantId: receipt.tenantId,
    receiptId: receipt.receiptId,
    objectId: object.objectId,
    digest: sourceDigest,
    size: sourceBytes.byteLength,
  };
}

/** Candidate orchestration only; no concrete backend or runtime caller is selected here. */
export async function prepareLegacyReceiptPrivateObject(input: Readonly<{
  store: PrivateObjectStore;
  receipt: LegacyReceiptEvidence;
  sourceBytes: Uint8Array;
  idempotencyKey: string;
}>): Promise<LegacyStorageVerification> {
  const { store, idempotencyKey } = input;
  if (!idempotencyKey.trim() || idempotencyKey.length > 200) {
    throw new LegacyStorageVerificationError("invalid_evidence");
  }

  const receipt = { ...input.receipt };
  const sourceBytes = Uint8Array.from(input.sourceBytes);
  const digest = verifyLegacySourceBytes(receipt, sourceBytes);
  const stored = await store.put({
    tenantId: receipt.tenantId,
    idempotencyKey,
    digest,
    size: sourceBytes.byteLength,
    bytes: Uint8Array.from(sourceBytes),
  });

  try {
    const readback = await store.read({ tenantId: receipt.tenantId, objectId: stored.objectId });
    return verifyLegacyReceiptReadback({
      receipt,
      expectedObjectId: stored.objectId,
      sourceBytes,
      object: readback.object,
      readbackBytes: readback.bytes,
    });
  } catch (error) {
    if (stored.created) {
      try {
        await store.removeUncommitted({ tenantId: receipt.tenantId, objectId: stored.objectId });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "A cópia privada não foi verificada e a limpeza falhou; é necessária recuperação controlada.",
        );
      }
    }
    throw error;
  }
}
