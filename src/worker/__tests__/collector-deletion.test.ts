import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postFindMany: vi.fn(),
  postUpdate: vi.fn(),
  snapshotUpsert: vi.fn(),
  getClient: vi.fn(),
  resolveEntity: vi.fn(),
  withRateLimitAndRetry: vi.fn(),
  withTimeout: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    post: {
      findMany: mocks.postFindMany,
      update: mocks.postUpdate,
    },
    postViewSnapshot: {
      upsert: mocks.snapshotUpsert,
    },
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../client', () => ({
  getTelegramClient: mocks.getClient,
}));

vi.mock('../fetcher', async (importOriginal) => {
  const original = await importOriginal<typeof import('../fetcher')>();
  return {
    ...original,
    resolveChannelEntity: mocks.resolveEntity,
    withRateLimitAndRetry: mocks.withRateLimitAndRetry,
    withTimeout: mocks.withTimeout,
  };
});

import { isDeletedTelegramMessage, runAdReachCycle } from '../ad-reach';
import { TelegramTimeoutError } from '../fetcher';

const NOW = new Date('2026-11-12T12:15:00.000Z');
const PUBLISHED_25H_AGO = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);

function makeAdPost(id: number, messageId: bigint, existingCheckpoints: number[] = [1, 12]) {
  return {
    id,
    channelId: 10,
    messageId,
    publishedAt: PUBLISHED_25H_AGO,
    views: 900,
    deletedAt: null,
    deletedAfterHours: null,
    channel: { id: 10, username: 'donor_channel', tgId: 1000n },
    viewSnapshots: existingCheckpoints.map((hoursAfterPost) => ({ hoursAfterPost })),
  };
}

describe('isDeletedTelegramMessage', () => {
  it('detects null, undefined and MessageEmpty as deleted', () => {
    expect(isDeletedTelegramMessage(null)).toBe(true);
    expect(isDeletedTelegramMessage(undefined)).toBe(true);
    expect(isDeletedTelegramMessage({ className: 'MessageEmpty', id: 101 })).toBe(true);
    expect(isDeletedTelegramMessage({ className: 'Message', id: 101, views: 500 })).toBe(false);
  });
});

describe('runAdReachCycle deletion detection', () => {
  const getMessages = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClient.mockResolvedValue({ getMessages });
    mocks.resolveEntity.mockResolvedValue({ id: 1000, className: 'Channel' });
    mocks.withTimeout.mockImplementation((fn: () => Promise<unknown>) => fn());
    mocks.withRateLimitAndRetry.mockImplementation((fn: () => Promise<unknown>) => fn());
    mocks.postUpdate.mockResolvedValue({});
    mocks.snapshotUpsert.mockResolvedValue({});
  });

  it('marks MessageEmpty and missing messages as deleted without aborting live posts', async () => {
    const emptyPost = makeAdPost(1, 101n, [1, 12]);
    const missingPost = makeAdPost(2, 102n, [1, 12]);
    const livePost = makeAdPost(3, 103n, [1, 12]);

    mocks.postFindMany.mockResolvedValue([emptyPost, missingPost, livePost]);
    getMessages.mockResolvedValue([
      { id: 101, className: 'MessageEmpty' },
      // 102 is completely absent from Telegram response
      { id: 103, className: 'Message', views: 1850 },
    ]);

    await runAdReachCycle(NOW);

    expect(mocks.postUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        deletedAt: NOW,
        deletedAfterHours: 24,
        lastCheckedAt: NOW,
      },
    });
    expect(mocks.postUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        deletedAt: NOW,
        deletedAfterHours: 24,
        lastCheckedAt: NOW,
      },
    });

    expect(mocks.snapshotUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.snapshotUpsert).toHaveBeenCalledWith({
      where: { postId_hoursAfterPost: { postId: 3, hoursAfterPost: 24 } },
      update: { viewsCount: 1850, capturedAt: NOW },
      create: { postId: 3, hoursAfterPost: 24, viewsCount: 1850, capturedAt: NOW },
    });
    expect(mocks.postUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        lastCheckedAt: NOW,
        views: 1850,
      },
    });
  });

  it('does NOT mark posts deleted on TelegramTimeoutError or network / FLOOD_WAIT failure', async () => {
    mocks.postFindMany.mockResolvedValue([makeAdPost(1, 101n, [1, 12])]);

    mocks.withRateLimitAndRetry.mockRejectedValueOnce(new TelegramTimeoutError('getMessages', 'donor_channel'));
    await runAdReachCycle(NOW);

    expect(mocks.postUpdate).not.toHaveBeenCalled();
    expect(mocks.snapshotUpsert).not.toHaveBeenCalled();

    const floodErr = Object.assign(new Error('FLOOD_WAIT_60'), { errorMessage: 'FLOOD_WAIT_60', seconds: 60 });
    mocks.withRateLimitAndRetry.mockRejectedValueOnce(floodErr);
    await runAdReachCycle(NOW);

    expect(mocks.postUpdate).not.toHaveBeenCalled();
    expect(mocks.snapshotUpsert).not.toHaveBeenCalled();
  });

  it('isolates per-post persistence failures inside a channel', async () => {
    const firstDeleted = makeAdPost(1, 101n, [1, 12]);
    const secondLive = makeAdPost(2, 102n, [1, 12]);
    mocks.postFindMany.mockResolvedValue([firstDeleted, secondLive]);

    getMessages.mockResolvedValue([
      { id: 101, className: 'MessageEmpty' },
      { id: 102, className: 'Message', views: 2100 },
    ]);

    mocks.postUpdate
      .mockRejectedValueOnce(new Error('transient db write error'))
      .mockResolvedValueOnce({});

    await runAdReachCycle(NOW);

    expect(mocks.snapshotUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.snapshotUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId_hoursAfterPost: { postId: 2, hoursAfterPost: 24 } },
      }),
    );
  });
});
