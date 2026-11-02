import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { enrichPgrProfile } from "./pgr-profile-projection";

export type ImportedPgrProfile = ReturnType<typeof enrichPgrProfile> & { tenantId: string; companyId: string; unitId: string; documentId: string; inventoryId: string };
export function readCompanyPgrDigitalization(tenantId: string, companyId: string): ImportedPgrProfile | null {
  if (![tenantId, companyId].every(value => /^[a-zA-Z0-9_-]{1,140}$/.test(value))) return null;
  const directory = join(process.cwd(), "data", "pgr-digitalization", tenantId, companyId);
  let receipt;
  const version = existsSync(join(directory,"applied-v3.json")) ? 3 : existsSync(join(directory,"applied-v2.json")) ? 2 : 1;
  try { receipt = JSON.parse(readFileSync(join(directory, `applied-v${version}.json`), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (receipt.tenantId !== tenantId || receipt.companyId !== companyId || receipt.profileFile !== `imported-v${version}.json`) throw new Error("Registro de digitalização incompatível.");
  const profile = JSON.parse(readFileSync(join(directory, `imported-v${version}.json`), "utf8")) as Omit<ImportedPgrProfile, "exposures"> & { exposures: Array<ImportedPgrProfile["exposures"][number] & { result?: string }> };
  if (profile.tenantId !== tenantId || profile.companyId !== companyId || profile.sha256 !== receipt.sha256 || profile.documentId !== receipt.documentId || profile.inventoryId !== receipt.inventoryId) throw new Error("Origem da digitalização incompatível.");
  return { ...profile, exposures: profile.exposures.map(({ result, ...item }) => ({ ...item, intensity: item.intensity || result || "" })) } as ImportedPgrProfile;
}
