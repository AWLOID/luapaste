import crypto from 'node:crypto';

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = crypto.createHash('sha256').update(a, 'utf8').digest();
  const bb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ab, bb);
}
