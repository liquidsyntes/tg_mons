import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ createFlow: vi.fn(), auth: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/telegram-login', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/telegram-login')>(), createTelegramFlow: mocks.createFlow,
}));
vi.mock('@/lib/auth', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/auth')>(), verifyBearerToken: mocks.auth,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user } } }));
import { POST } from '../route';

function request(mode = 'login', origin = 'http://localhost:4000'): NextRequest {
  return new NextRequest('http://localhost:4000/api/auth/telegram/start', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ mode }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('COLLECT_API_TOKEN', 'test-session-key');
  vi.stubEnv('TELEGRAM_LOGIN_REDIRECT_URI', 'http://localhost:4000/api/auth/telegram/callback');
  mocks.createFlow.mockResolvedValue({ flow: {
    state: 'state', nonce: 'nonce', verifier: 'verifier', mode: 'login', userId: null,
    expiresAt: Date.now() + 60_000,
  }, authorizationUrl: new URL('https://oauth.telegram.org/auth?client_id=123') });
  mocks.user.mockResolvedValue({ accessStatus: 'ACTIVE' });
});
afterEach(() => vi.unstubAllEnvs());

it('starts the login with a short-lived same-site Lax flow cookie', async () => {
  const response = await POST(request());
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toContain('oauth.telegram.org');
  expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
  expect(mocks.createFlow).toHaveBeenCalledWith('login', null);
});

it('rejects cross-origin requests and account linking without a user session', async () => {
  expect((await POST(request('login', 'https://other.example'))).status).toBe(403);
  mocks.auth.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
  expect((await POST(request('link'))).status).toBe(403);
  expect(mocks.createFlow).not.toHaveBeenCalled();
});

it('does not let a pending user begin account linking', async () => {
  mocks.auth.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
  mocks.user.mockResolvedValue({ accessStatus: 'PENDING' });
  expect((await POST(request('link'))).status).toBe(403);
  expect(mocks.createFlow).not.toHaveBeenCalled();
});

it('returns configuration errors to the public site behind the proxy', async () => {
  vi.stubEnv('TELEGRAM_LOGIN_REDIRECT_URI', 'https://tgmons.online/api/auth/telegram/callback');
  const proxied = new NextRequest('https://localhost:4000/api/auth/telegram/start', {
    method: 'POST',
    headers: { Origin: 'https://tgmons.online', 'X-Forwarded-Host': 'tgmons.online',
      'X-Forwarded-Proto': 'https', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ mode: 'login' }),
  });
  mocks.createFlow.mockRejectedValue(new Error('Provider unavailable'));
  const response = await POST(proxied);
  expect(response.headers.get('location')).toBe('https://tgmons.online/login?telegramError=unavailable');
});
