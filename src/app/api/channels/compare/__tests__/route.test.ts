import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ChannelDetailStats } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  extractRequestSession: vi.fn(),
  getChannelDetailStats: vi.fn(),
  listUserChannels: vi.fn(),
  channelFindMany: vi.fn(),
  mentionFindMany: vi.fn(),
  buildMultiChannelComparison: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  extractRequestSession: mocks.extractRequestSession,
}));
vi.mock('@/lib/metrics', () => ({
  getChannelDetailStats: mocks.getChannelDetailStats,
  parseStatsPeriod: (raw: string | null) => (raw === '24h' || raw === '30d' ? raw : '7d'),
}));
vi.mock('@/lib/user-channels', () => ({
  listUserChannels: mocks.listUserChannels,
}));
vi.mock('@/lib/compare', () => ({
  buildMultiChannelComparison: mocks.buildMultiChannelComparison,
  buildTagBenchmarkProfile: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    channel: { findMany: mocks.channelFindMany },
    mention: { findMany: mocks.mentionFindMany },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';
import { GET as STATS_COMPARE_GET } from '@/app/api/stats/compare/route';

function makeStats(id: number): ChannelDetailStats {
  return {
    channel: {
      id,
      username: `ch_${id}`,
      tgId: String(1000 + id),
      title: `Канал ${id}`,
      type: 'channel',
      niche: 'tech',
      tags: [],
      isMine: false,
      isFavorite: false,
      isActive: true,
      consecutiveErrors: 0,
      lastMessageId: '10',
      lastError: null,
      lastCollectedAt: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      currentMembers: id * 1000,
      delta24h: { abs: 10, percent: 1 },
      delta7d: { abs: 50, percent: 5 },
      delta30d: { abs: 100, percent: 10 },
      er7d: 2.5,
      err7d: 14,
      erTrend: 0.2,
      posts7d: 7,
      adShare30d: null,
      score: { total: 60, level: 'medium' },
      fraudScore: 10,
      fraudSignals: [],
      citation: null,
    },
    history: [],
    posts: [],
    contentTypeDistribution: [],
    topPosts: [],
  } as unknown as ChannelDetailStats;
}

describe('GET /api/channels/compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractRequestSession.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
    mocks.channelFindMany.mockResolvedValue([]);
    mocks.mentionFindMany.mockResolvedValue([]);
    mocks.buildMultiChannelComparison.mockReturnValue({ period: '7d', summary: {} });
  });

  it('re-exports GET handler from /api/stats/compare', () => {
    expect(GET).toBe(STATS_COMPARE_GET);
  });

  it('returns 400 when fewer than two valid ids are provided', async () => {
    const res = await GET(new NextRequest('http://localhost:4000/api/channels/compare?ids=1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Необходимо выбрать минимум 2 канала для сравнения (или канал и папку)',
    });
  });

  it('returns 403 when a scoped user requests a channel without access', async () => {
    mocks.getChannelDetailStats
      .mockResolvedValueOnce(makeStats(1))
      .mockResolvedValueOnce(null);
    mocks.channelFindMany.mockResolvedValue([{ id: 2 }]);

    const res = await GET(new NextRequest('http://localhost:4000/api/channels/compare?ids=1,2'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Нет доступа к одному из выбранных каналов' });
  });

  it('returns 200 comparison payload for accessible channels', async () => {
    mocks.getChannelDetailStats
      .mockResolvedValueOnce(makeStats(1))
      .mockResolvedValueOnce(makeStats(2));

    const res = await GET(new NextRequest('http://localhost:4000/api/channels/compare?ids=1,2&period=30d'));
    expect(res.status).toBe(200);
    const body = await res.json() as { period: string; participants: unknown[]; comparison: unknown };
    expect(body.period).toBe('30d');
    expect(body.participants).toHaveLength(2);
    expect(body.comparison).toEqual({ period: '7d', summary: {} });
  });
});
