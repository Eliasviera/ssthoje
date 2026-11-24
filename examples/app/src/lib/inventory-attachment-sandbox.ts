import "server-only";

import { createHash, randomUUID } from "node:crypto";

/** Piloto em memória. Não conectar a rotas nem usar para arquivos reais. */
export type AttachmentScope = { tenantId: string; resourceId: string; actorId: string };
export type AttachmentAction = "upload" | "download";
export type AttachmentMime = "image/jpeg" | "image/png" | "application/pdf";
export type AttachmentRecord = AttachmentScope & {
  id: string;
  previousId?: string;
  mime: AttachmentMime;
  size: number;
  sha256: string;
  createdAt: string;
};
export type AttachmentAudit = AttachmentScope & { action: AttachmentAction; objectId: string; occurredAt: string };

/** A implementação futura deve derivar tenant/ator da sessão e autorizar o recurso no servidor. */
export type AttachmentAuthorizer = (action: AttachmentAction, resourceId: string) => Promise<AttachmentScope>;

export class AttachmentSandboxError extends Error {
  readonly code: "invalid_input" | "not_found" | "quota_exceeded" | "file_too_large";
  constructor(code: AttachmentSandboxError["code"]) {
    super({ invalid_input: "Arquivo ou escopo inválido. Revise o envio.", not_found: "Anexo indisponível para este acesso.", quota_exceeded: "Cota insuficiente. Revise o armazenamento disponível.", file_too_large: "Arquivo excede o limite de envio." }[code]);
    this.name = "AttachmentSandboxError";
    this.code = code;
  }
}

const identifier = /^[a-zA-Z0-9_-]{1,120}$/;
const objectId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function invalid(): never { throw new AttachmentSandboxError("invalid_input"); }

function validateSignature(bytes: Buffer, mime: AttachmentMime) {
  const signatures: Record<AttachmentMime, number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  };
  const signature = Object.hasOwn(signatures, mime) ? signatures[mime] : undefined;
  if (!signature || bytes.length <= signature.length || !signature.every((b, i) => bytes[i] === b)) invalid();
}

/** Sem disco/rede: cotas e auditoria são atômicas apenas dentro desta instância de teste. */
export function createInventoryAttachmentSandbox(options: {
  authorize: AttachmentAuthorizer;
  maxFileBytes: number;
  tenantQuotaBytes: number;
}) {
  if (![options.maxFileBytes, options.tenantQuotaBytes].every(n => Number.isSafeInteger(n) && n > 0)) invalid();
  const { authorize, maxFileBytes, tenantQuotaBytes } = options;
  const objects = new Map<string, { record: AttachmentRecord; bytes: Buffer }>();
  const used = new Map<string, number>();
  const audit: AttachmentAudit[] = [];

  async function scopeFor(action: AttachmentAction, resourceId: string) {
    if (typeof resourceId !== "string" || !identifier.test(resourceId)) invalid();
    const supplied = await authorize(action, resourceId);
    if (!supplied || supplied.resourceId !== resourceId || ![supplied.tenantId, supplied.actorId].every(v => typeof v === "string" && identifier.test(v))) invalid();
    return { tenantId: supplied.tenantId, resourceId, actorId: supplied.actorId };
  }

  function find(scope: AttachmentScope, id: string) {
    if (typeof id !== "string" || !objectId.test(id)) invalid();
    const object = objects.get(id);
    if (!object || object.record.tenantId !== scope.tenantId || object.record.resourceId !== scope.resourceId) throw new AttachmentSandboxError("not_found");
    return object;
  }

  return {
    async upload(input: { resourceId: string; mime: AttachmentMime; bytes: Uint8Array; previousId?: string }) {
      if (!input || !(input.bytes instanceof Uint8Array)) invalid();
      // Copiar antes do await evita adulteração dos bytes enquanto a autorização é consultada.
      if (input.bytes.byteLength > maxFileBytes) throw new AttachmentSandboxError("file_too_large");
      const bytes = Buffer.from(input.bytes);
      const { resourceId, mime, previousId } = input;
      validateSignature(bytes, mime);
      const scope = await scopeFor("upload", resourceId);
      if (previousId !== undefined) find(scope, previousId);
      const current = used.get(scope.tenantId) ?? 0;
      if (current + bytes.length > tenantQuotaBytes) throw new AttachmentSandboxError("quota_exceeded");
      const record: AttachmentRecord = { ...scope, id: randomUUID(), ...(previousId ? { previousId } : {}), mime, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), createdAt: new Date().toISOString() };
      objects.set(record.id, { record, bytes });
      used.set(scope.tenantId, current + bytes.length);
      audit.push({ ...scope, objectId: record.id, action: "upload", occurredAt: record.createdAt });
      return { ...record };
    },
    async download(resourceId: string, id: string) {
      const scope = await scopeFor("download", resourceId);
      const object = find(scope, id);
      audit.push({ ...scope, objectId: id, action: "download", occurredAt: new Date().toISOString() });
      return { record: { ...object.record }, bytes: Buffer.from(object.bytes) };
    },
    // Diagnóstico exclusivo do teste, nunca expor como API do painel.
    inspectForTests() {
      return { audit: audit.map(e => ({ ...e })), usage: Object.fromEntries(used), count: objects.size };
    },
  };
}
