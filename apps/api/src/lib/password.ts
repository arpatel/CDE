import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt-based password hashing using only the Node standard library — no native
// build step required. Format: scrypt$<salt-hex>$<derived-hex>.
// (Production: swap for argon2id behind this same interface.)

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, derivedHex] = parts;
  const derived = Buffer.from(derivedHex!, "hex");
  const candidate = scryptSync(password, salt!, KEYLEN);
  if (derived.length !== candidate.length) return false;
  return timingSafeEqual(derived, candidate);
}
