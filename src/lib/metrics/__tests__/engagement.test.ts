import { describe, it, expect } from 'vitest';
import { calculatePostER, aggregateChannelER } from '../engagement';

describe('Engagement Metrics', () => {
  describe('calculatePostER', () => {
    it('calculates ER correctly for a standard post', () => {
      const post = {
        views: 1000,
        reactions: 50,
        comments: 10,
        forwards: 5,
        subscribersAtPublish: 5000,
      };
      // (1000 + 50 + 10 + 5) / 5000 * 100 = 1065 / 50 = 21.3
      expect(calculatePostER(post)).toBe(21.3);
    });

    it('returns null if subscribersAtPublish is 0', () => {
      const post = {
        views: 1000,
        subscribersAtPublish: 0,
      };
      expect(calculatePostER(post)).toBeNull();
    });

    it('returns null if subscribersAtPublish is missing or null', () => {
      const post = {
        views: 1000,
      };
      expect(calculatePostER(post)).toBeNull();
      
      const post2 = {
        views: 1000,
        subscribersAtPublish: null,
      };
      expect(calculatePostER(post2)).toBeNull();
    });

    it('handles posts with 0 views and no reactions', () => {
      const post = {
        views: 0,
        reactions: null,
        comments: null,
        forwards: null,
        subscribersAtPublish: 1000,
      };
      expect(calculatePostER(post)).toBe(0);
    });

    it('handles posts with only reactions', () => {
      const post = {
        views: null,
        reactions: 100,
        subscribersAtPublish: 1000,
      };
      expect(calculatePostER(post)).toBe(10);
    });
  });

  describe('aggregateChannelER', () => {
    it('aggregates average ER across multiple posts', () => {
      const posts = [
        { views: 500, subscribersAtPublish: 1000 }, // 50%
        { views: 1000, subscribersAtPublish: 1000 }, // 100%
        { views: 1500, subscribersAtPublish: 1000 }, // 150%
      ];
      expect(aggregateChannelER(posts)).toBe(100);
    });

    it('ignores posts with null ER', () => {
      const posts = [
        { views: 500, subscribersAtPublish: 1000 }, // 50%
        { views: 1000, subscribersAtPublish: null }, // Ignored
        { views: 1000, subscribersAtPublish: 0 }, // Ignored
        { views: 1500, subscribersAtPublish: 1000 }, // 150%
      ];
      expect(aggregateChannelER(posts)).toBe(100);
    });

    it('returns null if no posts have valid ER', () => {
      const posts = [
        { views: 1000, subscribersAtPublish: null },
        { views: 1000, subscribersAtPublish: 0 },
      ];
      expect(aggregateChannelER(posts)).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(aggregateChannelER([])).toBeNull();
    });
  });
});
