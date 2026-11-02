import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TenantRole } from "./tenant-access";
import type { DocumentKind } from "./document-categories";
import { assertStorageCapacity } from "./storage-quota.ts";

export type { DocumentKind } from "./document-categories";
export type DocumentStatus = "received" | "superseded" | "archived";
export type DocumentHistoryEntry = {
  id: string;
  action: "uploaded" | "superseded" | "archived";
  occurredAt: string;
  actorUserId: string;
  actorRole: TenantRole;
  version: number;
};
export type StoredDocument = {
  id: string;
  groupId: string;
  tenantId: string;
  companyId: string;
  unitId: string;
  title: string;
  kind: DocumentKind;
  originalFileName: string;
  storageName: string;
  size: number;
  version: number;
  status: DocumentStatus;
  validUntil: string;
  uploadedAt: string;
  uploadedBy: string;
  history: DocumentHistoryEntry[];
};
export type DocumentGroup = Omit<StoredDocument, "history" | "storageName"> & {
  versions: Array<Omit<StoredDocument, "storageName">>;
};
export type NewDocumentInput = Omit<StoredDocument, "id" | "groupId" | "storageName" | "version" | "status" | "uploadedAt" | "history">;

function getMetadataPath() {
  return join(process.cwd(), "data", "documents.json");
}

function getFilesPath(tenantId: string, storageName: string) {
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeStorageName = storageName.replace(/[^a-zA-Z0-9_.-]/g, "");
  return join(process.cwd(), "data", "document-files", safeTenantId, safeStorageName);
}

function readAll(): StoredDocument[] {
  try {
    const value: unknown = JSON.parse(readFileSync(getMetadataPath(), "utf8"));
    if (!Array.isArray(value)) throw new Error("O arquivo local de documentos tem formato inválido.");
    return value as StoredDocument[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(documents: StoredDocument[]) {
  const path = getMetadataPath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(documents, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

function writePdf(tenantId: string, storageName: string, bytes: Uint8Array) {
  assertStorageCapacity(tenantId, bytes.byteLength);
  const path = getFilesPath(tenantId, storageName);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: "wx" });
}

function publicDocument(document: StoredDocument): Omit<StoredDocument, "storageName"> {
  return {
    id: document.id,
    groupId: document.groupId,
    tenantId: document.tenantId,
    companyId: document.companyId,
    unitId: document.unitId,
    title: document.title,
    kind: document.kind,
    originalFileName: document.originalFileName,
    size: document.size,
    version: document.version,
    status: document.status,
    validUntil: document.validUntil,
    uploadedAt: document.uploadedAt,
    uploadedBy: document.uploadedBy,
    history: document.history.map((entry) => ({ ...entry })),
  };
}

export function listDocumentGroupsForTenant(tenantId: string): DocumentGroup[] {
  const documents = readAll().filter((document) => document.tenantId === tenantId);
  const groups = new Map<string, StoredDocument[]>();
  for (const document of documents) groups.set(document.groupId, [...(groups.get(document.groupId) ?? []), document]);
  return [...groups.values()].map((versions) => versions.sort((a, b) => b.version - a.version)).map((versions) => {
    const current = versions[0];
    return { ...publicDocument(current), versions: versions.map(publicDocument) };
  }).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function createDocumentVersion(input: NewDocumentInput, bytes: Uint8Array, actor: { userId: string; role: TenantRole }): StoredDocument {
  const documents = readAll();
  const now = new Date().toISOString();
  const document: StoredDocument = {
    ...input,
    id: randomUUID(),
    groupId: randomUUID(),
    storageName: `${randomUUID()}.pdf`,
    version: 1,
    status: "received",
    uploadedAt: now,
    history: [{ id: randomUUID(), action: "uploaded", occurredAt: now, actorUserId: actor.userId, actorRole: actor.role, version: 1 }],
  };
  writePdf(document.tenantId, document.storageName, bytes);
  writeAll([...documents, document]);
  return document;
}

export function replaceDocumentVersion(groupId: string, bytes: Uint8Array, fileName: string, size: number, actor: { userId: string; role: TenantRole }, tenantId: string): StoredDocument | null {
  const documents = readAll();
  const versions = documents.filter((document) => document.groupId === groupId && document.tenantId === tenantId).sort((a, b) => b.version - a.version);
  const current = versions[0];
  if (!current || current.status === "archived") return null;

  const now = new Date().toISOString();
  current.status = "superseded";
  current.history.push({ id: randomUUID(), action: "superseded", occurredAt: now, actorUserId: actor.userId, actorRole: actor.role, version: current.version });
  const safeFileName = fileName.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, "").slice(0, 140) || "documento.pdf";
  const replacement: StoredDocument = {
    ...current,
    id: randomUUID(),
    storageName: `${randomUUID()}.pdf`,
    originalFileName: safeFileName,
    size,
    version: current.version + 1,
    status: "received",
    uploadedAt: now,
    uploadedBy: actor.userId,
    history: [{ id: randomUUID(), action: "uploaded", occurredAt: now, actorUserId: actor.userId, actorRole: actor.role, version: current.version + 1 }],
  };
  writePdf(replacement.tenantId, replacement.storageName, bytes);
  writeAll([...documents, replacement]);
  return replacement;
}

export function archiveDocumentGroup(groupId: string, tenantId: string, actor: { userId: string; role: TenantRole }): boolean {
  const documents = readAll();
  const current = documents.filter((document) => document.groupId === groupId && document.tenantId === tenantId).sort((a, b) => b.version - a.version)[0];
  if (!current || current.status === "archived") return false;
  current.status = "archived";
  current.history.push({ id: randomUUID(), action: "archived", occurredAt: new Date().toISOString(), actorUserId: actor.userId, actorRole: actor.role, version: current.version });
  writeAll(documents);
  return true;
}

export function readDocumentFileForTenant(documentId: string, tenantId: string) {
  const document = readAll().find((entry) => entry.id === documentId && entry.tenantId === tenantId);
  if (!document) return null;
  try {
    return { bytes: readFileSync(getFilesPath(document.tenantId, document.storageName)), size: document.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
