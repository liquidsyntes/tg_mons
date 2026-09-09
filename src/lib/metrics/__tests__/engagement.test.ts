import { describe, it, expect } from 'vitest';
import { calculatePostER, aggregateChannelER, calculatePostERR, aggregateChannelERR } from '../engagement';

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
  describe('calculatePostERR', () => {
    it('calculates ERR correctly for a standard post', () => {
      const post = { views: 1000, reactions: 50, comments: 20, forwards: 30 }; // Total = 100
      expect(calculatePostERR(post)).toBe(10);
    });

    it('returns null if views is 0', () => {
      const post = { views: 0, reactions: 50, comments: 10 };
      expect(calculatePostERR(post)).toBeNull();
    });

    it('returns null if views is missing', () => {
      const post = { reactions: 50, comments: 10 };
      expect(calculatePostERR(post)).toBeNull();
    });

    it('handles posts with 0 engagements', () => {
      const post = { views: 1000, reactions: 0, comments: 0, forwards: 0 };
      expect(calculatePostERR(post)).toBe(0);
    });
  });

  describe('aggregateChannelERR', () => {
    it('aggregates average ERR across multiple posts', () => {
      const posts = [
        { views: 1000, reactions: 50 }, // 5%
        { views: 2000, reactions: 100, comments: 100 }, // 10%
        { views: 1000, forwards: 150 }, // 15%
      ];
      expect(aggregateChannelERR(posts)).toBe(10);
    });

    it('returns null if all posts have 0 engagements (hidden)', () => {
      const posts = [
        { views: 1000, reactions: 0, comments: 0, forwards: 0 },
        { views: 2000 },
      ];
      expect(aggregateChannelERR(posts)).toBeNull();
    });

    it('returns >0 if at least one post has >0 comments but 0 reactions', () => {
      const posts = [
        { views: 1000, reactions: 0, comments: 0 }, // 0%
        { views: 1000, reactions: 0, comments: 0 }, // 0%
        { views: 1000, comments: 30 }, // 3%
      ];
      expect(aggregateChannelERR(posts)).toBe(1);
    });

    it('returns null for empty array', () => {
      expect(aggregateChannelERR([])).toBeNull();
    });
  });
});