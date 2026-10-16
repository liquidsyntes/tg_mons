import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'tgmon_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type AuthResult = { authorized: true } | { authorized: false; response: NextResponse };

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

export async function createSessionCookieValue(): Promise<string> {
  const configuredToken = process.env.COLLECT_API_TOKEN;
  if (!configuredToken) throw new Error('COLLECT_API_TOKEN is not configured');

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${expiresAt}.${nonce}`;
  const signature = await crypto.subtle.sign('HMAC', await getSigningKey(configuredToken), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function hasValidSession(value: string | undefined, configuredToken: string): Promise<boolean> {
  if (!value) return false;
  const match = /^v1\.(\d{13})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;

  const expiresAt = Number(match[1]);
  const now = Date.now();
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + SESSION_MAX_AGE_SECONDS * 1000) return false;

  try {
    const payload = `v1.${match[1]}.${match[2]}`;
    return await crypto.subtle.verify(
      'HMAC',
      await getSigningKey(configuredToken),
      fromBase64Url(match[3]),
      encoder.encode(payload),
    );
  } catch {
    return false;
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
  return { authorized: true };
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

  if (!await hasValidSession(request.cookies.get(SESSION_COOKIE_NAME)?.value, configuredToken)) {
    return { authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) };
  }
  if (MUTATING_METHODS.has(request.method.toUpperCase()) && !hasSameOrigin(request)) {
    return { authorized: false, response: NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 }) };
  }
  return { authorized: true };
}
