import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth';
import { POST } from '../route';

describe('POST /api/auth/logout', () => {
  beforeEach(() => vi.stubEnv('COLLECT_API_TOKEN', 'unit-test-access-key'));
  afterEach(() => vi.unstubAllEnvs());

  it('clears a valid browser session and redirects to login', async () => {
    const cookie = await createSessionCookieValue();
    const request = new NextRequest('http://localhost:4000/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookie}`, Origin: 'http://localhost:4000' },
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:4000/login');
    expect(response.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}=;`);
  });

  it('rejects logout without authorization', async () => {
    const request = new NextRequest('http://localhost:4000/api/auth/logout', { method: 'POST' });
    expect((await POST(request)).status).toBe(401);
  });
});
