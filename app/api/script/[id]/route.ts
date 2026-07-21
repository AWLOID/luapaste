import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { noStoreJsonHeaders } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Valid ID is required' }, { status: 400, headers: noStoreJsonHeaders() });
  }

  const { data, error } = await supabaseAdmin()
    .from('scripts')
    .select('id,name,extension,hits,is_encrypted,expires_at,last_accessed_at,created_at,updated_at')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStoreJsonHeaders() });

  // Content is NEVER returned. It's encrypted and the key doesn't exist on the server.
  return NextResponse.json({ script: { ...data, content: undefined } }, { headers: noStoreJsonHeaders() });
}
