import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user, update: mocks.update } } }));
import { POST } from '../route';
import { encodeTelegramCookie, TELEGRAM_LINK_COOKIE } from '@/lib/telegram-login';

function request(userId = 7): NextRequest {
  const proof = { userId, profile: { sub: 'telegram-123', name: 'Виталий', username: 'vitaliy', photoUrl: null },
    expiresAt: Date.now() + 60_000 };
  return new NextRequest('http://localhost:4000/api/auth/telegram/link', {
    method: 'POST', headers: { Cookie: `${TELEGRAM_LINK_COOKIE}=${encodeTelegramCookie(proof, 'link')}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('COLLECT_API_TOKEN', 'test-session-key');
  mocks.auth.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
  mocks.user.mockResolvedValueOnce({ accessStatus: 'ACTIVE', telegramSub: null }).mockResolvedValueOnce(null);
  mocks.update.mockResolvedValue({ id: 7 });
});
afterEach(() => vi.unstubAllEnvs());

it('links only the currently authenticated app account', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: 7 }, data: {
    telegramSub: 'telegram-123', telegramName: 'Виталий', telegramUsername: 'vitaliy', telegramPhotoUrl: null,
  } });
  expect((await POST(request(8))).status).toBe(400);
});

it('rejects a Telegram identity already bound to another user', async () => {
  mocks.user.mockReset();
  mocks.user.mockResolvedValueOnce({ accessStatus: 'ACTIVE', telegramSub: null }).mockResolvedValueOnce({ id: 8 });
  expect((await POST(request())).status).toBe(409);
  expect(mocks.update).not.toHaveBeenCalled();
});
