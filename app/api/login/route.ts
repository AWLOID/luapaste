import { NextResponse } from 'next/server';
import { noStoreJsonHeaders } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    { error: 'Password login is disabled. Use email verification.' },
    { status: 410, headers: noStoreJsonHeaders() }
  );
}
