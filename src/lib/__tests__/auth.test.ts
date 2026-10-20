import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createSessionCookieValue,
  hashPassword,
  isValidAccessKey,
  parseSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyBearerToken,
  verifyPassword,
  verifyServiceBearerToken,
} from '../auth';

const baseUrl = 'http://localhost:4000/api/channels';
const accessKey = 'unit-test-access-key';

function request(method: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(baseUrl, { method, headers });
}

async function status(result: Awaited<ReturnType<typeof verifyBearerToken>>): Promise<number> {
  return result.authorized ? 200 : result.response.status;
}

describe('request authorization', () => {
  beforeEach(() => vi.stubEnv('COLLECT_API_TOKEN', accessKey));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('accepts a service Bearer token without browser Origin', async () => {
    expect(await status(await verifyBearerToken(request('POST', { Authorization: `Bearer ${accessKey}` })))).toBe(200);
    expect(await status(await verifyServiceBearerToken(request('POST', { Authorization: `Bearer ${accessKey}` })))).toBe(200);
    expect(isValidAccessKey(accessKey)).toBe(true);
    expect(isValidAccessKey('wrong')).toBe(false);
  });

  it('rejects a missing or incorrect Bearer token and never falls back from a bad header to a cookie', async () => {
    const cookie = await createSessionCookieValue();
    expect(await status(await verifyServiceBearerToken(request('POST', { Cookie: `${SESSION_COOKIE_NAME}=${cookie}` })))).toBe(401);
    expect(await status(await verifyBearerToken(request('POST')))).toBe(401);
    expect(await status(await verifyBearerToken(request('POST', { Authorization: 'Bearer wrong', Cookie: `${SESSION_COOKIE_NAME}=${cookie}` })))).toBe(403);
    expect(await status(await verifyBearerToken(request('POST', { Authorization: 'Basic wrong' })))).toBe(401);
  });

  it('accepts a signed cookie for same-origin UI requests and rejects cross-origin mutation', async () => {
    const cookie = await createSessionCookieValue();
    const headers = { Cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    expect(cookie).not.toContain(accessKey);
    expect(await status(await verifyBearerToken(request('GET', headers)))).toBe(200);
    expect(await status(await verifyBearerToken(request('PATCH', { ...headers, Origin: 'http://localhost:4000' })))).toBe(200);
    expect(await status(await verifyBearerToken(request('POST', { ...headers, Origin: 'https://other.example' })))).toBe(403);
    expect(await status(await verifyBearerToken(request('DELETE', headers)))).toBe(403);
  });

  it('accepts the external origin forwarded by a trusted HTTPS proxy', async () => {
    const cookie = await createSessionCookieValue();
    const proxied = request('POST', {
      Cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      Origin: 'https://tgmon.example',
      Host: 'web:4000',
      'X-Forwarded-Host': 'tgmon.example',
      'X-Forwarded-Proto': 'https',
    });
    expect(await status(await verifyBearerToken(proxied))).toBe(200);
  });

  it('rejects tampered and expired sessions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00.000Z'));
    const cookie = await createSessionCookieValue();
    const pieces = cookie.split('.');
    pieces[3] = `${pieces[3][0] === 'A' ? 'B' : 'A'}${pieces[3].slice(1)}`;
    expect(await status(await verifyBearerToken(request('GET', { Cookie: `${SESSION_COOKIE_NAME}=${pieces.join('.')}` })))).toBe(401);
    vi.advanceTimersByTime(SESSION_MAX_AGE_SECONDS * 1000 + 1);
    expect(await status(await verifyBearerToken(request('GET', { Cookie: `${SESSION_COOKIE_NAME}=${cookie}` })))).toBe(401);
  });

  it('fails closed when the server key is missing', async () => {
    vi.stubEnv('COLLECT_API_TOKEN', '');
    expect(await status(await verifyBearerToken(request('GET')))).toBe(500);
  });

  it('encodes and verifies v2 user sessions with userId and role', async () => {
    const cookie = await createSessionCookieValue({ userId: 42, role: 'USER' });
    expect(cookie.startsWith('v2.42.USER.')).toBe(true);
    const parsed = await parseSessionCookieValue(cookie, accessKey);
    expect(parsed).toEqual({ userId: 42, role: 'USER' });

    const authResult = await verifyBearerToken(request('GET', { Cookie: `${SESSION_COOKIE_NAME}=${cookie}` }));
    expect(authResult).toEqual({ authorized: true, userId: 42, role: 'USER' });
  });

  it('hashes and verifies passwords with PBKDF2', async () => {
    const hash = await hashPassword('secret-pass-123');
    expect(hash.startsWith('pbkdf2.')).toBe(true);
    expect(await verifyPassword('secret-pass-123', hash)).toBe(true);
    expect(await verifyPassword('wrong-pass', hash)).toBe(false);
    expect(await verifyPassword('secret-pass-123', 'invalid.hash')).toBe(false);
  });
});
