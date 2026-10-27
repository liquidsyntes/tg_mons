import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  postFindUnique: vi.fn(),
  userChannelFindUnique: vi.fn(),
  savedPostUpsert: vi.fn(),
  savedPostDeleteMany: vi.fn(),
  savedPostFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findUnique: mocks.postFindUnique },
    userChannel: { findUnique: mocks.userChannelFindUnique },
    userSavedPost: {
      upsert: mocks.savedPostUpsert,
      deleteMany: mocks.savedPostDeleteMany,
      findMany: mocks.savedPostFindMany,
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET, POST, PATCH, DELETE } from '../route';

function makeJsonRequest(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>, query = '') {
  return new NextRequest(`http://localhost:4000/api/posts/saved${query}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/posts/saved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 3, role: 'USER' });
    mocks.postFindUnique.mockResolvedValue({
      id: 42,
      channelId: 7,
      channel: { isActive: true },
    });
    mocks.userChannelFindUnique.mockResolvedValue({ isActive: true });
    mocks.savedPostUpsert.mockResolvedValue({
      id: 101,
      postId: 42,
      note: 'Отличный заход для рекламы в пятницу',
      createdAt: new Date('2026-10-27T09:00:00Z'),
    });
    mocks.savedPostDeleteMany.mockResolvedValue({ count: 1 });
    mocks.savedPostFindMany.mockResolvedValue([
      {
        id: 101,
        postId: 42,
        note: 'Отличный заход для рекламы в пятницу',
        createdAt: new Date('2026-10-27T09:00:00Z'),
      },
    ]);
  });

  it('requires authorization', async () => {
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });
    const res = await POST(makeJsonRequest('POST', { postId: 42 }));
    expect(res.status).toBe(401);
    expect(mocks.savedPostUpsert).not.toHaveBeenCalled();
  });

  it('saves a post to bookmarks and stores a trimmed note via idempotent upsert', async () => {
    const res = await POST(
      makeJsonRequest('POST', {
        postId: 42,
        note: '  Отличный заход для рекламы в пятницу  ',
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.savedPostUpsert).toHaveBeenCalledWith({
      where: { userId_postId: { userId: 3, postId: 42 } },
      create: {
        userId: 3,
        postId: 42,
        note: 'Отличный заход для рекламы в пятницу',
      },
      update: {
        note: 'Отличный заход для рекламы в пятницу',
      },
      select: { id: true, postId: true, note: true, createdAt: true },
    });
    const body = await res.json();
    expect(body.savedPost).toMatchObject({
      id: 101,
      postId: 42,
      note: 'Отличный заход для рекламы в пятницу',
    });
  });

  it('updates an existing note via PATCH and normalizes empty note to null', async () => {
    mocks.savedPostUpsert.mockResolvedValue({
      id: 101,
      postId: 42,
      note: null,
      createdAt: new Date('2026-10-27T09:00:00Z'),
    });
    const res = await PATCH(makeJsonRequest('PATCH', { postId: 42, note: '   ' }));
    expect(res.status).toBe(200);
    expect(mocks.savedPostUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_postId: { userId: 3, postId: 42 } },
        update: { note: null },
      })
    );
  });

  it('forbids saving a post from a channel the user has no access to', async () => {
    mocks.userChannelFindUnique.mockResolvedValue(null);
    const res = await POST(makeJsonRequest('POST', { postId: 42, note: 'Тест' }));
    expect(res.status).toBe(403);
    expect(mocks.savedPostUpsert).not.toHaveBeenCalled();
  });

  it('rejects invalid postId or notes longer than 500 characters', async () => {
    const badId = await POST(makeJsonRequest('POST', { postId: 0 }));
    expect(badId.status).toBe(400);

    const tooLong = await POST(
      makeJsonRequest('POST', { postId: 42, note: 'а'.repeat(501) })
    );
    expect(tooLong.status).toBe(400);
    expect(mocks.savedPostUpsert).not.toHaveBeenCalled();
  });

  it('deletes a bookmark isolated to the current userId and lists only user bookmarks', async () => {
    const getRes = await GET(new NextRequest('http://localhost:4000/api/posts/saved'));
    expect(getRes.status).toBe(200);
    expect(mocks.savedPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 3 }),
      })
    );

    const delRes = await DELETE(
      new NextRequest('http://localhost:4000/api/posts/saved?postId=42', {
        method: 'DELETE',
      })
    );
    expect(delRes.status).toBe(200);
    expect(mocks.savedPostDeleteMany).toHaveBeenCalledWith({
      where: { userId: 3, postId: 42 },
    });
  });
});
