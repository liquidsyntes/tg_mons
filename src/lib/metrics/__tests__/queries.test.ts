import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { getChannelDetailStats, getOverviewStats } from '../queries';

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
