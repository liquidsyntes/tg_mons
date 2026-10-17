import { describe, expect, it } from 'vitest';
import { mergePostsDistribution, mergeSubscriberHistory } from '../compare';

describe('compare chart helpers', () => {
  it('merges subscriber histories in chronological order with forward-filled values', () => {
    const merged = mergeSubscriberHistory(
      [
        { collectedAt: '2026-10-17T10:00:00.000Z', membersCount: 1000 },
        { collectedAt: '2026-10-17T12:00:00.000Z', membersCount: 1050 },
      ],
      [
        { collectedAt: '2026-10-17T11:00:00.000Z', membersCount: 500 },
      ],
      '7d'
    );

    expect(merged).toHaveLength(3);
    expect(merged[0].membersA).toBe(1000);
    expect(merged[0].membersB).toBeUndefined();
    expect(merged[1].membersA).toBe(1000);
    expect(merged[1].membersB).toBe(500);
    expect(merged[2].membersA).toBe(1050);
    expect(merged[2].membersB).toBe(500);
  });

  it('merges posts distribution by date bucket', () => {
    const merged = mergePostsDistribution(
      [
        { date: '10:00', postsCount: 2, viewsAvg: 400 },
        { date: '12:00', postsCount: 1, viewsAvg: 300 },
      ],
      [
        { date: '11:00', postsCount: 3, viewsAvg: 500 },
        { date: '12:00', postsCount: 4, viewsAvg: 600 },
      ],
      '24h'
    );

    expect(merged).toEqual([
      { date: '10:00', postsA: 2, postsB: 0, viewsA: 400, viewsB: 0 },
      { date: '11:00', postsA: 0, postsB: 3, viewsA: 0, viewsB: 500 },
      { date: '12:00', postsA: 1, postsB: 4, viewsA: 300, viewsB: 600 },
    ]);
  });
});
