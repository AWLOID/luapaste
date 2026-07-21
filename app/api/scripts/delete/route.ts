import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { noStoreJsonHeaders, sameOriginOk } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { clientIp, hitPersistentRateLimit, rateLimitKey } from '@/lib/rateLimit';
import { isUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreJsonHeaders() });
  }

  const authError = await requireAdmin();
  if (authError) return authError;

  const ip = clientIp(req.headers);
  if (await hitPersistentRateLimit(rateLimitKey('delete', ip), 120, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many delete requests' }, { status: 429, headers: noStoreJsonHeaders() });
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!isUuid(id)) return NextResponse.json({ error: 'Valid ID is required' }, { status: 400, headers: noStoreJsonHeaders() });

  const { error } = await supabaseAdmin().from('scripts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500, headers: noStoreJsonHeaders() });
  return NextResponse.json({ ok: true }, { headers: noStoreJsonHeaders() });
}
