import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const db = vi.hoisted(() => ({
  postUpsert: vi.fn(),
  postSnapshotFindFirst: vi.fn(),
  postSnapshotCreate: vi.fn(),
  postSnapshotFindMany: vi.fn(),
  postSnapshotDeleteMany: vi.fn(),
  fraudFindFirst: vi.fn(),
  fraudUpdate: vi.fn(),
  fraudCreate: vi.fn(),
  fraudDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

// Keep persistence and retry tests isolated from the database and Telegram.
vi.mock('@/lib/prisma', () => {
  const fraudSignal = {
    findFirst: db.fraudFindFirst,
    update: db.fraudUpdate,
    create: db.fraudCreate,
    deleteMany: db.fraudDeleteMany,
  };
  return { prisma: {
    channel: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    snapshot: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    post: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn(), upsert: db.postUpsert },
    postSnapshot: {
      findFirst: db.postSnapshotFindFirst,
      create: db.postSnapshotCreate,
      findMany: db.postSnapshotFindMany,
      deleteMany: db.postSnapshotDeleteMany,
    },
    channelMetricDaily: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    fraudSignal,
    $transaction: db.transaction,
  },
  };
});

vi.mock('telegram', () => ({
  Api: {
    channels: { GetFullChannel: vi.fn() },
    messages: { CheckChatInvite: vi.fn() },
  },
  TelegramClient: vi.fn(),
}));

vi.mock('telegram/sessions/index.js', () => ({
  StringSession: vi.fn(),
}));

import { withRateLimitAndRetry, sleep } from '@/worker/fetcher';
import { cleanupOldPostSnapshots, saveFraudSignal, upsertPostWithReactions } from '@/worker/persister';

describe('withRateLimitAndRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRateLimitAndRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on FLOOD_WAIT error', async () => {
    const floodError: any = new Error('FLOOD_WAIT_2');
    floodError.errorMessage = 'FLOOD_WAIT_2';
    floodError.seconds = 0; // minimal wait to avoid timeout

    const fn = vi.fn()
      .mockRejectedValueOnce(floodError)
      .mockResolvedValueOnce('success-after-retry');

    const result = await withRateLimitAndRetry(fn, 3);
    expect(result).toBe('success-after-retry');
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('throws after max retries exceeded', async () => {
    const floodError: any = new Error('FLOOD_WAIT_1');
    floodError.errorMessage = 'FLOOD_WAIT_1';
    floodError.seconds = 0;

    const fn = vi.fn().mockRejectedValue(floodError);

    await expect(withRateLimitAndRetry(fn, 2)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('throws non-FLOOD_WAIT errors immediately', async () => {
    const regularError = new Error('Some other error');
    const fn = vi.fn().mockRejectedValue(regularError);

    await expect(withRateLimitAndRetry(fn, 3)).rejects.toThrow('Some other error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('sleep', () => {
  it('resolves after specified milliseconds', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow small variance
  });
});

const now = new Date('2026-10-17T12:00:00.000Z');

describe('collector persistence policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    db.postUpsert.mockResolvedValue({ id: 7 });
    db.postSnapshotFindFirst.mockResolvedValue(null);
    db.postSnapshotFindMany.mockResolvedValue([]);
    db.postSnapshotDeleteMany.mockResolvedValue({ count: 0 });
    db.fraudFindFirst.mockResolvedValue(null);
    db.transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) => callback({
      fraudSignal: {
        findFirst: db.fraudFindFirst,
        update: db.fraudUpdate,
        create: db.fraudCreate,
        deleteMany: db.fraudDeleteMany,
      },
    }));
  });
  afterEach(() => vi.useRealTimers());

  const post = (publishedAt: Date) => ({
    channelId: 1, messageId: 12n, publishedAt, views: 100,
    reactions: null, comments: null, forwards: null, text: null,
    groupedId: null, subscribersAtPublish: null,
  });

  it('records views only in the first 72 hours and no more often than every 45 minutes', async () => {
    await upsertPostWithReactions(post(new Date(now.getTime() - 72 * 60 * 60 * 1000)));
    expect(db.postSnapshotCreate).toHaveBeenCalledOnce();
    expect(db.postSnapshotCreate).toHaveBeenCalledWith({ data: { postId: 7, views: 100, collectedAt: now } });

    db.postSnapshotCreate.mockClear();
    db.postSnapshotFindFirst.mockResolvedValue({ collectedAt: new Date(now.getTime() - 44 * 60 * 1000) });
    await upsertPostWithReactions(post(new Date(now.getTime() - 60 * 60 * 1000)));
    expect(db.postSnapshotCreate).not.toHaveBeenCalled();

    db.postSnapshotFindFirst.mockResolvedValue({ collectedAt: new Date(now.getTime() - 45 * 60 * 1000) });
    await upsertPostWithReactions(post(new Date(now.getTime() - 60 * 60 * 1000)));
    expect(db.postSnapshotCreate).toHaveBeenCalledOnce();

    db.postSnapshotFindFirst.mockClear();
    db.postSnapshotCreate.mockClear();
    await upsertPostWithReactions(post(new Date(now.getTime() - 72 * 60 * 60 * 1000 - 1)));
    expect(db.postSnapshotFindFirst).not.toHaveBeenCalled();
    expect(db.postSnapshotCreate).not.toHaveBeenCalled();
  });

  it('saves available reaction details and preserves them when a later update has none', async () => {
    const publishedAt = new Date(now.getTime() - 60 * 60 * 1000);
    await upsertPostWithReactions({ ...post(publishedAt), reactions: 3,
      reactionBreakdown: [{ emoji: '🔥', count: 3 }] });
    expect(db.postUpsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({ reactions: 3, reactionBreakdown: [{ emoji: '🔥', count: 3 }] }),
      create: expect.objectContaining({ reactions: 3, reactionBreakdown: [{ emoji: '🔥', count: 3 }] }),
    }));

    await upsertPostWithReactions({ ...post(publishedAt), reactionBreakdown: null });
    expect(db.postUpsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({ reactions: undefined, reactionBreakdown: undefined }),
    }));
  });

  it('updates one fraud signal for today and removes same-day duplicates', async () => {
    db.fraudFindFirst.mockResolvedValue({ id: 9 });
    await saveFraudSignal(1, 'uniform_err', { flag: true, value: 0.04, reason: 'Подозрительно' });

    expect(db.fraudUpdate).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { value: 0.04, reason: 'Подозрительно', detectedAt: now },
    });
    expect(db.fraudDeleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({
      channelId: 1, signalType: 'uniform_err', id: { not: 9 },
      detectedAt: { gte: new Date('2026-10-17T00:00:00.000Z'), lt: new Date('2026-10-18T00:00:00.000Z') },
    }) });
    expect(db.fraudCreate).not.toHaveBeenCalled();
  });

  it('creates a signal once for a new day and clears its active window when the flag ends', async () => {
    await saveFraudSignal(1, 'growth_smoothness', { flag: true, value: 0.03, reason: 'Подозрительно' });
    expect(db.fraudCreate).toHaveBeenCalledOnce();
    expect(db.fraudCreate).toHaveBeenCalledWith({ data: {
      channelId: 1, signalType: 'growth_smoothness', value: 0.03, reason: 'Подозрительно', detectedAt: now,
    } });

    await saveFraudSignal(1, 'growth_smoothness', { flag: false, value: 0, reason: '' });
    expect(db.fraudDeleteMany).toHaveBeenCalledWith({ where: {
      channelId: 1, signalType: 'growth_smoothness',
      detectedAt: { gte: new Date('2026-09-17T12:00:00.000Z') },
    } });
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it('deletes old post snapshots in bounded batches', async () => {
    db.postSnapshotFindMany
      .mockResolvedValueOnce(Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 })))
      .mockResolvedValueOnce([{ id: 1001 }]);
    db.postSnapshotDeleteMany
      .mockResolvedValueOnce({ count: 1000 })
      .mockResolvedValueOnce({ count: 1 });

    expect(await cleanupOldPostSnapshots(now)).toBe(1001);
    expect(db.postSnapshotFindMany).toHaveBeenCalledTimes(2);
    expect(db.postSnapshotFindMany).toHaveBeenCalledWith({
      where: { collectedAt: { lt: new Date('2026-09-17T12:00:00.000Z') } },
      select: { id: true }, orderBy: { id: 'asc' }, take: 1000,
    });
    expect(db.postSnapshotDeleteMany).toHaveBeenLastCalledWith({ where: {
      id: { in: [1001] }, collectedAt: { lt: new Date('2026-09-17T12:00:00.000Z') },
    } });
  });
});
