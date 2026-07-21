import crypto from 'node:crypto';
import { env } from './env';
import { safeEqual } from './tokens';

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export function generateEmailCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function emailCodeHash(email: string, code: string): string {
  return crypto
    .createHmac('sha256', env.authSecret())
    .update(`email-code:v1:${email}:${code}`)
    .digest('hex');
}

export function emailCodeMatches(email: string, code: string, storedHash: string): boolean {
  return safeEqual(emailCodeHash(email, code), storedHash);
}
