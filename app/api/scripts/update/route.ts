import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { noStoreJsonHeaders, sameOriginOk } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { clientIp, hitPersistentRateLimit, rateLimitKey } from '@/lib/rateLimit';
import { isUuid, parseOptionalPositiveInt } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
}

export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreJsonHeaders() });
  }

  const authError = await requireAdmin();
  if (authError) return authError;

  const ip = clientIp(req.headers);
  if (await hitPersistentRateLimit(rateLimitKey('update', ip), 120, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: noStoreJsonHeaders() });
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Valid ID is required' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Rename (keep the original extension).
  if (typeof body.name === 'string' && body.name.trim()) {
    const cleaned = cleanName(body.name.trim());
    if (!cleaned) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400, headers: noStoreJsonHeaders() });
    }
    patch.name = cleaned;
  }

  // Expiry: number of hours from now, or null to make it permanent.
  if (body.expireHours === null) {
    patch.expires_at = null;
  } else if (typeof body.expireHours === 'number' || typeof body.expireHours === 'string') {
    const hours = parseOptionalPositiveInt(String(body.expireHours), 24 * 365);
    if (hours === null) {
      return NextResponse.json({ error: 'Expiry must be 1-8760 hours' }, { status: 400, headers: noStoreJsonHeaders() });
    }
    patch.expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  // Reset the hit counter.
  if (body.resetHits === true) {
    patch.hits = 0;
  }

  const { data, error } = await supabaseAdmin()
    .from('scripts')
    .update(patch)
    .eq('id', id)
    .select('id,name,extension,hits,is_encrypted,expires_at,last_accessed_at,created_at,updated_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500, headers: noStoreJsonHeaders() });
  }

  return NextResponse.json({ ok: true, script: data }, { headers: noStoreJsonHeaders() });
}