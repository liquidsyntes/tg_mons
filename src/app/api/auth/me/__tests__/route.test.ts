import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyBearerToken: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyBearerToken: mocks.verifyBearerToken,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { GET } from '../route';

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyBearerToken.mockResolvedValue({ authorized: true, userId: 42, role: 'USER' });
    mocks.userFindUnique.mockResolvedValue(null);
  });

  it('returns auth response when request is not authorized', async () => {
    mocks.verifyBearerToken.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await GET(new NextRequest('http://localhost:4000/api/auth/me'));
    expect(res.status).toBe(401);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('returns user record with telegramLinked flag and normalized role', async () => {
    const createdAt = new Date('2026-10-01T12:00:00.000Z');
    mocks.userFindUnique.mockResolvedValue({
      id: 42,
      username: 'oleg',
      role: 'ADMIN',
      accessStatus: 'ACTIVE',
      telegramName: 'Олег',
      telegramUsername: 'oleg_tg',
      telegramSub: 'tg-sub-123',
      createdAt,
    });

    const res = await GET(new NextRequest('http://localhost:4000/api/auth/me'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: 42,
        username: 'oleg',
        role: 'ADMIN',
        accessStatus: 'ACTIVE',
        telegramName: 'Олег',
        telegramUsername: 'oleg_tg',
        telegramLinked: true,
        createdAt: createdAt.toISOString(),
      },
    });
  });

  it('returns fallback payload when userId is null (master token)', async () => {
    mocks.verifyBearerToken.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });

    const res = await GET(new NextRequest('http://localhost:4000/api/auth/me'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: null,
        username: 'admin',
        role: 'ADMIN',
        accessStatus: 'ACTIVE',
        telegramLinked: false,
      },
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });
});
