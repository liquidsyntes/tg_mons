import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

const baseUrl = 'http://localhost:4000/api/auth/login';

function request(accessKey: string, origin = 'http://localhost:4000'): NextRequest {
  return new NextRequest(baseUrl, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey }),
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => vi.stubEnv('COLLECT_API_TOKEN', 'unit-test-access-key'));
  afterEach(() => vi.unstubAllEnvs());

  it('sets a signed HttpOnly same-site cookie without returning the access key', async () => {
    const response = await POST(request('unit-test-access-key'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=strict');
    expect(cookie).not.toContain('unit-test-access-key');
  });

  it('rejects a wrong key and a cross-origin login request', async () => {
    expect((await POST(request('wrong'))).status).toBe(401);
    expect((await POST(request('unit-test-access-key', 'https://other.example'))).status).toBe(403);
  });

  it('marks the cookie Secure behind an HTTPS proxy', async () => {
    const proxied = new NextRequest('http://web:4000/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://tgmon.example',
        Host: 'web:4000',
        'X-Forwarded-Host': 'tgmon.example',
        'X-Forwarded-Proto': 'https',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessKey: 'unit-test-access-key' }),
    });
    const response = await POST(proxied);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
});
