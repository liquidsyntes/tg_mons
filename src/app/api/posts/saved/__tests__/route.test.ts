import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  postFindUnique: vi.fn(),
  postFindMany: vi.fn(),
  userChannelFindUnique: vi.fn(),
  savedPostUpsert: vi.fn(),
  savedPostDeleteMany: vi.fn(),
  savedPostFindMany: vi.fn(),
  snapshotFindFirst: vi.fn(),
  getBestTimeRecommendation: vi.fn(),
  findUserMyChannel: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findUnique: mocks.postFindUnique, findMany: mocks.postFindMany },
    userChannel: { findUnique: mocks.userChannelFindUnique },
    snapshot: { findFirst: mocks.snapshotFindFirst },
    userSavedPost: {
      upsert: mocks.savedPostUpsert,
      deleteMany: mocks.savedPostDeleteMany,
      findMany: mocks.savedPostFindMany,
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/metrics/best-time', () => ({
  getBestTimeRecommendation: mocks.getBestTimeRecommendation,
}));
vi.mock('@/lib/user-channels', () => ({
  findUserMyChannel: mocks.findUserMyChannel,
}));

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
      status: 'idea',
      plannedFor: null,
      draftText: null,
      createdAt: new Date('2026-10-27T09:00:00Z'),
      updatedAt: new Date('2026-10-27T09:00:00Z'),
    });
    mocks.savedPostDeleteMany.mockResolvedValue({ count: 1 });
    mocks.savedPostFindMany.mockResolvedValue([
      {
        id: 101,
        postId: 42,
        note: 'Отличный заход для рекламы в пятницу',
        status: 'idea',
        plannedFor: null,
        draftText: null,
        createdAt: new Date('2026-10-27T09:00:00Z'),
        updatedAt: new Date('2026-10-27T09:00:00Z'),
      },
    ]);
    mocks.getBestTimeRecommendation.mockResolvedValue(null);
    mocks.findUserMyChannel.mockResolvedValue(null);
    mocks.postFindMany.mockResolvedValue([]);
    mocks.snapshotFindFirst.mockResolvedValue(null);
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
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.savedPostUpsert).toHaveBeenCalledWith({
      where: { userId_postId: { userId: 3, postId: 42 } },
      create: {
        userId: 3,
        postId: 42,
        status: 'idea',
        note: 'Отличный заход для рекламы в пятницу',
      },
      update: {
        note: 'Отличный заход для рекламы в пятницу',
      },
      select: {
        id: true,
        postId: true,
        note: true,
        status: true,
        plannedFor: true,
        draftText: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const body = await res.json();
    expect(body.savedPost).toMatchObject({
      id: 101,
      postId: 42,
      note: 'Отличный заход для рекламы в пятницу',
      status: 'idea',
    });
  });

  it('updates an existing note via PATCH and normalizes empty note to null', async () => {
    mocks.savedPostUpsert.mockResolvedValue({
      id: 101,
      postId: 42,
      note: null,
      status: 'idea',
      plannedFor: null,
      draftText: null,
      createdAt: new Date('2026-10-27T09:00:00Z'),
      updatedAt: new Date('2026-10-27T09:05:00Z'),
    });
    const res = await PATCH(makeJsonRequest('PATCH', { postId: 42, note: '   ' }));
    expect(res.status).toBe(200);
    expect(mocks.savedPostUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_postId: { userId: 3, postId: 42 } },
        update: { note: null },
      }),
    );
  });

  it('updates content plan status, plannedFor and draftText independently without overwriting note', async () => {
    const plannedIso = '2026-11-19T15:00:00.000Z';
    mocks.savedPostUpsert.mockResolvedValue({
      id: 101,
      postId: 42,
      note: 'Сохранённая заметка',
      status: 'ready',
      plannedFor: new Date(plannedIso),
      draftText: 'Адаптированный текст',
      createdAt: new Date('2026-10-27T09:00:00Z'),
      updatedAt: new Date('2026-11-14T06:00:00Z'),
    });

    const res = await PATCH(
      makeJsonRequest('PATCH', {
        postId: 42,
        status: 'ready',
        plannedFor: plannedIso,
        draftText: '  Адаптированный текст  ',
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.savedPostUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_postId: { userId: 3, postId: 42 } },
        update: {
          status: 'ready',
          plannedFor: new Date(plannedIso),
          draftText: 'Адаптированный текст',
        },
      }),
    );
    const body = await res.json();
    expect(body.savedPost).toMatchObject({
      status: 'ready',
      draftText: 'Адаптированный текст',
      note: 'Сохранённая заметка',
    });
  });

  it('rejects invalid content plan status, plannedFor date or draftText over 4000 chars', async () => {
    const badStatus = await PATCH(makeJsonRequest('PATCH', { postId: 42, status: 'done' }));
    expect(badStatus.status).toBe(400);

    const badDate = await PATCH(makeJsonRequest('PATCH', { postId: 42, plannedFor: 'not-a-date' }));
    expect(badDate.status).toBe(400);

    const longDraft = await PATCH(
      makeJsonRequest('PATCH', { postId: 42, draftText: 'а'.repeat(4001) }),
    );
    expect(longDraft.status).toBe(400);
    expect(mocks.savedPostUpsert).not.toHaveBeenCalled();
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
      makeJsonRequest('POST', { postId: 42, note: 'а'.repeat(501) }),
    );
    expect(tooLong.status).toBe(400);
    expect(mocks.savedPostUpsert).not.toHaveBeenCalled();
  });

  it('returns savedPosts with content plan recommendations in GET and deletes bookmark safely', async () => {
    mocks.findUserMyChannel.mockResolvedValue({
      id: 99,
      title: 'Мой канал',
      username: 'my_chan',
      niche: 'tech',
    });
    mocks.snapshotFindFirst.mockResolvedValue({ membersCount: 3000 });
    mocks.postFindMany.mockResolvedValue([
      {
        text: 'Разбор кейса длиной более трехсот символов '.repeat(10),
        views: 1800,
        reactions: 50,
        comments: 10,
        forwards: 15,
        subscribersAtPublish: 3000,
        contentType: 'photo',
      },
      {
        text: 'Ещё один пост с анализом и цифрами '.repeat(12),
        views: 1900,
        reactions: 60,
        comments: 12,
        forwards: 20,
        subscribersAtPublish: 3000,
        contentType: 'photo',
      },
    ]);

    const getRes = await GET(new NextRequest('http://localhost:4000/api/posts/saved'));
    expect(getRes.status).toBe(200);
    expect(mocks.savedPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 3 }),
      }),
    );
    const getBody = await getRes.json();
    expect(getBody.savedPosts).toHaveLength(1);
    expect(getBody.recommendations.slots.length).toBeGreaterThan(0);
    expect(getBody.recommendations.formatGuidance).toMatchObject({
      channelId: 99,
      channelTitle: 'Мой канал',
      bestLengthBucket: 'medium',
      withMediaRecommended: true,
    });

    const delRes = await DELETE(
      new NextRequest('http://localhost:4000/api/posts/saved?postId=42', {
        method: 'DELETE',
      }),
    );
    expect(delRes.status).toBe(200);
    expect(mocks.savedPostDeleteMany).toHaveBeenCalledWith({
      where: { userId: 3, postId: 42 },
    });
  });
});
