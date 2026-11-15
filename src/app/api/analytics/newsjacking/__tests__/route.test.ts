import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyBearerToken: vi.fn(),
  listUserChannels: vi.fn(),
  postFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyBearerToken: mocks.verifyBearerToken,
}));
vi.mock('@/lib/user-channels', () => ({
  listUserChannels: mocks.listUserChannels,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: {
      findMany: mocks.postFindMany,
    },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';

function makeRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/analytics/newsjacking${query ? `?${query}` : ''}`);
}

describe('GET /api/analytics/newsjacking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyBearerToken.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
    mocks.listUserChannels.mockResolvedValue([
      {
        id: 1,
        title: 'AI News',
        username: 'ai_news',
        tgId: BigInt(1001),
        niche: 'tech',
        tags: ['ai', 'news'],
        isMine: false,
        isActive: true,
      },
      {
        id: 2,
        title: 'Мой IT Канал',
        username: 'my_it',
        tgId: BigInt(1002),
        niche: 'tech',
        tags: ['ai'],
        isMine: true,
        isActive: true,
      },
    ]);
  });

  it('rejects unauthenticated requests with verifier response', async () => {
    mocks.verifyBearerToken.mockResolvedValueOnce({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });

    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('validates hours, minChannels, and tag length returning 400 on invalid parameters', async () => {
    const badHours = await GET(makeRequest('hours=12'));
    expect(badHours.status).toBe(400);

    const badMinChannels = await GET(makeRequest('minChannels=1'));
    expect(badMinChannels.status).toBe(400);

    const badTag = await GET(makeRequest(`tag=${'a'.repeat(31)}`));
    expect(badTag.status).toBe(400);
  });

  it('returns empty clusters when folder tag has no matching channels', async () => {
    const response = await GET(makeRequest('hours=24&tag=crypto'));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.windowHours).toBe(24);
    expect(json.tag).toBe('crypto');
    expect(json.totalClusters).toBe(0);
    expect(json.availableTags).toEqual(['ai', 'news']);
    expect(mocks.postFindMany).not.toHaveBeenCalled();
  });

  it('clusters posts from active user channels filtered by tag and computes speed ranking', async () => {
    const now = Date.now();
    mocks.postFindMany.mockResolvedValue([
      {
        id: 501,
        messageId: BigInt(9001),
        channelId: 1,
        publishedAt: new Date(now - 90 * 60_000),
        text: 'OpenAI выпустила GPT-5 для разработчиков с новым режимом агентов',
        isAd: false,
        views: 10000,
        reactions: 200,
        comments: 30,
        forwards: 70,
        mentions: [],
      },
      {
        id: 502,
        messageId: BigInt(9002),
        channelId: 2,
        publishedAt: new Date(now - 45 * 60_000),
        text: 'Разбираем новый релиз OpenAI GPT-5 и возможности автономных агентов',
        isAd: false,
        views: 8000,
        reactions: 400,
        comments: 60,
        forwards: 140,
        mentions: [],
      },
    ]);

    const response = await GET(makeRequest('hours=48&tag=ai'));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.windowHours).toBe(48);
    expect(json.tag).toBe('ai');
    expect(json.myChannelId).toBe(2);
    expect(json.totalClusters).toBe(1);
    expect(json.uncoveredByMyChannelCount).toBe(0);
    expect(json.clusters[0].coveredByMyChannel).toBe(true);
    expect(json.clusters[0].myChannelDelayMinutes).toBe(45);
    expect(json.clusters[0].firstPost.messageId).toBe('9001');
    expect(json.speedLeaderboard[0].channelId).toBe(1);
    expect(json.speedLeaderboard[0].firstCount).toBe(1);
  });
});
