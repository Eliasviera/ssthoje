import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DocumentSignatureError,
  normalizeSignerName,
  sameSignerName,
  validateSignatureImage,
  type DocumentSigner,
  type DocumentSignature,
  type DocumentSignerRole,
} from "./document-signatures";

// Assinaturas de ciência dos rascunhos de PT/PTE.
// Registro simples desenhado na tela; NÃO é permissão de trabalho, não libera
// atividade e não substitui assinatura qualificada. Fica em arquivo local porque
// o rascunho de PT/PTE ainda é demonstrativo (status draft_demo).

export class WorkPermitSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkPermitSignatureError";
  }
}

export type WorkPermitSignatureState = { signers: DocumentSigner[]; signatures: DocumentSignature[] };

type StoredRecord = WorkPermitSignatureState & { tenantId: string; draftId: string; updatedAt: string };

function storePath() {
  return join(process.cwd(), "data", "work-permit-signatures.json");
}

function readAll(): StoredRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (!Array.isArray(value)) throw new WorkPermitSignatureError("O arquivo local de assinaturas PT/PTE tem formato inválido.");
    return value as StoredRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(records: StoredRecord[]) {
  const target = storePath();
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, target);
}

function validDraftId(value: string) {
  return typeof value === "string" && value.length > 0 && value.length <= 36;
}

function findOrCreate(records: StoredRecord[], tenantId: string, draftId: string): StoredRecord {
  const found = records.find((record) => record.tenantId === tenantId && record.draftId === draftId);
  if (found) return found;
  const created: StoredRecord = { tenantId, draftId, signers: [], signatures: [], updatedAt: new Date().toISOString() };
  records.push(created);
  return created;
}

export function getWorkPermitSignatureState(tenantId: string, draftId: string): WorkPermitSignatureState {
  if (!validDraftId(draftId)) return { signers: [], signatures: [] };
  const record = readAll().find((entry) => entry.tenantId === tenantId && entry.draftId === draftId);
  return record
    ? { signers: record.signers.map((signer) => ({ ...signer })), signatures: record.signatures.map((signature) => ({ ...signature })) }
    : { signers: [], signatures: [] };
}

export function addWorkPermitSigner(
  tenantId: string,
  draftId: string,
  nameInput: string,
  roleInput: string,
  actorUserId: string,
  workerId?: string,
): WorkPermitSignatureState {
  if (!validDraftId(draftId)) throw new WorkPermitSignatureError("O rascunho informado é inválido. Atualize a página.");
  if (!actorUserId?.trim()) throw new WorkPermitSignatureError("A conta que inclui o assinante não foi identificada.");
  if (roleInput !== "issuer" && roleInput !== "participant") throw new WorkPermitSignatureError("Informe se a pessoa é emissor ou participante.");
  let name: string;
  try { name = normalizeSignerName(nameInput); } catch (error) {
    if (error instanceof DocumentSignatureError) throw new WorkPermitSignatureError(error.message);
    throw error;
  }
  const records = readAll();
  const record = records.find((entry) => entry.tenantId === tenantId && entry.draftId === draftId);
  if (!record) {
    // Só cria o registro depois de confirmar que o rascunho existe no chamador.
    const created = findOrCreate(records, tenantId, draftId);
    created.signers.push({ id: randomUUID(), name, role: roleInput as DocumentSignerRole, ...(workerId ? { workerId } : {}) });
    created.updatedAt = new Date().toISOString();
    writeAll(records);
    return { signers: created.signers.map((signer) => ({ ...signer })), signatures: [] };
  }
  if (record.signers.some((signer) => sameSignerName(signer.name, name) || (workerId ? signer.workerId === workerId : false))) {
    throw new WorkPermitSignatureError("Esta pessoa já está na lista de assinaturas.");
  }
  record.signers.push({ id: randomUUID(), name, role: roleInput as DocumentSignerRole, ...(workerId ? { workerId } : {}) });
  record.updatedAt = new Date().toISOString();
  writeAll(records);
  return { signers: record.signers.map((signer) => ({ ...signer })), signatures: record.signatures.map((signature) => ({ ...signature })) };
}

export function signWorkPermit(
  tenantId: string,
  draftId: string,
  signerId: string,
  imageInput: string,
  actorUserId: string,
): WorkPermitSignatureState {
  if (!validDraftId(draftId)) throw new WorkPermitSignatureError("O rascunho informado é inválido. Atualize a página.");
  if (!actorUserId?.trim()) throw new WorkPermitSignatureError("A conta que coleta a assinatura não foi identificada.");
  const records = readAll();
  const record = records.find((entry) => entry.tenantId === tenantId && entry.draftId === draftId);
  const signer = record?.signers.find((entry) => entry.id === signerId);
  if (!record || !signer) throw new WorkPermitSignatureError("O assinante não está na lista deste rascunho. Atualize a página.");
  if (record.signatures.some((signature) => signature.signerId === signerId)) {
    throw new WorkPermitSignatureError("Esta pessoa já assinou este rascunho.");
  }
  let image: string;
  try { image = validateSignatureImage(imageInput); } catch (error) {
    if (error instanceof DocumentSignatureError) throw new WorkPermitSignatureError(error.message);
    throw error;
  }
  const signature: DocumentSignature = {
    signerId: signer.id,
    signerName: signer.name,
    role: signer.role,
    image,
    signedAt: new Date().toISOString(),
    capturedByUserId: actorUserId,
    method: "drawn_on_screen_simple",
  };
  record.signatures.push(signature);
  record.updatedAt = signature.signedAt;
  writeAll(records);
  return { signers: record.signers.map((entry) => ({ ...entry })), signatures: record.signatures.map((entry) => ({ ...entry })) };
}
