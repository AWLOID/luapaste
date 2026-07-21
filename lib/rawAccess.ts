import { NextRequest } from 'next/server';
import { env } from './env';
// --- Signatures -------------------------------------------------------------

// Recognised Roblox clients AND third-party executor/injector HTTP clients.
// Scripts are consumed via `loadstring(game:HttpGet(url))()` running inside an
// executor/injector, each of which sends its own User-Agent — so every known
// executor brand must be allowlisted alongside the genuine Roblox client.
const SCRIPT_CLIENT_UA = /(Roblox|RobloxStudio|HttpGet|HttpService|Synapse|KRNL|Wave|Delta|Fluxus|Arceus|Codex|Solara|Electron|Hydrogen|Trigon|Comet|Swift|Xeno|Velocity|AWP|Sirhurt|ScriptWare|Oxygen|Evon|Valyse)/i;

// Interception, debugging proxies, scrapers and generic HTTP libraries.
// These are exactly what people use to "steal"/inspect a raw script, so they
// are denied outright even if they spoof an Accept header.
const INTERCEPTOR_UA = /(curl|wget|libcurl|python-requests|python-urllib|aiohttp|httpx|httpie|Go-http-client|okhttp|axios|node-fetch|Java\/|Apache-HttpClient|PostmanRuntime|Insomnia|RestSharp|Guzzle|scrapy|HeadlessChrome|PhantomJS|Selenium|Playwright|Puppeteer|mitmproxy|Fiddler|Charles|BurpSuite|ZAP|Wireshark|Paw|Thunder|Hoppscotch)/i;

// Explicit interception-tool fingerprint headers.
// IMPORTANT: we deliberately do NOT block on standard reverse-proxy headers
// (via / forwarded / x-forwarded-* / proxy-connection). Vercel's own edge
// network injects those headers into EVERY incoming request, so blocking on
// them would return 403 to every legitimate executor request too. We only key
// off headers that specific interception tools set explicitly.
const INTERCEPTION_FINGERPRINT_HEADERS = ['x-burp', 'x-charles', 'x-mitmproxy', 'x-scanner', 'fiddler'];

// Headers that only browsers / fetch-from-page contexts emit.
const BROWSER_ONLY_HEADERS = ['sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-site', 'sec-fetch-user', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'upgrade-insecure-requests'];

const MAX_CUSTOM_RULE_LENGTH = 256;
let cachedRuleSource: string | null = null;
let cachedRule: RegExp | null = null;

export function normalizeRawSlug(input: string): { slug: string; extension: 'lua' | 'txt' | null } {
  try {
    const clean = decodeURIComponent(input || '').trim();
    const match = clean.match(/^([a-zA-Z0-9_-]{32,96})\.(lua|txt)$/i);
    if (!match) return { slug: '', extension: null };
    return { slug: match[1], extension: match[2].toLowerCase() as 'lua' | 'txt' };
  } catch {
    return { slug: '', extension: null };
  }
}

function customUserAgentRule(): RegExp | null {
  const source = env.rawUserAgentRegex();
  if (!source) {
    cachedRuleSource = null;
    cachedRule = null;
    return null;
  }
  if (source.length > MAX_CUSTOM_RULE_LENGTH) return null;
  if (source === cachedRuleSource) return cachedRule;
  try {
    cachedRuleSource = source;
    cachedRule = new RegExp(source, 'i');
    return cachedRule;
  } catch {
    cachedRuleSource = source;
    cachedRule = null;
    return null;
  }
}

/**
 * Multi-layer gate that decides whether a /raw request may receive the
 * decrypted script. The goal is to serve only genuine Roblox executors and
 * to block browsers, scrapers, debugging proxies and interception tools.
 */
export function isRawRequestAllowed(req: NextRequest): boolean {
  const h = req.headers;
  const ua = h.get('user-agent') || '';
  const accept = (h.get('accept') || '').toLowerCase();

  // 1. Operator override: if a custom UA regex is configured, it is the single
  //    source of truth (still applied on top of the hard blocks below).
  const customRuleSource = env.rawUserAgentRegex();
  const customRule = customUserAgentRule();

  // 2. Hard block: known interception / scraping / proxy clients.
  if (INTERCEPTOR_UA.test(ua)) return false;
  for (const name of INTERCEPTION_FINGERPRINT_HEADERS) {
    if (h.get(name)) return false;
  }

  // 3. Hard block: anything that looks like a browser document/page context.
  for (const name of BROWSER_ONLY_HEADERS) {
    if (h.get(name)) return false;
  }
  if (h.get('referer') || h.get('origin') || h.get('cookie')) return false;
  if (accept.includes('text/html') || accept.includes('application/xhtml')) return false;

  // 4. Apply the operator override if present.
  if (customRuleSource) return customRule ? customRule.test(ua) : false;

  // 5. Recognised Roblox / executor clients are always allowed.
  if (SCRIPT_CLIENT_UA.test(ua)) return true;

  // 6. Everything else — unknown, minimal, or webview-based executor HTTP
  //    clients that send an unrecognised or Chrome-like User-Agent — is
  //    allowed by default. Genuine browsers are already excluded above by the
  //    browser-only request headers, the referer/origin/cookie check and the
  //    text/html Accept check, none of which an executor's HttpGet sends. We
  //    deliberately do NOT block on User-Agent string alone, because many
  //    injectors are webview based and would otherwise be wrongly rejected.
  //    Set RAW_ALLOW_UNKNOWN_CLIENTS=false to restore strict deny-by-default
  //    (only recognised executor User-Agents allowed).
  return env.rawAllowUnknownClients();
}

export function rawResponseHeaders() {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Disposition': 'inline'
  } as const;
}