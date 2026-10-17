import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metricsCache } from '../../cache';
import { channel as channelMetrics } from '../../__tests__/fixtures/channel-metrics';

const db = vi.hoisted(() => ({
  channelFindMany: vi.fn(), channelFindUnique: vi.fn(), channelFindFirst: vi.fn(),
  dailyFindMany: vi.fn(), snapshotFindMany: vi.fn(), postFindMany: vi.fn(), fraudFindMany: vi.fn(),
}));
const calculations = vi.hoisted(() => ({ materialized: vi.fn(), fallback: vi.fn() }));
vi.mock('../../prisma', () => ({ prisma: {
  channel: { findMany: db.channelFindMany, findUnique: db.channelFindUnique, findFirst: db.channelFindFirst },
  channelMetricDaily: { findMany: db.dailyFindMany },
  snapshot: { findMany: db.snapshotFindMany },
  post: { findMany: db.postFindMany },
  fraudSignal: { findMany: db.fraudFindMany },
} }));
vi.mock('../aggregate', () => ({
  buildMetricsFromMaterialized: calculations.materialized,
  calculateChannelMetricsFromData: calculations.fallback,
}));
vi.mock('../../citationIndex', () => ({
  getCitationIndexForChannel: vi.fn().mockResolvedValue(0),
  getCitationIndicesForChannels: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('../../fraudDetector', () => ({ runFraudAudit: vi.fn(() => ({ fraudScore: 0, signals: [] })) }));
vi.mock('../../scoring', () => ({ calculateContentScore: vi.fn(() => ({})) }));

import { getBestTimeRecommendation, getChannelDetailStats, getOverviewStats } from '../queries';

const channel = (id: number) => ({
  id, title: `Channel ${id}`, username: `channel${id}`, tgId: null, type: 'channel', niche: 'general',
  isMine: false, isFavorite: false, isActive: true, consecutiveErrors: 0, lastMessageId: null,
  lastError: null, lastCollectedAt: null, createdAt: new Date('2026-10-01T00:00:00.000Z'),
});

beforeEach(() => {
  vi.clearAllMocks();
  metricsCache.invalidate();
  db.channelFindMany.mockResolvedValue([channel(1)]);
  db.channelFindUnique.mockResolvedValue(channel(1));
  db.channelFindFirst.mockResolvedValue(null);
  db.dailyFindMany.mockResolvedValue([{ channelId: 1, date: new Date(), followers: 1000 }]);
  db.snapshotFindMany.mockResolvedValue([]);
  db.postFindMany.mockResolvedValue([]);
  db.fraudFindMany.mockResolvedValue([]);
  calculations.materialized.mockImplementation((item: { id: number }) => ({ ...channelMetrics, id: item.id }));
  calculations.fallback.mockImplementation((item: { id: number }) => ({ ...channelMetrics, id: item.id }));
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('zoned publication time', () => {
  it('places posts in the same local hour and weekday on servers with different TZ', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    vi.stubEnv('APP_TIMEZONE', 'Europe/Moscow');
    const post = {
      id: 10, channelId: 1, messageId: BigInt(10), publishedAt: new Date('2026-10-17T22:30:00.000Z'),
      views: 100, reactions: 0, comments: 0, forwards: 0, text: 'Example post',
    };
    db.postFindMany.mockResolvedValue([post]);
    db.channelFindMany.mockResolvedValue([{ ...channel(1), snapshots: [{ membersCount: 1000 }] }]);
    metricsCache.set('overview', { channels: [{ ...channelMetrics, id: 1 }], myChannel: null });

    vi.stubEnv('TZ', 'UTC');
    const utcDetail = await getChannelDetailStats(1, '24h');
    const utcBestTime = await getBestTimeRecommendation();
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const pacificDetail = await getChannelDetailStats(1, '24h');
    const pacificBestTime = await getBestTimeRecommendation();

    expect(utcDetail?.heatmapData.find(cell => cell.day === 0 && cell.hour === 1)?.count).toBe(1);
    expect(utcDetail?.postsDistribution.find(bucket => bucket.date === '01:00')?.postsCount).toBe(1);
    expect(pacificDetail?.heatmapData).toEqual(utcDetail?.heatmapData);
    expect(pacificDetail?.postsDistribution).toEqual(utcDetail?.postsDistribution);
    expect(utcBestTime?.heatmap.find(cell => cell.day === 0 && cell.hour === 1)?.postCount).toBe(1);
    expect(pacificBestTime).toEqual(utcBestTime);
    expect(utcBestTime?.timeZone).toBe('Europe/Moscow');
  });
});

describe('metrics query batching', () => {
  it('loads fallback snapshots and 30-day posts once for all channels without daily metrics', async () => {
    db.channelFindMany.mockResolvedValue([channel(1), channel(2), channel(3)]);
    db.snapshotFindMany.mockResolvedValue([
      { channelId: 2, membersCount: 200, collectedAt: new Date('2026-10-15T00:00:00.000Z') },
      { channelId: 3, membersCount: 300, collectedAt: new Date('2026-10-15T00:00:00.000Z') },
    ]);
    db.postFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { channelId: 2, publishedAt: new Date('2026-10-15T00:00:00.000Z'), views: 100 },
    ]);

    const result = await getOverviewStats();

    expect(result.channels).toHaveLength(3);
    expect(db.snapshotFindMany).toHaveBeenCalledOnce();
    expect(db.snapshotFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId: { in: [2, 3] } },
    }));
    expect(db.postFindMany).toHaveBeenCalledTimes(2);
    expect(db.postFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { channelId: { in: [2, 3] }, publishedAt: { gte: expect.any(Date) } },
    }));
    expect(calculations.fallback).toHaveBeenCalledTimes(2);
    expect(calculations.fallback.mock.calls[0][1]).toHaveLength(1);
    expect(calculations.fallback.mock.calls[0][2]).toHaveLength(1);
    expect(calculations.fallback.mock.calls[1][1]).toHaveLength(1);
    expect(calculations.fallback.mock.calls[1][2]).toHaveLength(0);
  });

  it('reuses the cached overview EP for repeated channel detail requests', async () => {
    const first = await getChannelDetailStats(1);
    const second = await getChannelDetailStats(1);

    expect(first?.channel.id).toBe(1);
    expect(second?.channel.id).toBe(1);
    expect(db.channelFindMany).toHaveBeenCalledOnce();
    expect(metricsCache.get('overview')).not.toBeNull();
  });
});
