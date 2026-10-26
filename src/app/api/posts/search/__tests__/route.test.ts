import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), count: vi.fn(), findMany: vi.fn(), subscriptions: vi.fn(), channels: vi.fn(), raw: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  post: { count: mocks.count, findMany: mocks.findMany },
  userChannel: { findMany: mocks.subscriptions }, channel: { findMany: mocks.channels },
  $queryRaw: mocks.raw,
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

const post = {
  id: 1, channelId: 7, messageId: 10n, groupedId: null, publishedAt: new Date('2026-10-23T12:00:00Z'),
  text: 'Реклама бренда', isAd: true, views: 1000, reactions: 10, comments: 5, forwards: 5,
  subscribersAtPublish: 5000,
  channel: { id: 7, title: 'Технологии', username: 'tech', niche: 'general', userChannels: [{ niche: 'tech' }] },
  image: { postId: 1 }, mentions: [{ targetUsername: 'brand' }, { targetUsername: 'brand' }],
};

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:4000/api/posts/search${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, role: 'USER', userId: 3 });
  mocks.count.mockResolvedValue(1);
  mocks.findMany.mockResolvedValue([post]);
  mocks.subscriptions.mockResolvedValue([{
    niche: 'tech', channel: { id: 7, title: 'Технологии', username: 'tech' },
  }]);
  mocks.channels.mockResolvedValue([]);
  mocks.raw.mockResolvedValue([{ id: 1 }]);
});

describe('GET /api/posts/search', () => {
  it('requires authorization before searching', async () => {
    mocks.auth.mockResolvedValue({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it('keeps the channel search response and persisted ad filter', async () => {
    const response = await GET(request('?channelId=7&type=ads&q=бренда&sortBy=date'));
    expect(response.status).toBe(200);
    expect(mocks.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      channelId: 7, text: { contains: 'бренда', mode: 'insensitive' }, isAd: true,
      channel: { isActive: true, userChannels: { some: { userId: 3, isActive: true } } },
    }) });
    const body = await response.json();
    expect(body).toMatchObject({ total: 1, absoluteTotal: 1 });
    expect(body.posts[0].messageId).toBe('10');
    expect(body.posts[0]).toHaveProperty('ad');
  });

  it('filters global results by active UserChannel, niche, keyword and ads', async () => {
    const response = await GET(request('?days=30&onlyAds=true&niche=tech&q=бренд&sortBy=publishedAt'));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      text: { contains: 'бренд', mode: 'insensitive' }, isAd: true,
      channel: { isActive: true, userChannels: { some: { userId: 3, isActive: true, niche: 'tech' } } },
      publishedAt: { gte: expect.any(Date) },
    }) }));
    const body = await response.json();
    expect(body.posts[0]).toMatchObject({ hasImage: true, er: 20.4, err: 2, mentions: ['brand'],
      channel: { id: 7, niche: 'tech' } });
    expect(body.niches).toEqual(['tech']);
    expect(body.channels).toHaveLength(1);
  });

  it('uses active channels and Channel.niche for a master session', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, role: 'ADMIN', userId: null });
    mocks.channels.mockResolvedValue([{ id: 7, title: 'Технологии', username: 'tech', niche: 'science' }]);
    mocks.findMany.mockResolvedValue([{ ...post, channel: { ...post.channel, niche: 'science', userChannels: [] } }]);
    const body = await (await GET(request('?days=7&niche=science'))).json();
    expect(mocks.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      channel: { isActive: true, niche: 'science' },
    }) });
    expect(body.posts[0].channel.niche).toBe('science');
    expect(body.niches).toEqual(['science']);
  });

  it('sorts ER in PostgreSQL before paginating and restores that order', async () => {
    mocks.raw.mockResolvedValue([{ id: 2 }, { id: 1 }]);
    mocks.findMany.mockResolvedValue([post, { ...post, id: 2, messageId: 11n }]);
    const response = await GET(request('?days=30&sortBy=er&limit=2&offset=0'));
    expect(response.status).toBe(200);
    expect((await response.json()).posts.map((item: { id: number }) => item.id)).toEqual([2, 1]);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [expect.objectContaining({ channel: expect.objectContaining({ isActive: true }) }), { id: { in: [2, 1] } }] },
    }));
    const query = mocks.raw.mock.calls[0][0];
    expect(query.sql).toContain('NULLS LAST');
    expect(query.sql).toContain('subscribers_at_publish');
  });

  it('combines viral, ad and text filters before paginating channel posts', async () => {
    const normal = Array.from({ length: 5 }, (_, index) => ({
      id: index + 2, channelId: 7, publishedAt: new Date('2026-10-23T10:00:00Z'),
      views: 100, reactions: 3, comments: 0, forwards: 2, subscribersAtPublish: 5000,
    }));
    const outlier = { ...post, views: 250, reactions: 3, comments: 0, forwards: 12 };
    const secondOutlier = { ...outlier, id: 8, publishedAt: new Date('2026-10-23T11:00:00Z') };
    mocks.count.mockResolvedValue(7);
    mocks.findMany.mockReset()
      .mockResolvedValueOnce([...normal, outlier, secondOutlier])
      .mockResolvedValueOnce(normal)
      .mockResolvedValueOnce([outlier]);

    const response = await GET(request('?channelId=7&type=ads&q=бренда&sortBy=date&onlyViral=true&limit=1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ total: 2, absoluteTotal: 7 });
    expect(body.posts[0]).toMatchObject({
      id: 1, isViral: true, viralReasons: ['views', 'forwards'],
      viralPrimaryReason: 'forwards', viralMultiplier: 6,
    });
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      channelId: 7, isAd: true, text: { contains: 'бренда', mode: 'insensitive' },
    });
    expect(mocks.findMany.mock.calls[2][0]).toMatchObject({
      where: { AND: [expect.any(Object), { id: { in: [1] } }] },
    });
  });

  it('filters global viral results with the existing niche and ad scope', async () => {
    const normal = Array.from({ length: 5 }, (_, index) => ({
      id: index + 2, channelId: 7, publishedAt: new Date('2026-10-23T10:00:00Z'),
      views: 100, reactions: 3, comments: 0, forwards: 2, subscribersAtPublish: 5000,
    }));
    const outlier = { ...post, views: 250, reactions: 3, comments: 0, forwards: 12 };
    mocks.findMany.mockReset()
      .mockResolvedValueOnce([...normal, outlier])
      .mockResolvedValueOnce(normal)
      .mockResolvedValueOnce([outlier]);
    const body = await (await GET(request('?days=30&onlyAds=true&onlyViral=true&niche=tech&q=бренд'))).json();
    expect(body.total).toBe(1);
    expect(body.posts[0].isViral).toBe(true);
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      isAd: true, text: { contains: 'бренд', mode: 'insensitive' },
      channel: { userChannels: { some: { userId: 3, isActive: true, niche: 'tech' } } },
    });
  });

  it.each(['?days=3', '?onlyAds=yes', '?onlyViral=yes', '?limit=51', '?offset=-1', '?sortBy=unknown',
    '?channelId=0', '?channelId=abc', '?niche=tech&dateFrom=2026-10-01', '?q=x&days=14&sortBy=nope'])
  ('rejects invalid parameters: %s', async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
