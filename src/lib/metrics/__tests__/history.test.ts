import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ posts: vi.fn(), snapshots: vi.fn(), reach: vi.fn() }));
vi.mock('../../prisma', () => ({ prisma: {
  post: { findMany: db.posts },
  snapshot: { findMany: db.snapshots },
  postViewSnapshot: { findMany: db.reach },
} }));

import { buildHeatmapData, buildPostsDistribution, getAdReachCurve, getVrHistory } from '../history';

beforeEach(() => {
  vi.clearAllMocks();
  db.posts.mockResolvedValue([]);
  db.snapshots.mockResolvedValue([]);
  db.reach.mockResolvedValue([]);
});

describe('publication history', () => {
  it('groups posts by the application timezone and distinguishes missing views from zero', () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    const distribution = buildPostsDistribution([
      { publishedAt: new Date('2026-10-17T22:30:00.000Z'), views: null },
      { publishedAt: new Date('2026-10-18T08:00:00.000Z'), views: 0 },
      { publishedAt: new Date('2026-10-18T09:00:00.000Z'), views: 100 },
    ], '7d', now, 'Europe/Moscow');

    expect(distribution.find(row => row.date === '2026-10-18')).toEqual({
      date: '2026-10-18', postsCount: 3, viewsAvg: 50,
    });
    expect(distribution).toHaveLength(8);
    const missingOnly = buildPostsDistribution([
      { publishedAt: new Date('2026-10-17T22:30:00.000Z'), views: null },
    ], '24h', now, 'Europe/Moscow');
    expect(missingOnly.find(row => row.date === '01:00')).toEqual({
      date: '01:00', postsCount: 1, viewsAvg: null,
    });
  });

  it('places the same instant in different weekday and hour cells by timezone', () => {
    const posts = [{ publishedAt: new Date('2026-10-17T22:30:00.000Z') }];
    const moscow = buildHeatmapData(posts, 'Europe/Moscow');
    const utc = buildHeatmapData(posts, 'UTC');

    expect(moscow).toHaveLength(168);
    expect(moscow.find(cell => cell.day === 0 && cell.hour === 1)?.count).toBe(1);
    expect(utc.find(cell => cell.day === 6 && cell.hour === 22)?.count).toBe(1);
  });

  it('uses the latest audience snapshot on each post day for VR history', async () => {
    db.posts.mockResolvedValue([
      { publishedAt: new Date('2026-10-02T08:00:00.000Z'), views: 200 },
      { publishedAt: new Date('2026-10-02T09:00:00.000Z'), views: 400 },
      { publishedAt: new Date('2026-10-03T09:00:00.000Z'), views: 100 },
    ]);
    db.snapshots.mockResolvedValueOnce([
      { collectedAt: new Date('2026-10-02T18:00:00.000Z'), membersCount: 1500 },
    ]).mockResolvedValueOnce([
      { collectedAt: new Date('2026-09-30T18:00:00.000Z'), membersCount: 1000 },
    ]);

    const history = await getVrHistory(7, 30);

    expect(history).toEqual([
      { date: '2026-10-02', vr: 20, avgViews: 300, membersCount: 1500 },
      { date: '2026-10-03', vr: 6.67, avgViews: 100, membersCount: 1500 },
    ]);
    expect(db.snapshots).toHaveBeenCalledTimes(2);
  });

  it('returns an empty history without viewed posts and maps the saved ad reach curve', async () => {
    db.posts.mockResolvedValue([{ publishedAt: new Date('2026-10-02T08:00:00.000Z'), views: null }]);
    expect(await getVrHistory(7)).toEqual([]);
    db.reach.mockResolvedValue([{ hoursAfterPost: 1, viewsCount: 100 }, { hoursAfterPost: 12, viewsCount: 250 }]);
    expect(await getAdReachCurve(9)).toEqual([
      { hoursAfterPost: 1, views: 100 }, { hoursAfterPost: 12, views: 250 },
    ]);
    expect(db.reach).toHaveBeenCalledWith({ where: { postId: 9 }, orderBy: { hoursAfterPost: 'asc' } });
  });
});
