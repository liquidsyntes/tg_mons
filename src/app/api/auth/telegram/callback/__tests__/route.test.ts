import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), findUser: vi.fn(), createUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/lib/telegram-login', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/telegram-login')>(), exchangeTelegramCode: mocks.exchange,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: {
  findUnique: mocks.findUser, create: mocks.createUser, update: mocks.updateUser,
} } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { GET } from '../route';
import { encodeTelegramCookie, TELEGRAM_FLOW_COOKIE } from '@/lib/telegram-login';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

function request(mode: 'login' | 'link' = 'login', state = 'state-1'): NextRequest {
  const flow = { state: 'state-1', nonce: 'nonce-1', verifier: 'verifier-1', mode,
    userId: mode === 'link' ? 5 : null, expiresAt: Date.now() + 60_000 };
  return new NextRequest(`http://localhost:4000/api/auth/telegram/callback?code=one-use-code&state=${state}`, {
    headers: { Cookie: `${TELEGRAM_FLOW_COOKIE}=${encodeTelegramCookie(flow, 'flow')}` },
  });
}

describe('Telegram OIDC callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('COLLECT_API_TOKEN', 'test-session-key');
    mocks.exchange.mockResolvedValue({ sub: 'telegram-123', name: 'Виталий', username: 'vitaliy', photoUrl: null });
    mocks.findUser.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue({ id: 9, role: 'USER', accessStatus: 'PENDING' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('creates a pending account without inviting or granting app access', async () => {
    const response = await GET(request());
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:4000/pending');
    expect(mocks.createUser).toHaveBeenCalledWith({ data: expect.objectContaining({
      role: 'USER', accessStatus: 'PENDING', telegramSub: 'telegram-123', passwordHash: null,
    }) });
    expect(response.headers.get('set-cookie')).toContain(SESSION_COOKIE_NAME);
  });

  it('rejects a mismatched state before exchanging the code', async () => {
    const response = await GET(request('login', 'wrong-state'));
    expect(response.headers.get('location')).toContain('telegramError=invalid');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('refuses a blacklisted Telegram identity', async () => {
    mocks.findUser.mockResolvedValue({ id: 9, role: 'USER', accessStatus: 'BLOCKED' });
    const response = await GET(request());
    expect(response.headers.get('location')).toContain('telegramError=blocked');
    expect(response.headers.get('set-cookie')).not.toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it('keeps account linking separate from registration', async () => {
    const response = await GET(request('link'));
    expect(response.headers.get('location')).toContain('/settings?telegramLink=ready');
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});
