import { describe, it, expect } from 'vitest';
import { buildMetricsFromMaterialized } from '../aggregate';

describe('aggregate metrics', () => {
  const baseChannel = {
    id: 1,
    username: 'test',
    tgId: '123',
    title: 'test channel',
    type: 'group',
    isMine: true,
    isFavorite: false,
    isActive: true,
    consecutiveErrors: 0,
    lastMessageId: '1',
    lastError: null,
    lastCollectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const now = new Date('2023-01-10T12:00:00Z');

  describe('cr7d (Comments Rate 7 days)', () => {
    it('calculates cr7d correctly for normal case', () => {
      const dailyMetrics = [
        { date: '2023-01-10T10:00:00Z', followers: 1000, postsCount: 0, avgViews: 0, err: 0 }
      ];
      
      const recentPosts = [
        { publishedAt: new Date('2023-01-09T10:00:00Z'), comments: 50, views: 500, text: 'hi' },
        { publishedAt: new Date('2023-01-08T10:00:00Z'), comments: 10, views: 500, text: 'hello' }
      ];

      // total comments = 60, posts = 2, avg = 30
      // members = 1000
      // cr7d = 30 / 1000 * 100 = 3.00

      const result = buildMetricsFromMaterialized(baseChannel, dailyMetrics, recentPosts, now);
      expect(result.cr7d).toBe(3);
    });

    it('returns null if members is null or 0', () => {
      const dailyMetricsNull = [
        { date: '2023-01-10T10:00:00Z', followers: null, postsCount: 0, avgViews: 0, err: 0 }
      ];
      const dailyMetricsZero = [
        { date: '2023-01-10T10:00:00Z', followers: 0, postsCount: 0, avgViews: 0, err: 0 }
      ];
      
      const recentPosts = [
        { publishedAt: new Date('2023-01-09T10:00:00Z'), comments: 50, views: 500, text: 'hi' }
      ];

      const res1 = buildMetricsFromMaterialized(baseChannel, dailyMetricsNull, recentPosts, now);
      expect(res1.cr7d).toBeNull();

      const res2 = buildMetricsFromMaterialized(baseChannel, dailyMetricsZero, recentPosts, now);
      expect(res2.cr7d).toBeNull();
    });

    it('returns null if there are no posts in the last 7 days', () => {
      const dailyMetrics = [
        { date: '2023-01-10T10:00:00Z', followers: 1000, postsCount: 0, avgViews: 0, err: 0 }
      ];
      
      const recentPosts = [
        { publishedAt: new Date('2022-12-01T10:00:00Z'), comments: 50, views: 500, text: 'hi' }
      ];

      const result = buildMetricsFromMaterialized(baseChannel, dailyMetrics, recentPosts, now);
      expect(result.cr7d).toBeNull();
    });
  });
});
