import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verifyAuth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
      update: mocks.updateUser,
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET, PATCH } from '../route';

const url = 'http://localhost:4000/api/settings/digest';
const storedUser = {
  id: 7,
  telegramChatId: '123456789',
  digestEnabled: false,
  digestHour: 9,
  lastDigestAt: null,
};

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('/api/settings/digest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuth.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
    mocks.findUser.mockResolvedValue(storedUser);
    mocks.updateUser.mockResolvedValue({ ...storedUser, digestEnabled: true, digestHour: 8 });
  });

  it('requires authentication for GET and PATCH', async () => {
    mocks.verifyAuth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect((await patch({ digestEnabled: true })).status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it('allows regular USER role to read and update personal digest settings', async () => {
    const getRes = await GET(new NextRequest(url));
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({
      available: true,
      digest: { id: 7, telegramChatId: '123456789', digestHour: 9 },
    });

    const patchRes = await patch({ telegramChatId: ' -100123456789 ', digestEnabled: true, digestHour: 8 });
    expect(patchRes.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: {
          telegramChatId: '-100123456789',
          digestEnabled: true,
          digestHour: 8,
        },
      }),
    );
  });

  it('rejects enabling personal digest when telegramChatId is missing or invalid', async () => {
    mocks.findUser.mockResolvedValue({ ...storedUser, telegramChatId: null });
    expect((await patch({ digestEnabled: true })).status).toBe(400);
    expect((await patch({ telegramChatId: 'not a valid chat id' })).status).toBe(400);
    expect((await patch({ digestHour: 24 })).status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('reports unavailable for master session without userId', async () => {
    mocks.verifyAuth.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
    const getRes = await GET(new NextRequest(url));
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({ available: false, digest: null });
    expect((await patch({ digestEnabled: true })).status).toBe(403);
  });
});
