import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ChannelDetailStats, ChannelMetrics } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  extractRequestSession: vi.fn(),
  getChannelDetailStats: vi.fn(),
  listUserChannels: vi.fn(),
  channelFindMany: vi.fn(),
  mentionFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  extractRequestSession: mocks.extractRequestSession,
}));
vi.mock('@/lib/metrics', () => ({
  getChannelDetailStats: mocks.getChannelDetailStats,
  parseStatsPeriod: (raw: string | null) =>
    raw === '24h' || raw === '30d' ? raw : '7d',
}));
vi.mock('@/lib/user-channels', () => ({
  listUserChannels: mocks.listUserChannels,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    channel: { findMany: mocks.channelFindMany },
    mention: { findMany: mocks.mentionFindMany },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';
import { GET as CHANNELS_COMPARE_GET } from '@/app/api/channels/compare/route';

function makeDetailStats(
  id: number,
  title: string,
  overrides: Partial<ChannelMetrics> = {}
): ChannelDetailStats {
  const channel: ChannelMetrics = {
    id,
    username: `ch_${id}`,
    tgId: String(5000 + id),
    title,
    type: 'channel',
    niche: 'tech',
    tags: overrides.tags ?? [],
    isMine: false,
    isFavorite: false,
    isActive: true,
    consecutiveErrors: 0,
    lastMessageId: '10',
    lastError: null,
    lastCollectedAt: '2026-11-10T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    currentMembers: overrides.currentMembers ?? id * 5000,
    delta24h: { abs: 50, percent: 1 },
    delta7d: { abs: 300, percent: 4 },
    delta30d: overrides.delta30d ?? { abs: 1000, percent: 10 },
    posts24h: 2,
    posts7d: 10,
    posts30d: 40,
    avgPostsPerDay: 1.3,
    avgViews24h: 2000,
    vr24h: 40,
    avgViews7d: 2200,
    vr7d: 44,
    avgViews30d: 2500,
    vr30d: 50,
    lastPostViews: 2100,
    trueErr7d: 4.5,
    er24h: 2.5,
    er7d: 3.1,
    er30d: 3.2,
    err24h: 6.0,
    err7d: 6.8,
    err30d: 7.1,
    cr7d: null,
    adShare7d: { percent: 10, level: 'medium' },
    adShare30d: { percent: 12, level: 'medium' },
    status: 'success',
    sparkline7d: [],
    fraudScore: 10,
  };

  return {
    channel,
    myChannel: null,
    period: '30d',
    membersHistory: [{ collectedAt: '2026-11-01T10:00:00.000Z', membersCount: channel.currentMembers ?? 5000 }],
    postsDistribution: [{ date: '2026-11-01', postsCount: 2, viewsAvg: 2500 }],
    heatmapData: [],
  };
}

describe('GET /api/stats/compare & /api/channels/compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractRequestSession.mockResolvedValue({ userId: 7, role: 'USER' });
    mocks.channelFindMany.mockResolvedValue([]);
    mocks.mentionFindMany.mockResolvedValue([]);
    mocks.listUserChannels.mockResolvedValue([]);
  });

  it('re-exports GET on /api/channels/compare', () => {
    expect(CHANNELS_COMPARE_GET).toBe(GET);
  });

  it('returns 400 on invalid params, duplicates, or >4 channels', async () => {
    const emptyRes = await GET(new NextRequest('http://localhost:4000/api/stats/compare'));
    expect(emptyRes.status).toBe(400);

    const dupRes = await GET(new NextRequest('http://localhost:4000/api/stats/compare?ids=1,1'));
    expect(dupRes.status).toBe(400);

    const tooManyRes = await GET(new NextRequest('http://localhost:4000/api/stats/compare?ids=1,2,3,4,5'));
    expect(tooManyRes.status).toBe(400);

    const singleNoTag = await GET(new NextRequest('http://localhost:4000/api/stats/compare?ids=1'));
    expect(singleNoTag.status).toBe(400);
  });

  it('returns 403 when channel exists in DB but user lacks access, and 404 when missing', async () => {
    mocks.getChannelDetailStats.mockResolvedValueOnce(makeDetailStats(1, 'Мой')).mockResolvedValueOnce(null);
    mocks.channelFindMany.mockResolvedValueOnce([{ id: 99 }]);

    const forbidden = await GET(new NextRequest('http://localhost:4000/api/stats/compare?a=1&b=99'));
    expect(forbidden.status).toBe(403);

    mocks.getChannelDetailStats.mockResolvedValueOnce(makeDetailStats(1, 'Мой')).mockResolvedValueOnce(null);
    mocks.channelFindMany.mockResolvedValueOnce([]);

    const notFound = await GET(new NextRequest('http://localhost:4000/api/stats/compare?a=1&b=99'));
    expect(notFound.status).toBe(404);
  });

  it('returns multi-channel comparison for ids=1,2,3 with shared advertisers and citation matrix', async () => {
    mocks.getChannelDetailStats.mockImplementation(async (id: number) => {
      if (id === 1) return makeDetailStats(1, 'Канал 1');
      if (id === 2) return makeDetailStats(2, 'Канал 2');
      if (id === 3) return makeDetailStats(3, 'Канал 3');
      return null;
    });
    mocks.mentionFindMany.mockResolvedValue([
      { sourceChannelId: 1, targetUsername: 'ad_brand', targetTgId: null, type: 'mention', sourcePost: { isAd: true } },
      { sourceChannelId: 3, targetUsername: 'ad_brand', targetTgId: null, type: 'mention', sourcePost: { isAd: true } },
      { sourceChannelId: 1, targetUsername: 'ch_2', targetTgId: null, type: 'forward', sourcePost: { isAd: false } },
    ]);

    const res = await GET(new NextRequest('http://localhost:4000/api/stats/compare?ids=1,2,3&period=30d'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.period).toBe('30d');
    expect(body.participants).toHaveLength(3);
    expect(body.a.channel.id).toBe(1);
    expect(body.b.channel.id).toBe(2);
    expect(body.comparison.sharedAdvertisers).toHaveLength(1);
    expect(body.comparison.sharedAdvertisers[0].username).toBe('ad_brand');
    expect(body.comparison.citationMatrix[0].countsByTargetId['2']).toBe(1);
  });

  it('supports comparing a single channel against a folder benchmarkTag', async () => {
    const ch1 = makeDetailStats(1, 'Мой канал', { tags: ['tech'], currentMembers: 15000 });
    const ch2 = makeDetailStats(2, 'Конкурент', { tags: ['tech'], currentMembers: 25000 });

    mocks.listUserChannels.mockResolvedValue([
      { id: 1, tags: ['tech'], isActive: true },
      { id: 2, tags: ['tech'], isActive: true },
    ]);
    mocks.getChannelDetailStats.mockImplementation(async (id: number) => (id === 1 ? ch1 : ch2));

    const res = await GET(
      new NextRequest('http://localhost:4000/api/stats/compare?ids=1&benchmarkTag=tech&period=7d')
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.participants).toHaveLength(2);
    expect(body.participants[1].channel.title).toBe('Среднее по папке: tech');
    expect(body.benchmarkProfile.tag).toBe('tech');
    expect(body.benchmarkProfile.cohortSize).toBe(2);
    expect(body.benchmarkProfile.metrics.subscribers.average).toBe(20000);
  });
});
