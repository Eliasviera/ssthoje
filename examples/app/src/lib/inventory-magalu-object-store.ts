import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AttachmentAuthorizer, AttachmentMime } from "./inventory-attachment-sandbox.ts";

export type InventoryObjectReceipt = {
  id: string; tenantId: string; resourceId: string; versionId: string;
  size: number; sha256: string; mime: AttachmentMime;
};
type Config = { region: "br-se1" | "br-ne1"; bucket: string; accessKeyId: string; secretAccessKey: string; maxFileBytes: number };
const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const mimeTypes = new Set(["image/png", "image/jpeg", "application/pdf"]);
export class InventoryObjectStoreError extends Error {
  constructor() { super("Não foi possível validar o arquivo no armazenamento privado. Tente novamente ou solicite suporte."); this.name = "InventoryObjectStoreError"; }
}
function requireValid(condition: unknown): asserts condition { if (!condition) throw new InventoryObjectStoreError(); }

/** Candidato isolado: ainda sem integração com rotas, reserva de cota ou banco de inventários. */
export function createMagaluInventoryObjectStore(config: Config, authorize: AttachmentAuthorizer, injectedClient?: S3Client) {
  requireValid(["br-se1", "br-ne1"].includes(config.region));
  requireValid(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket));
  requireValid(config.accessKeyId && config.secretAccessKey && Number.isSafeInteger(config.maxFileBytes) && config.maxFileBytes > 0);
  const { bucket, maxFileBytes } = config;
  const client = injectedClient ?? new S3Client({
    region: config.region, endpoint: `https://${config.region}.magaluobjects.com`, forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 2, followRegionRedirects: false,
  });
  async function scope(action: "upload" | "download", resourceId: string) {
    requireValid(typeof resourceId === "string" && idPattern.test(resourceId));
    const result = await authorize(action, resourceId);
    requireValid(result && result.resourceId === resourceId && [result.tenantId, result.actorId].every(v => typeof v === "string" && idPattern.test(v)));
    return { ...result };
  }
  function key(tenantId: string, resourceId: string, id: string) {
    return `inventory/${tenantId}/${resourceId}/${id}`;
  }
  async function checkedReceipt(receipt: InventoryObjectReceipt) {
    const trusted = await scope("download", receipt.resourceId);
    requireValid(receipt.tenantId === trusted.tenantId && uuidPattern.test(receipt.id));
    requireValid(typeof receipt.versionId === "string" && receipt.versionId.length > 0 && receipt.versionId !== "null" && receipt.versionId.length <= 1024);
    requireValid(Number.isSafeInteger(receipt.size) && receipt.size > 0 && receipt.size <= maxFileBytes && /^[a-f0-9]{64}$/.test(receipt.sha256) && mimeTypes.has(receipt.mime));
    return key(trusted.tenantId, trusted.resourceId, receipt.id);
  }
  async function readAndCheck(receipt: InventoryObjectReceipt, objectKey: string) {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey, VersionId: receipt.versionId }), { abortSignal: AbortSignal.timeout(30000) });
    requireValid(result.VersionId === receipt.versionId && result.ContentLength === receipt.size && result.ContentType === receipt.mime && result.Body);
    const chunks: Buffer[] = []; let total = 0;
    // Leitura limitada mesmo se o servidor informar Content-Length incorreto.
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength; requireValid(total <= receipt.size);
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    requireValid(total === receipt.size && createHash("sha256").update(bytes).digest("hex") === receipt.sha256);
    return bytes;
  }
  return {
    async put(resourceId: string, mime: AttachmentMime, input: Uint8Array): Promise<InventoryObjectReceipt> {
      requireValid(input instanceof Uint8Array && input.byteLength > 0 && input.byteLength <= maxFileBytes && mimeTypes.has(mime));
      const bytes = Buffer.from(input);
      const trusted = await scope("upload", resourceId);
      try {
        const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(15000) });
        requireValid(versioning.Status === "Enabled");
        const id = randomUUID(), sha256 = createHash("sha256").update(bytes).digest("hex");
        const objectKey = key(trusted.tenantId, trusted.resourceId, id);
        const uploaded = await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: bytes, ContentLength: bytes.length, ContentType: mime, ACL: "private", Metadata: { sha256 } }), { abortSignal: AbortSignal.timeout(30000) });
        requireValid(uploaded.VersionId && uploaded.VersionId !== "null");
        const receipt = { id, tenantId: trusted.tenantId, resourceId: trusted.resourceId, versionId: uploaded.VersionId, size: bytes.length, sha256, mime };
        await readAndCheck(receipt, objectKey);
        return receipt;
      } catch { throw new InventoryObjectStoreError(); }
    },
    /** O recibo precisa vir do banco confiável, nunca do corpo enviado pelo navegador. */
    async get(trustedReceipt: InventoryObjectReceipt) {
      const receipt = { ...trustedReceipt };
      const objectKey = await checkedReceipt(receipt);
      try { return await readAndCheck(receipt, objectKey); } catch { throw new InventoryObjectStoreError(); }
    },
    async temporaryDownload(trustedReceipt: InventoryObjectReceipt, expiresIn = 60) {
      requireValid(Number.isInteger(expiresIn) && expiresIn >= 1 && expiresIn <= 300);
      const receipt = { ...trustedReceipt };
      const objectKey = await checkedReceipt(receipt);
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey, VersionId: receipt.versionId }), { abortSignal: AbortSignal.timeout(15000) });
        requireValid(head.VersionId === receipt.versionId && head.ContentLength === receipt.size && head.ContentType === receipt.mime && head.Metadata?.sha256 === receipt.sha256);
        return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey, VersionId: receipt.versionId, ResponseContentDisposition: "attachment", ResponseCacheControl: "private, no-store" }), { expiresIn });
      } catch { throw new InventoryObjectStoreError(); }
    },
  };
}
