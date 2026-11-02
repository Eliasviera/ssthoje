import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const PASSWORD_MIN_LENGTH = 12;

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: MAX_MEMORY_BYTES,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function validateAccountPassword(password: string) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH || password.length > 256) {
    throw new Error(`A senha deve ter entre ${PASSWORD_MIN_LENGTH} e 256 caracteres.`);
  }
}

export async function hashAccountPassword(password: string) {
  validateAccountPassword(password);
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyAccountPassword(password: string, encoded: string) {
  if (typeof password !== "string" || typeof encoded !== "string" || encoded.length > 256) return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt"
    || parts[1] !== String(SCRYPT_COST)
    || parts[2] !== String(SCRYPT_BLOCK_SIZE)
    || parts[3] !== String(SCRYPT_PARALLELIZATION)
    || !/^[A-Za-z0-9_-]+$/.test(parts[4])
    || !/^[A-Za-z0-9_-]+$/.test(parts[5])) return false;

  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES
    || salt.toString("base64url") !== parts[4]
    || expected.toString("base64url") !== parts[5]) return false;
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected);
}

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error("Convite inválido ou malformado.");
  }
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== token) {
    throw new Error("Convite inválido ou malformado.");
  }
  return createHash("sha256").update(bytes).digest("hex");
}
