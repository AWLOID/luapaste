import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/captcha';
import { EMAIL_CODE_TTL_MS, emailCodeHash, generateEmailCode } from '@/lib/emailVerification';
import { noStoreJsonHeaders, sameOriginOk } from '@/lib/http';
import { sendVerificationEmail } from '@/lib/mail';
import { clientIp, hitPersistentRateLimit, rateLimitKey } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdminEmail, isValidEmail, normalizeEmail } from '@/lib/users';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A neutral response that never reveals whether the address is the admin one.
function neutralOk() {
  return NextResponse.json(
    { ok: true, message: 'If this address is authorized, a login code has been sent.' },
    { headers: noStoreJsonHeaders() }
  );
}

export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreJsonHeaders() });
  }

  let payload: { email?: string; captchaToken?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  const email = normalizeEmail(payload.email || '');
  const captchaToken = typeof payload.captchaToken === 'string' ? payload.captchaToken : '';

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  const ip = clientIp(req.headers);

  // Throttle aggressively by IP regardless of whether the email is the admin.
  const ipLimited = await hitPersistentRateLimit(rateLimitKey('admin-code-ip', ip), 8, 15 * 60 * 1000);
  if (ipLimited) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: noStoreJsonHeaders() });
  }

  const captcha = await verifyTurnstileToken(captchaToken, ip, { required: true });
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: captcha.status, headers: noStoreJsonHeaders() });
  }

  // Only the configured admin email may ever receive a code, but the caller
  // cannot distinguish a wrong email from a rate-limited one.
  if (!isAdminEmail(email)) {
    return neutralOk();
  }

  const emailLimited = await hitPersistentRateLimit(rateLimitKey('admin-code-email', email), 5, 15 * 60 * 1000);
  if (emailLimited) {
    return neutralOk();
  }

  const code = generateEmailCode();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();

  const db = supabaseAdmin();
  await db.from('email_verification_codes').delete().eq('email', email);
  const { error } = await db.from('email_verification_codes').insert({
    email,
    username: null,
    code_hash: emailCodeHash(email, code),
    password_hash: null,
    expires_at: expiresAt,
  });

  // SECURITY: error paths must stay neutral too. Returning a distinct 500/502
  // only when the email IS the admin address would let an attacker confirm
  // the admin email by observing error responses. Log server-side instead.
  if (error) {
    console.error('request-code: failed to store verification code', error);
    return neutralOk();
  }

  try {
    await sendVerificationEmail(email, code);
  } catch (err) {
    console.error('request-code: failed to send verification email', err);
    return neutralOk();
  }

  return neutralOk();
}