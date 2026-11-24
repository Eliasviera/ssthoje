import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const MAX_CLIENT_LOGO_BYTES = 512 * 1024;

function logoPath(tenantId: string, companyId: string) {
  const key = createHash("sha256").update(JSON.stringify([tenantId, companyId])).digest("hex");
  return join(process.cwd(), "data", "client-logos", key);
}

function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  return null;
}

export async function readClientLogo(tenantId: string, companyId: string) {
  try {
    const bytes = await readFile(logoPath(tenantId, companyId));
    const type = imageType(bytes);
    return type ? `data:${type};base64,${bytes.toString("base64")}` : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function saveClientLogo(tenantId: string, companyId: string, bytes: Buffer) {
  if (!isClientLogo(bytes)) throw new Error("Envie um logo PNG ou JPEG de até 512 KB.");
  const path = logoPath(tenantId, companyId);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function isClientLogo(bytes: Buffer) {
  return bytes.length <= MAX_CLIENT_LOGO_BYTES && Boolean(imageType(bytes));
}
