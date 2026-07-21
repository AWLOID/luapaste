import { NextRequest } from 'next/server';
import { textDenied } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isRawRequestAllowed, normalizeRawSlug, rawResponseHeaders } from '@/lib/rawAccess';
import { sha256 } from '@/lib/tokens';
import { decryptContent } from '@/lib/crypto';
import { clientIp, hitPersistentRateLimit, rateLimitKey } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const rawLiquidGlassStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=JetBrains+Mono:wght@600&display=swap');

    :root {
      color-scheme: dark;
      --bg: #101114;
      --surface: #17181d;
      --border: rgba(255, 255, 255, 0.07);
      --text: #f2f3f5;
      --muted: rgba(242, 243, 245, 0.56);
      --accent: #7b7ff2;
      --accent-hover: #8f92f5;
      --red: #ef7a70;
      --red-soft: rgba(239, 122, 112, 0.11);
      --red-border: rgba(239, 122, 112, 0.3);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(1000px 500px at 50% -160px, rgba(123, 127, 242, 0.05), transparent 70%),
        var(--bg);
      color: var(--text);
      font-family: "Manrope", ui-sans-serif, system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 20px;
    }
    .icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }
    .card {
      width: min(460px, 100%);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 26px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), 0 14px 40px rgba(0, 0, 0, 0.22);
      padding: 40px 34px;
      text-align: center;
      animation: fadeIn 0.35s ease-out;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--red-soft);
      color: var(--red);
      border: 1px solid var(--red-border);
      padding: 6px 14px;
      border-radius: 9999px;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 18px;
    }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--red); }
    h1 {
      font-size: 23px;
      letter-spacing: -0.02em;
      margin: 0 0 10px 0;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    p {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .card p:last-child { margin-bottom: 0; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--accent);
      color: #ffffff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 9999px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
      transition: background 0.15s ease, transform 0.1s ease;
    }
    .btn:hover { background: var(--accent-hover); transform: translateY(-1px); }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 560px) {
      body { padding: 12px; }
      .card { padding: 28px 20px; border-radius: 20px; }
    }
`;

function renderHtmlDenied(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Denied - Script Vault</title>
  <style>
    ${rawLiquidGlassStyles}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      Access Blocked
    </div>
    <h1>
      <svg class="icon" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      Direct Access Denied
    </h1>
    <p>Direct web browser access to this raw script is disabled. Use the intended loader client with the exact private URL.</p>
  </div>
</body>
</html>`;
}

function renderHtmlNotFound(title = 'Script Not Found', message = 'The requested script does not exist, has been deleted, or has expired.'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Script Vault</title>
  <style>
    ${rawLiquidGlassStyles}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      Error
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/" class="btn">
      <svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
      Return to Vault
    </a>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { slug, extension } = normalizeRawSlug(id);
  const isAllowed = isRawRequestAllowed(req);
  const ip = clientIp(req.headers);

  if (await hitPersistentRateLimit(rateLimitKey('raw', ip), 600, 60 * 1000)) {
    return textDenied(429);
  }

  // If slug is invalid
  if (!slug || !extension) {
    if (isAllowed) return textDenied(404);
    return new Response(renderHtmlNotFound('Invalid Link', 'The script link you followed is malformed or invalid.'), {
      status: 404,
      headers: {
        ...rawResponseHeaders(),
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }

  const tokenHash = sha256(slug);

  const { data, error } = await supabaseAdmin()
    .from('scripts')
    .select('id,content,is_encrypted,expires_at,hits')
    .eq('token_hash', tokenHash)
    .eq('extension', extension)
    .single();

  // If script not found or database error
  if (error || !data) {
    if (isAllowed) return textDenied(404);
    return new Response(renderHtmlNotFound(), {
      status: 404,
      headers: {
        ...rawResponseHeaders(),
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }

  // If script has expired
  const isExpired = data.expires_at && new Date(data.expires_at).getTime() <= Date.now();
  if (isExpired) {
    if (isAllowed) return textDenied(403);
    return new Response(renderHtmlNotFound('Script Expired', 'This script has expired and is no longer available in the vault.'), {
      status: 403,
      headers: {
        ...rawResponseHeaders(),
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }

  // If browser direct access (not allowed)
  if (!isAllowed) {
    return new Response(renderHtmlDenied(), {
      status: 403,
      headers: {
        ...rawResponseHeaders(),
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }

  if (!data.is_encrypted) return textDenied(410);

  // Decrypt script for valid executor load requests
  const plain = decryptContent(data.content, slug);
  if (plain === null) return textDenied();

  // Atomic increment via RPC (avoids the read-modify-write race that loses
  // hits under concurrent requests). Falls back to a plain update if the
  // migration adding the function has not been applied yet.
  const db = supabaseAdmin();
  const { error: hitError } = await db.rpc('increment_script_hits', { p_id: data.id });
  if (hitError) {
    await db
      .from('scripts')
      .update({ hits: Number(data.hits || 0) + 1, last_accessed_at: new Date().toISOString() })
      .eq('id', data.id);
  }

  return new Response(plain, {
    status: 200,
    headers: rawResponseHeaders(),
  });
}

export async function HEAD() {
  return textDenied();
}

export async function OPTIONS() {
  return textDenied(405);
}
