import { NextResponse } from 'next/server';
import { noStoreJsonHeaders } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public registration is permanently disabled. This is an admin-only vault:
// the single administrator signs in via the email login-code flow
// (/api/auth/request-code + /api/auth/verify). No other account can be created.
export async function POST() {
  return NextResponse.json(
    { error: 'Registration is disabled. This is an admin-only vault.' },
    { status: 410, headers: noStoreJsonHeaders() }
  );
}
