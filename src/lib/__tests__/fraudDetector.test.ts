import { describe, it, expect } from 'vitest';
import { checkViewsToSubsRatio } from '../fraudDetector';

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
});
