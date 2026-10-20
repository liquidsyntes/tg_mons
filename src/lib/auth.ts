import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'tgmon_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type UserRole = 'ADMIN' | 'USER';

export interface SessionIdentity {
  userId: number | null;
  role: UserRole;
}

const encoder = new TextEncoder();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PBKDF2_ITERATIONS = 100_000;

export type AuthResult =
  | { authorized: true; userId: number | null; role: UserRole }
  | { authorized: false; response: NextResponse };

function safeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index++) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function getSigningKey(token: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return `pbkdf2.${PBKDF2_ITERATIONS}.${toBase64Url(salt)}.${toBase64Url(new Uint8Array(derivedBits))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('.');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1000 || iterations > 1_000_000) return false;
  try {
    const salt = fromBase64Url(parts[2]);
    const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      baseKey,
      256,
    );
    const computed = toBase64Url(new Uint8Array(derivedBits));
    return safeEqual(computed, parts[3]);
  } catch {
    return false;
  }
}

export function isValidAccessKey(value: unknown): boolean {
  const configuredToken = process.env.COLLECT_API_TOKEN;
  return typeof value === 'string' && !!configuredToken && safeEqual(value, configuredToken);
}

export function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
    const host = forwardedHost || request.headers.get('host') || request.nextUrl.host;
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http'
      ? `${forwardedProtocol}:`
      : request.nextUrl.protocol;
    const source = new URL(origin);
    return source.host === host && source.protocol === protocol;
  } catch {
    return false;
  }
}

export function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
}

export async function createSessionCookieValue(identity?: { userId?: number | null; role?: UserRole }): Promise<string> {
  const configuredToken = process.env.COLLECT_API_TOKEN;
  if (!configuredToken) throw new Error('COLLECT_API_TOKEN is not configured');

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));

  const hasUserId = identity?.userId !== undefined && identity?.userId !== null;
  const role: UserRole = identity?.role === 'USER' ? 'USER' : 'ADMIN';
  const payload = hasUserId
    ? `v2.${identity!.userId}.${role}.${expiresAt}.${nonce}`
    : `v1.${expiresAt}.${nonce}`;

  const signature = await crypto.subtle.sign('HMAC', await getSigningKey(configuredToken), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function parseSessionCookieValue(
  value: string | undefined,
  configuredToken: string | undefined = process.env.COLLECT_API_TOKEN,
): Promise<SessionIdentity | null> {
  if (!value || !configuredToken) return null;

  const v2Match = /^v2\.([1-9]\d*)\.(ADMIN|USER)\.(\d{13})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (v2Match) {
    const userId = Number(v2Match[1]);
    const role = v2Match[2] as UserRole;
    const expiresAt = Number(v2Match[3]);
    const now = Date.now();
    if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + SESSION_MAX_AGE_SECONDS * 1000) {
      return null;
    }
    try {
      const payload = `v2.${v2Match[1]}.${v2Match[2]}.${v2Match[3]}.${v2Match[4]}`;
      const valid = await crypto.subtle.verify(
        'HMAC',
        await getSigningKey(configuredToken),
        fromBase64Url(v2Match[5]),
        encoder.encode(payload),
      );
      return valid ? { userId, role } : null;
    } catch {
      return null;
    }
  }

  const v1Match = /^v1\.(\d{13})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!v1Match) return null;

  const expiresAt = Number(v1Match[1]);
  const now = Date.now();
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + SESSION_MAX_AGE_SECONDS * 1000) return null;

  try {
    const payload = `v1.${v1Match[1]}.${v1Match[2]}`;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await getSigningKey(configuredToken),
      fromBase64Url(v1Match[3]),
      encoder.encode(payload),
    );
    return valid ? { userId: null, role: 'ADMIN' } : null;
  } catch {
    return null;
  }
}

export async function verifyServiceBearerToken(request: NextRequest): Promise<AuthResult> {
  const configuredToken = process.env.COLLECT_API_TOKEN;
  if (!configuredToken) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'COLLECT_API_TOKEN не задан на сервере' }, { status: 500 }),
    };
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { authorized: false, response: NextResponse.json({ error: 'Требуется Bearer токен' }, { status: 401 }) };
  }
  if (!safeEqual(authorization.slice(7).trim(), configuredToken)) {
    return { authorized: false, response: NextResponse.json({ error: 'Неверный Bearer токен' }, { status: 403 }) };
  }
  return { authorized: true, userId: null, role: 'ADMIN' };
}

/** Accepts a service Bearer token or a signed browser session. Cookie mutations also require same-origin. */
export async function verifyBearerToken(request: NextRequest): Promise<AuthResult> {
  const configuredToken = process.env.COLLECT_API_TOKEN;
  if (!configuredToken) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'COLLECT_API_TOKEN не задан на сервере' }, { status: 500 }),
    };
  }

  if (request.headers.has('authorization')) return verifyServiceBearerToken(request);

  const session = await parseSessionCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value, configuredToken);
  if (!session) {
    return { authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) };
  }
  if (MUTATING_METHODS.has(request.method.toUpperCase()) && !hasSameOrigin(request)) {
    return { authorized: false, response: NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 }) };
  }
  return { authorized: true, userId: session.userId, role: session.role };
}

export async function extractRequestSession(request?: Request | NextRequest): Promise<SessionIdentity> {
  if (!request) return { userId: null, role: 'ADMIN' };
  const cookieHeader = request.headers.get('cookie') || '';
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`).exec(cookieHeader);
  const rawCookie = match ? decodeURIComponent(match[1].trim()) : undefined;
  const parsed = await parseSessionCookieValue(rawCookie);
  return parsed ?? { userId: null, role: 'ADMIN' };
}
