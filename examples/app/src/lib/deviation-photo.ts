import "server-only";

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class DeviationPhotoError extends Error {}

export type DecodedDeviationPhoto = { bytes: Buffer; mime: "image/jpeg" | "image/png"; sha256: string };
export type DeviationPhotoMeta = {
  fileName: string;
  mime: "image/jpeg" | "image/png";
  bytes: number;
  sha256: string;
  attachedAt: string;
};

// 450 KB mantém a foto dentro do limite padrão de corpo das Server Actions (1 MB em base64).
const MAX_PHOTO_BYTES = 450 * 1024;
const MIN_PHOTO_BYTES = 1024;
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const FILE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

/** A foto chega do navegador reduzida em JPEG ou PNG; nada além disso é aceito. */
export function decodePhotoDataUrl(value: string): DecodedDeviationPhoto {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(typeof value === "string" ? value.trim() : "");
  if (!match) throw new DeviationPhotoError("A foto deve ser JPEG ou PNG capturada pelo próprio aparelho.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength < MIN_PHOTO_BYTES) throw new DeviationPhotoError("A foto ficou pequena demais. Tente novamente.");
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new DeviationPhotoError("A foto passa de 450 KB mesmo depois de reduzida. Tente outra.");
  const magic = match[1] === "png" ? PNG_MAGIC : JPEG_MAGIC;
  if (!magic.every((byte, index) => bytes[index] === byte)) throw new DeviationPhotoError("O conteúdo da foto não corresponde ao formato informado.");
  return {
    bytes,
    mime: match[1] === "png" ? "image/png" : "image/jpeg",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function photoDirectory() {
  return join(process.cwd(), "data", "deviation-photos");
}

export function saveDeviationPhoto(id: string, photo: DecodedDeviationPhoto): DeviationPhotoMeta {
  if (!FILE_NAME_PATTERN.test(`${id}.${photo.mime === "image/png" ? "png" : "jpg"}`)) throw new DeviationPhotoError("Identificador de foto inválido.");
  const directory = photoDirectory();
  mkdirSync(directory, { recursive: true });
  const fileName = `${id}.${photo.mime === "image/png" ? "png" : "jpg"}`;
  writeFileSync(join(directory, fileName), photo.bytes, { flag: "wx" });
  return { fileName, mime: photo.mime, bytes: photo.bytes.byteLength, sha256: photo.sha256, attachedAt: new Date().toISOString() };
}

export function readDeviationPhoto(fileName: string): Buffer | null {
  if (!FILE_NAME_PATTERN.test(fileName)) return null;
  try {
    return readFileSync(join(photoDirectory(), fileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
