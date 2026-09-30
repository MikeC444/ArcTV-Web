import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM sealing for the session cookie. The key is derived with HKDF from
 * SESSION_SECRET, so the raw secret is never used directly as a key. Output is
 * base64url(iv | authTag | ciphertext). Any tampering fails authentication and
 * unseal() returns null — callers must treat that exactly like "no cookie".
 */
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "mangotv-web", "session-cookie-v1", 32));
}

export function seal(key: Buffer, payload: unknown, purpose: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  // `purpose` is authenticated (not encrypted) so a cookie sealed for one use
  // (e.g. the session) can never be replayed as another (e.g. the device id).
  cipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
  const plaintext = Buffer.from(JSON.stringify({ v: VERSION, d: payload }), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function unseal<T>(key: Buffer, token: string, purpose: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < IV_BYTES + TAG_BYTES + 2) return null;
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plaintext) as { v: number; d: T };
    return parsed.v === VERSION ? parsed.d : null;
  } catch {
    return null;
  }
}
