import { describe, it, expect } from 'vitest';
import { calculateAdShare } from '../adShare';

describe('calculateAdShare', () => {
  it('returns none and 0% if no posts in period', () => {
    const posts: any[] = [];
    const now = new Date('2023-01-10T12:00:00Z');
    
    const result = calculateAdShare(posts, 7, now);
    expect(result).toEqual({ percent: 0, level: 'none' });
  });

  it('returns low for 0% if no ads in period but posts exist', () => {
    const now = new Date('2023-01-10T12:00:00Z');
    const posts = [
      { isAd: false, publishedAt: new Date('2023-01-09T12:00:00Z') },
      { isAd: null, publishedAt: new Date('2023-01-08T12:00:00Z') },
    ];
    
    const result = calculateAdShare(posts, 7, now);
    expect(result).toEqual({ percent: 0, level: 'low' });
  });

  it('calculates low ad share (<10%)', () => {
    const now = new Date('2023-01-10T12:00:00Z');
    const posts = Array.from({ length: 20 }, (_, i) => ({
      isAd: i === 0, // 1 ad out of 20 = 5%
      publishedAt: new Date('2023-01-09T12:00:00Z')
    }));
    
    const result = calculateAdShare(posts, 7, now);
    expect(result).toEqual({ percent: 5, level: 'low' });
  });

  it('calculates medium ad share (10-30%)', () => {
    const now = new Date('2023-01-10T12:00:00Z');
    const posts = Array.from({ length: 10 }, (_, i) => ({
      isAd: i < 2, // 2 ads out of 10 = 20%
      publishedAt: new Date('2023-01-09T12:00:00Z')
    }));
    
    const result = calculateAdShare(posts, 7, now);
    expect(result).toEqual({ percent: 20, level: 'medium' });
  });

  it('calculates high ad share (>30%)', () => {
    const now = new Date('2023-01-10T12:00:00Z');
    const posts = Array.from({ length: 10 }, (_, i) => ({
      isAd: i < 4, // 4 ads out of 10 = 40%
      publishedAt: new Date('2023-01-09T12:00:00Z')
    }));
    
    const result = calculateAdShare(posts, 7, now);
    expect(result).toEqual({ percent: 40, level: 'high' });
  });

  it('filters posts outside the period', () => {
    const now = new Date('2023-01-10T12:00:00Z');
    const posts = [
      { isAd: true, publishedAt: new Date('2023-01-09T12:00:00Z') }, // inside 7 days
      { isAd: true, publishedAt: new Date('2022-12-01T12:00:00Z') }, // outside 7 days
      { isAd: false, publishedAt: new Date('2023-01-08T12:00:00Z') }, // inside 7 days
    ];
    
    // Only 2 posts in period, 1 ad = 50% = high
    const result = calculateAdShare(posts, 7, now);
    expect(result).toEqual({ percent: 50, level: 'high' });
  });
});
