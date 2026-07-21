import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { env } from './env';
import { noStoreJsonHeaders } from './http';
import { isAdminEmail } from './users';
import crypto from 'node:crypto';
const COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-lp_session' : 'lp_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

export type AuthSession = {
  role: 'admin' | 'user';
  email: string;
  id?: string;
  username?: string;
  exp: number;
};

type SessionPayload = {
  role: 'admin' | 'user';
  email: string;
  id?: string;
  username?: string;
  exp: number;
};

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromB64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(body: string): string {
  return crypto.createHmac('sha256', env.authSecret()).update(body).digest('base64url');
}

export function makeAdminSessionToken(email: string): string {
  const payload: SessionPayload = {
    role: 'admin',
    email,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function makeUserSessionToken(user: { id: string; email: string; username: string; role: 'admin' | 'user' }): string {
  const payload: SessionPayload = {
    role: user.role,
    email: user.email,
    id: user.id,
    username: user.username,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function verifyToken(token: string | undefined | null): AuthSession | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = sign(body);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(fromB64url(body)) as SessionPayload;
    if (payload.role !== 'admin' && payload.role !== 'user') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (typeof payload.email !== 'string' || !payload.email) return null;
    return {
      role: payload.role,
      email: payload.email,
      id: payload.id,
      username: payload.username,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthSession | null> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value);
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    priority: 'high',
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    priority: 'high',
  });
}

/** Returns an error response when the caller is not the authenticated admin. */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getSession();
  // Enforce the admin role (and that the email still matches ADMIN_EMAIL).
  // A signed session alone is NOT enough — regular users must be rejected.
  if (!session || session.role !== 'admin' || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreJsonHeaders() });
  }
  return null;
}