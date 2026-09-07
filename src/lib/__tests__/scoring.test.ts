import { describe, it, expect } from 'vitest';
import { getEngagementBreakdown } from '../scoring';

describe('getEngagementBreakdown', () => {
  it('should return correct percentages for normal values', () => {
    const post = { views: 900, reactions: 50, comments: 30, forwards: 20 };
    // total = 1000
    // views = 90.0, reactions = 5.0, comments = 3.0, forwards = 2.0
    const result = getEngagementBreakdown(post);
    expect(result).toEqual({
      views: 90.0,
      reactions: 5.0,
      comments: 3.0,
      forwards: 2.0
    });
  });

  it('should handle division by zero (all values zero)', () => {
    const post = { views: 0, reactions: 0, comments: 0, forwards: 0 };
    const result = getEngagementBreakdown(post);
    expect(result).toEqual({
      views: 0,
      reactions: 0,
      comments: 0,
      forwards: 0
    });
  });

  it('should handle missing values as zero', () => {
    const post = { views: 100 };
    const result = getEngagementBreakdown(post);
    expect(result).toEqual({
      views: 100.0,
      reactions: 0.0,
      comments: 0.0,
      forwards: 0.0
    });
  });

  it('should handle null values as zero', () => {
    const post = { views: 100, reactions: null, comments: null, forwards: null };
    const result = getEngagementBreakdown(post);
    expect(result).toEqual({
      views: 100.0,
      reactions: 0.0,
      comments: 0.0,
      forwards: 0.0
    });
  });
});
