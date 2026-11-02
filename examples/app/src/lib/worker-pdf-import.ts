import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ImportedWorker = {
  id: string;
  registration?: string;
  name?: string;
  cpf?: string;
  birthDate?: string;
  role?: string;
  function?: string;
  department?: string;
  sector?: string;
  admissionDate?: string;
  raw: Record<string, string>;
};

export type WorkerPdfImportResult = {
  fileId: string;
  fileName: string;
  companyName?: string;
  workers: ImportedWorker[];
};

export async function saveWorkerPdfUpload(fileName: string, buffer: Uint8Array): Promise<{ fileId: string; filePath: string }> {
  const fileId = randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadDir = join(process.cwd(), "uploads", "worker-import");
  mkdirSync(uploadDir, { recursive: true });
  const filePath = join(uploadDir, `${fileId}-${safeName}`);
  writeFileSync(filePath, Buffer.from(buffer));
  return { fileId, filePath };
}
