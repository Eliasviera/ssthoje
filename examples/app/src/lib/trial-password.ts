import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashTrialPassword(password: string) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("Use uma senha entre 12 e 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyTrialPassword(password: string, hash: string) {
  if (typeof password !== "string" || password.length > 128 || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return false;
  const [, salt, expected] = hash.split(":");
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, "hex"));
}
