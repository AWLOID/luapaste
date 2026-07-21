import { NextRequest } from 'next/server';
import { env } from './env';

export function originFromRequest(req: NextRequest): string {
  const configuredOrigin = env.appOrigin();
  if (configuredOrigin) return configuredOrigin;

  const requestUrl = new URL(req.url);
  if (['https:', 'http:'].includes(requestUrl.protocol)) {
    return requestUrl.origin;
  }

  return 'https://localhost:3000';
}

export function textDenied(status = 403): Response {
  return new Response('Access denied', {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }
  });
}

function sameOrigin(origin: string, target: string): boolean {
  try {
    const originUrl = new URL(origin);
    const targetUrl = new URL(target);
    return originUrl.protocol === targetUrl.protocol && originUrl.host === targetUrl.host;
  } catch {
    return false;
  }
}

export function sameOriginOk(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const requestOrigin = new URL(req.url).origin;

  if (origin && !sameOrigin(origin, requestOrigin)) return false;

  const referer = req.headers.get('referer');
  if (!origin && referer && !sameOrigin(referer, requestOrigin)) return false;

  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite && !['same-origin', 'none'].includes(secFetchSite)) {
    return false;
  }

  return true;
}

export function noStoreJsonHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  } as const;
}
