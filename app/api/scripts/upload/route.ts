import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { noStoreJsonHeaders, originFromRequest, sameOriginOk } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { randomToken, sha256 } from '@/lib/tokens';
import { encryptContent } from '@/lib/crypto';
import { clientIp, hitPersistentRateLimit, rateLimitKey } from '@/lib/rateLimit';
import { parseOptionalPositiveInt } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 256 * 1024;
const MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024;
const ALLOWED = new Set(['lua', 'txt']);

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'script.lua';
}

function makeSecretSlug() {
  return randomToken(48).replace(/[^a-zA-Z0-9_-]/g, '');
}

function luaStringLiteral(value: string): string {
  return '"' + value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') + '"';
}

export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreJsonHeaders() });
  }

  // Admin-only. requireAdmin enforces the admin role, not merely a session.
  const authError = await requireAdmin();
  if (authError) return authError;

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413, headers: noStoreJsonHeaders() });
  }

  const ip = clientIp(req.headers);
  if (await hitPersistentRateLimit(rateLimitKey('upload', ip), 120, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many uploads' }, { status: 429, headers: noStoreJsonHeaders() });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    const pastedContent = String(form.get('content') || '');
    const pastedName = String(form.get('name') || '').trim();
    const pastedExt = String(form.get('extension') || 'lua').trim().toLowerCase();
    const expireHoursRaw = String(form.get('expireHours') || '').trim();

    let content: string;
    let safeFileName: string;

    if (file instanceof File) {
      if (file.size <= 0 || file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'File must be between 1 byte and 256 KB' }, { status: 400, headers: noStoreJsonHeaders() });
      }
      safeFileName = cleanName(file.name);
      content = await file.text();
    } else if (pastedContent.trim().length > 0) {
      if (Buffer.byteLength(pastedContent, 'utf8') > MAX_BYTES) {
        return NextResponse.json({ error: 'Pasted content exceeds 256 KB' }, { status: 400, headers: noStoreJsonHeaders() });
      }
      const ext = ALLOWED.has(pastedExt) ? pastedExt : 'lua';
      const base = cleanName(pastedName || 'script').replace(/\.(lua|txt)$/i, '');
      safeFileName = base + '.' + ext;
      content = pastedContent;
    } else {
      return NextResponse.json({ error: 'Provide a file or paste script content' }, { status: 400, headers: noStoreJsonHeaders() });
    }

    const extension = safeFileName.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED.has(extension)) {
      return NextResponse.json({ error: 'Only .lua and .txt are allowed' }, { status: 400, headers: noStoreJsonHeaders() });
    }

    if (content.includes('\u0000')) {
      return NextResponse.json({ error: 'Binary content is not allowed' }, { status: 400, headers: noStoreJsonHeaders() });
    }

    const expireHours = parseOptionalPositiveInt(expireHoursRaw, 24 * 365);
    if (expireHoursRaw && expireHours === null) {
      return NextResponse.json({ error: 'Expiry must be a whole number of hours between 1 and 8760' }, { status: 400, headers: noStoreJsonHeaders() });
    }

    const expiresAt = expireHours
      ? new Date(Date.now() + expireHours * 60 * 60 * 1000).toISOString()
      : null;

    const secretSlug = makeSecretSlug();
    const encryptedContent = encryptContent(content, secretSlug);

    const { data, error } = await supabaseAdmin()
      .from('scripts')
      .insert({
        name: safeFileName,
        extension,
        owner_user_id: null,
        content: encryptedContent,
        token_hash: sha256(secretSlug),
        is_encrypted: true,
        expires_at: expiresAt,
      })
      .select('id,name,extension,hits,is_encrypted,expires_at,last_accessed_at,created_at,updated_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Database insert failed' }, { status: 500, headers: noStoreJsonHeaders() });
    }

    const rawUrl = originFromRequest(req) + '/raw/' + secretSlug + '.' + extension;
    const loadstring = 'loadstring(game:HttpGet(' + luaStringLiteral(rawUrl) + '))()';

    return NextResponse.json({ ok: true, script: data, rawUrl, loadstring, showOnce: true }, { headers: noStoreJsonHeaders() });
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500, headers: noStoreJsonHeaders() });
  }
}