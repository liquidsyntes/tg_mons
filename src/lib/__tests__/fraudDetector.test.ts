import { describe, it, expect } from 'vitest';
import { checkViewsToSubsRatio, checkGrowthSmoothness } from '../fraudDetector';

describe('Fraud Detector', () => {
  describe('checkViewsToSubsRatio', () => {
    it('returns flag false and 0 ratio if members <= 0', () => {
      const posts = [{ views: 100 }];
      const result = checkViewsToSubsRatio(posts, 0);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBe(0);
      expect(result.reason).toContain('Недостаточно');
    });

    it('returns flag false if no posts with valid views', () => {
      const posts = [{ views: null }, { views: 0 }];
      const result = checkViewsToSubsRatio(posts, 1000);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBe(0);
      expect(result.reason).toContain('Нет постов');
    });

    it('flags low ratio (<5%) when enough posts are present', () => {
      // 10000 members, avg views = 300 (3%)
      const posts = Array(5).fill({ views: 300 });
      const result = checkViewsToSubsRatio(posts, 10000);
      expect(result.flag).toBe(true);
      expect(result.ratio).toBeCloseTo(0.03);
      expect(result.reason).toContain('< 5%');
    });

    it('flags high ratio (>150%) when enough posts are present', () => {
      // 1000 members, avg views = 2000 (200%)
      const posts = Array(6).fill({ views: 2000 });
      const result = checkViewsToSubsRatio(posts, 1000);
      expect(result.flag).toBe(true);
      expect(result.ratio).toBeCloseTo(2.0);
      expect(result.reason).toContain('> 150%');
    });

    it('does not flag if ratio is normal', () => {
      // 10000 members, avg views = 2000 (20%)
      const posts = Array(5).fill({ views: 2000 });
      const result = checkViewsToSubsRatio(posts, 10000);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBeCloseTo(0.2);
      expect(result.reason).toContain('пределах нормы');
    });

    it('does not flag if there are not enough posts even if ratio is extreme', () => {
      // 10000 members, avg views = 300 (3%), but only 4 posts
      const posts = Array(4).fill({ views: 300 });
      const result = checkViewsToSubsRatio(posts, 10000);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBeCloseTo(0.03);
      expect(result.reason).toContain('Недостаточно постов');
    });
  });

  describe('checkGrowthSmoothness', () => {
    const today = new Date();
    
    it('returns flag false if insufficient data', () => {
      const metrics = Array(13).fill(null).map((_, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: 100 + i * 10
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('Недостаточно данных');
    });

    it('returns flag false for organic (variable) growth', () => {
      // 14 days, deltas will vary significantly (+10, -5, +30...)
      const followers = [100, 110, 105, 135, 140, 150, 145, 160, 180, 175, 200, 210, 205, 250];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.cv).toBeGreaterThan(0.1);
      expect(result.reason).toContain('Рост в пределах нормы');
    });

    it('returns flag true for linear growth (fraud)', () => {
      // Strictly same delta (+10) each day -> CV = 0
      const metrics = Array(15).fill(null).map((_, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: 100 + i * 10
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(true);
      expect(result.cv).toBe(0);
      expect(result.reason).toContain('Аномально гладкий рост');
    });

    it('returns flag false if no monotonic growth (avg delta <= 0)', () => {
      // Followers are decreasing
      const metrics = Array(15).fill(null).map((_, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: 100 - i * 5
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.cv).toBe(0);
      expect(result.reason).toContain('Нет монотонного роста');
    });

    it('returns flag false for weak growth with one massive spike', () => {
      const followers = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 2000];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.cv).toBeGreaterThan(0.1);
      expect(result.reason).toContain('Рост в пределах нормы');
    });
  });
});

