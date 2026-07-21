import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { noStoreJsonHeaders, sameOriginOk } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Link rotation is disabled.
 * Scripts are encrypted with the secret slug as the key.
 * The slug is never stored, so re-encryption is impossible without it.
 * To change the URL, delete the script and re-upload it.
 */
export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreJsonHeaders() });
  }

  const authError = await requireAdmin();
  if (authError) return authError;

  return NextResponse.json(
    { error: 'Link rotation is disabled. Content is encrypted with the original URL secret. Delete and re-upload to get a new link.' },
    { status: 410, headers: noStoreJsonHeaders() }
  );
}
