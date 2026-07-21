import crypto from 'node:crypto';
import net from 'node:net';
import { env } from './env';
import { supabaseAdmin } from './supabaseAdmin';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** Evict expired buckets so the in-memory map cannot grow without bound. */
function sweepBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function hitRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweepBuckets(now);
  const safeKey = key.slice(0, 256);
  const current = buckets.get(safeKey);

  if (!current || current.resetAt <= now) {
    buckets.set(safeKey, { count: 1, resetAt: now + windowMs });
    return false;
  }

  current.count += 1;
  return current.count > limit;
}

function firstHeaderValue(value: string): string {
  return value.split(',')[0]?.trim() || '';
}

function normalizeIp(value: string): string {
  const candidate = firstHeaderValue(value).replace(/^\[|\]$/g, '');
  if (!candidate || candidate.length > 64) return '';
  return net.isIP(candidate) ? candidate : '';
}

export function clientIp(headers: Headers): string {
  // SECURITY: cf-connecting-ip is only trustworthy when the app really sits
  // behind Cloudflare. Otherwise anyone can send this header with a random
  // value on every request and rotate rate-limit keys at will, bypassing
  // every IP-based rate limit (login-code spam, code brute force, etc.).
  // Enable TRUST_CF_CONNECTING_IP=true only when proxied through Cloudflare.
  const candidates = env.trustCfConnectingIp()
    ? [
        headers.get('cf-connecting-ip') || '',
        headers.get('x-real-ip') || '',
        headers.get('x-forwarded-for') || '',
      ]
    : [
        headers.get('x-real-ip') || '',
        headers.get('x-forwarded-for') || '',
      ];

  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) return normalized;
  }

  return 'unknown';
}

export function rateLimitKey(scope: string, identifier: string): string {
  const scoped = `${scope}:${identifier}`;
  return `${scope}:${crypto.createHmac('sha256', env.authSecret()).update(scoped).digest('hex')}`;
}

export async function hitPersistentRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const { data, error } = await supabaseAdmin().rpc('hit_rate_limit', {
      p_key: key.slice(0, 256),
      p_limit: safeLimit,
      p_window_seconds: safeWindowSeconds,
    });

    if (!error && typeof data === 'boolean') return data;
  } catch {
    // Fall back to process-local protection if the migration has not run yet.
  }

  return hitRateLimit(key, safeLimit, windowMs);
}
