import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, stored] = storedHash.split(":");
  if (!salt || !stored) return false;

  const computed = scryptSync(password, salt, 64).toString("hex");

  try {
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(stored, "hex"));
  } catch {
    return false;
  }
}
