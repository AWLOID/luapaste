import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { noStoreJsonHeaders, sameOriginOk } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreJsonHeaders() });
  }

  const res = NextResponse.json({ ok: true }, { headers: noStoreJsonHeaders() });
  clearSessionCookie(res);
  return res;
}
