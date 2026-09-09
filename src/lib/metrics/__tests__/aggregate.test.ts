import { describe, it, expect } from 'vitest';
import { buildMetricsFromMaterialized, calculateChannelMetricsFromData } from '../aggregate';

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

  describe('avgViews24h consistency', () => {
    it('calculates the same avgViews24h for both materialized and fallback engines', () => {
      const testNow = new Date('2023-01-10T12:00:00Z');

      const dailyMetrics = [
        { date: '2023-01-10T00:00:00Z', followers: 1000, postsCount: 1, avgViews: 100, err: 0 },
        { date: '2023-01-09T00:00:00Z', followers: 900, postsCount: 2, avgViews: 500, err: 0 }
      ];
      
      const posts = [
        // Post today (should be ignored for 24h avg)
        { publishedAt: new Date('2023-01-10T10:00:00Z'), views: 100, text: 'today post', reactions: 0, comments: 0, forwards: 0 },
        // Post between 24 and 48 hours ago
        { publishedAt: new Date('2023-01-08T18:00:00Z'), views: 400, text: 'post 1', reactions: 0, comments: 0, forwards: 0 },
        { publishedAt: new Date('2023-01-08T14:00:00Z'), views: 600, text: 'post 2', reactions: 0, comments: 0, forwards: 0 }
      ];

      const resMaterialized = buildMetricsFromMaterialized(baseChannel, dailyMetrics, posts, testNow);
      
      const snapshots = [
        { collectedAt: new Date('2023-01-10T00:00:00Z'), membersCount: 1000 },
        { collectedAt: new Date('2023-01-09T00:00:00Z'), membersCount: 900 }
      ];

      const resFallback = calculateChannelMetricsFromData(
        { ...baseChannel, niche: 'test', tgId: null, createdAt: new Date(baseChannel.createdAt), lastCollectedAt: new Date(baseChannel.lastCollectedAt) } as any,
        snapshots,
        posts,
        testNow
      );

      // (400 + 600) / 2 = 500
      expect(resMaterialized.avgViews24h).toBe(500);
      expect(resFallback.avgViews24h).toBe(500);
    });

    it('falls back to 7d avg if no posts in 24-48h window', () => {
      const testNow = new Date('2023-01-10T12:00:00Z');

      const dailyMetrics = [
        { date: '2023-01-10T00:00:00Z', followers: 1000, postsCount: 0, avgViews: 0, err: 0 }
      ];
      
      const posts = [
        // Post 5 days ago
        { publishedAt: new Date('2023-01-05T10:00:00Z'), views: 1000, text: 'old post 1', reactions: 0, comments: 0, forwards: 0 },
        { publishedAt: new Date('2023-01-04T10:00:00Z'), views: 2000, text: 'old post 2', reactions: 0, comments: 0, forwards: 0 }
      ];

      const resMaterialized = buildMetricsFromMaterialized(baseChannel, dailyMetrics, posts, testNow);
      
      const snapshots = [
        { collectedAt: new Date('2023-01-10T00:00:00Z'), membersCount: 1000 }
      ];

      const resFallback = calculateChannelMetricsFromData(
        { ...baseChannel, niche: 'test', tgId: null, createdAt: new Date(baseChannel.createdAt), lastCollectedAt: new Date(baseChannel.lastCollectedAt) } as any,
        snapshots,
        posts,
        testNow
      );

      // (1000 + 2000) / 2 = 1500
      expect(resMaterialized.avgViews24h).toBe(1500);
      expect(resFallback.avgViews24h).toBe(1500);
    });
  });
});
