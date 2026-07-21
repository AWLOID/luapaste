import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Derive a 256-bit key from the secret slug.
 * The slug is never stored — only its sha256 hash lives in the DB.
 * This means nobody with DB access alone can decrypt the content.
 */
function deriveKey(slug: string): Buffer {
  return crypto.createHash('sha256').update(`vault-enc:${slug}`).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM with a key derived from the slug.
 * Returns base64(iv ‖ authTag ‖ ciphertext).
 */
export function encryptContent(plaintext: string, slug: string): string {
  const key = deriveKey(slug);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt ciphertext produced by `encryptContent`.
 * Returns null on any failure (wrong key, tampered data, etc.).
 */
export function decryptContent(ciphertext: string, slug: string): string | null {
  try {
    const key = deriveKey(slug);
    const buf = Buffer.from(ciphertext, 'base64');

    if (buf.length < IV_LENGTH + TAG_LENGTH + 1) return null;

    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
