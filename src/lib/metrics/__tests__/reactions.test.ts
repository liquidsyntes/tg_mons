import { describe, expect, it } from 'vitest';
import { calculatePopularReactions, parseReactionBreakdown } from '../reactions';

describe('channel reactions', () => {
  it('counts top emojis and their share of all reactions with known breakdowns', () => {
    const summary = calculatePopularReactions([
      { reactions: 10, reactionBreakdown: [{ emoji: '👍', count: 6 }, { emoji: '🔥', count: 4 }] },
      { reactions: 10, reactionBreakdown: [{ emoji: '👍', count: 3 }, { emoji: '👎', count: 2 }] },
    ]);
    expect(summary).toEqual({ totalReactions: 20, coveredPosts: 2, top: [
      { emoji: '👍', count: 9, sharePercent: 45 },
      { emoji: '🔥', count: 4, sharePercent: 20 },
      { emoji: '👎', count: 2, sharePercent: 10 },
    ] });
  });

  it('ignores old posts without breakdown and rejects invalid JSON entries', () => {
    expect(parseReactionBreakdown([{ emoji: '👍', count: 2 }, { emoji: '', count: 1 }, { count: 3 }]))
      .toEqual([{ emoji: '👍', count: 2 }]);
    expect(calculatePopularReactions([
      { reactions: 100, reactionBreakdown: null },
      { reactions: 5, reactionBreakdown: [{ emoji: '🔥', count: 5 }] },
    ])).toEqual({ totalReactions: 5, coveredPosts: 1, top: [{ emoji: '🔥', count: 5, sharePercent: 100 }] });
    expect(calculatePopularReactions([{ reactions: 100, reactionBreakdown: null }]))
      .toEqual({ totalReactions: 0, coveredPosts: 0, top: [] });
  });
});
