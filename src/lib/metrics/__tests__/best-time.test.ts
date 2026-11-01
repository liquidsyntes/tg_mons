import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ posts: vi.fn(), channels: vi.fn() }));
vi.mock('../../prisma', () => ({ prisma: { post: { findMany: db.posts } } }));
vi.mock('../../user-channels', () => ({ listUserChannels: db.channels }));

import { getBestTimeRecommendation } from '../best-time';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
  vi.stubEnv('APP_TIMEZONE', 'Europe/Moscow');
  db.channels.mockResolvedValue([]);
  db.posts.mockResolvedValue([]);
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('best publication time', () => {
  it('returns null without active competitors and skips the post query', async () => {
    expect(await getBestTimeRecommendation(7)).toBeNull();
    expect(db.channels).toHaveBeenCalledWith(7, {
      onlyActive: true, excludeMine: true, withLatestSnapshot: true,
    });
    expect(db.posts).not.toHaveBeenCalled();
  });

  it('keeps the empty recommendation when competitors have no recent posts', async () => {
    db.channels.mockResolvedValue([{ id: 2, snapshots: [] }]);
    const result = await getBestTimeRecommendation(7);
    expect(result).toMatchObject({
      timeZone: 'Europe/Moscow', bestDay: 0, bestHour: 0,
      score: 0, avgViews: 0, avgVr: 0, postCount: 0,
    });
    expect(result?.heatmap).toHaveLength(168);
  });

  it('scores the competitor post using the latest audience and local weekday', async () => {
    db.channels.mockResolvedValue([{ id: 2, snapshots: [{ membersCount: 1000 }] }]);
    db.posts.mockResolvedValue([{ channelId: 2, publishedAt: new Date('2026-10-17T22:30:00.000Z'), views: 100 }]);

    const result = await getBestTimeRecommendation(7);

    expect(result).toMatchObject({
      timeZone: 'Europe/Moscow', bestDay: 0, bestHour: 1,
      score: 50, avgViews: 100, avgVr: 10, postCount: 1,
    });
    expect(result?.heatmap.find(cell => cell.day === 0 && cell.hour === 1)).toMatchObject({
      postCount: 1, avgVr: 10, score: 50,
    });
    expect(db.posts).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId: { in: [2] }, publishedAt: { gte: expect.any(Date) } },
    }));
  });
});
