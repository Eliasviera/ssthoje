import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readPlatformState, isTenantEnabled } from "./tenant-state.ts";
import { DEFAULT_PLAN, planTotals } from "./plan-catalog.ts";

export const MB = 1024 * 1024;
export class StorageQuotaError extends Error {}
// Conta bytes físicos, incluindo versões antigas, arquivos arquivados e órfãos.
export function tenantStorageBytes(tenantId: string): number {
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new StorageQuotaError("Consultoria inválida para armazenamento.");
  function size(path: string): number {
    let info;
    try { info = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; }
    if (info.isSymbolicLink()) throw new StorageQuotaError("Armazenamento local indisponível. Procure o suporte.");
    if (info.isFile()) return info.size;
    if (!info.isDirectory()) throw new StorageQuotaError("Armazenamento local indisponível. Procure o suporte.");
    return readdirSync(path).reduce((total, name) => total + size(join(path, name)), 0);
  }
  return size(join(process.cwd(), "data/document-files", tenantId))
    + size(join(process.cwd(), "data/third-party-files", tenantId));
}
export function assertStorageCapacity(tenantId: string, additionalBytes: number) {
  if (!isTenantEnabled(tenantId)) throw new StorageQuotaError("Consultoria suspensa. Procure o suporte.");
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes <= 0) throw new StorageQuotaError("Tamanho de arquivo inválido.");
  const account = readPlatformState().plans?.[tenantId] ?? DEFAULT_PLAN;
  if (tenantStorageBytes(tenantId) + account.storageUsedMB * MB + additionalBytes > planTotals(account.config).storageMB * MB) throw new StorageQuotaError("Limite de armazenamento atingido. Solicite ajuste do plano à plataforma. Versões anteriores permanecem preservadas.");
}
