import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { materializeDailyMetrics } from '../materialize';

const mocks = vi.hoisted(() => ({
  snapshotFindMany: vi.fn(),
  snapshotFindFirst: vi.fn(),
  postFindMany: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../prisma', () => ({ prisma: {
  snapshot: { findMany: mocks.snapshotFindMany, findFirst: mocks.snapshotFindFirst },
  post: { findMany: mocks.postFindMany },
  channelMetricDaily: { upsert: mocks.upsert },
  $transaction: mocks.transaction,
} }));

const now = new Date('2026-10-17T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  mocks.snapshotFindMany.mockResolvedValue([]);
  mocks.snapshotFindFirst.mockResolvedValue({ membersCount: 1000 });
  mocks.postFindMany.mockResolvedValue([]);
  mocks.upsert.mockReturnValue(Promise.resolve({}));
  mocks.transaction.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('materializeDailyMetrics', () => {
  it('preserves daily VR and ERR formulas with one post query and one transaction', async () => {
    mocks.snapshotFindMany.mockResolvedValue([
      { membersCount: 1100, collectedAt: new Date('2026-10-17T10:00:00.000Z') },
    ]);
    mocks.postFindMany.mockResolvedValue([
      { publishedAt: new Date('2026-10-17T08:00:00.000Z'), views: 500, reactions: 10, comments: 2, forwards: 1 },
      { publishedAt: new Date('2026-10-17T09:00:00.000Z'), views: 600, reactions: 20, comments: 5, forwards: 2 },
    ]);

    await materializeDailyMetrics(1, 1);

    expect(mocks.postFindMany).toHaveBeenCalledOnce();
    expect(mocks.postFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId: 1, publishedAt: { gte: new Date('2026-10-16T12:00:00.000Z'), lte: now } },
    }));
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({
      avgViews: 550, postsCount: 2, vr: 50, err: 3.64,
    });
  });

  it('groups posts by UTC day and includes empty days in the batch', async () => {
    mocks.postFindMany.mockResolvedValue([
      { publishedAt: new Date('2026-10-16T23:59:00.000Z'), views: 100, reactions: 0, comments: 0, forwards: 0 },
      { publishedAt: new Date('2026-10-17T00:01:00.000Z'), views: 200, reactions: 0, comments: 0, forwards: 0 },
    ]);

    await materializeDailyMetrics(1, 3);

    expect(mocks.postFindMany).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.transaction.mock.calls[0][0]).toHaveLength(3);
    const writes = mocks.upsert.mock.calls.map(call => call[0]);
    expect(writes.map(write => write.create.date.toISOString().slice(0, 10))).toEqual([
      '2026-10-15', '2026-10-16', '2026-10-17',
    ]);
    expect(writes.map(write => write.update.postsCount)).toEqual([0, 1, 1]);
    expect(writes.map(write => write.update.avgViews)).toEqual([0, 100, 200]);
  });
});
