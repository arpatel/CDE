import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

// Local-disk storage adapter. Same interface a future S3 adapter will implement
// (saveBuffer / streamFor / exists), so swapping to S3 won't touch callers.

const BASE_DIR =
  process.env.STORAGE_DIR ?? path.resolve(process.cwd(), "../../.storage");

// File types rejected for security (parity with Asite's restriction).
const BLOCKED_EXTENSIONS = new Set([".exe", ".php", ".htaccess", ".bat", ".cmd", ".sh", ".com", ".msi"]);

export function isBlockedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower);
  // .htaccess has no "extname"; check the basename too.
  return BLOCKED_EXTENSIONS.has(ext) || lower.endsWith(".htaccess");
}

export function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

function absolutePath(key: string): string {
  // Prevent path traversal: resolve and ensure it stays under BASE_DIR.
  const resolved = path.resolve(BASE_DIR, key);
  if (!resolved.startsWith(path.resolve(BASE_DIR))) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

export async function saveBuffer(key: string, buffer: Buffer): Promise<{ size: number; checksum: string }> {
  const dest = absolutePath(key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  return { size: buffer.length, checksum };
}

export function streamFor(key: string) {
  return createReadStream(absolutePath(key));
}

export async function exists(key: string): Promise<boolean> {
  try {
    await stat(absolutePath(key));
    return true;
  } catch {
    return false;
  }
}

export { BASE_DIR };
