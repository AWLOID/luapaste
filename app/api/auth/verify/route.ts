import { NextRequest, NextResponse } from 'next/server';
import { makeAdminSessionToken, setSessionCookie } from '@/lib/auth';
import { emailCodeMatches, EMAIL_CODE_MAX_ATTEMPTS } from '@/lib/emailVerification';
import { noStoreJsonHeaders, sameOriginOk } from '@/lib/http';
import { clientIp, hitPersistentRateLimit, rateLimitKey } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdminEmail, isValidEmail, normalizeEmail } from '@/lib/users';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreJsonHeaders() });
  }

  let payload: { email?: string; code?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  const email = normalizeEmail(payload.email || '');
  const code = (payload.code || '').trim();

  if (!isValidEmail(email) || !/^[0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid email or code.' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  const ip = clientIp(req.headers);
  const limited = await hitPersistentRateLimit(rateLimitKey('admin-verify-ip', ip), 12, 15 * 60 * 1000);
  if (limited) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: noStoreJsonHeaders() });
  }

  // Defence in depth: only the admin email can ever produce a session.
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Invalid email or code.' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  const db = supabaseAdmin();
  const { data: record } = await db
    .from('email_verification_codes')
    .select('id,code_hash,attempts,expires_at,consumed_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!record || record.consumed_at) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await db.from('email_verification_codes').delete().eq('id', record.id);
    return NextResponse.json({ error: 'Code has expired. Request a new one.' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  if ((record.attempts ?? 0) >= EMAIL_CODE_MAX_ATTEMPTS) {
    await db.from('email_verification_codes').delete().eq('id', record.id);
    return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429, headers: noStoreJsonHeaders() });
  }

  if (!emailCodeMatches(email, code, record.code_hash)) {
    await db
      .from('email_verification_codes')
      .update({ attempts: (record.attempts ?? 0) + 1 })
      .eq('id', record.id);
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  // Success: consume the code atomically so it can never be redeemed twice,
  // even by two concurrent requests racing each other.
  const { data: consumed } = await db
    .from('email_verification_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', record.id)
    .is('consumed_at', null)
    .select('id');

  if (!consumed || consumed.length === 0) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  await db.from('email_verification_codes').delete().eq('email', email);

  const res = NextResponse.json({ ok: true }, { headers: noStoreJsonHeaders() });
  setSessionCookie(res, makeAdminSessionToken(email));
  return res;
}