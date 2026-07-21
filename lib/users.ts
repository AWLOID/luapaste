import { env } from './env';
import crypto from 'node:crypto';
// Admin-only access model. There are no user accounts and no registration.
// The single administrator is identified purely by ADMIN_EMAIL.

export const ADMIN_DISPLAY_NAME = 'Administrator';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const value = normalizeEmail(email);
  return value.length > 0 && value.length <= 254 && EMAIL_RE.test(value);
}

/** Constant-time comparison to avoid leaking the admin address via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isAdminEmail(email: string): boolean {
  const configured = normalizeEmail(env.adminEmail() || '');
  if (!configured) return false;
  const candidate = normalizeEmail(email);
  if (!candidate) return false;
  return timingSafeEqual(candidate, configured);
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,10}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export function roleForEmail(email: string): 'admin' | 'user' {
  return isAdminEmail(email) ? 'admin' : 'user';
}

export function usernameForEmail(email: string, requested?: string): string {
  if (requested && isValidUsername(requested)) return requested;
  // Derive a default username from the email local part
  const local = normalizeEmail(email).split('@')[0] || '';
  const cleaned = local.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10);
  return cleaned.length >= 3 ? cleaned : 'user';
}