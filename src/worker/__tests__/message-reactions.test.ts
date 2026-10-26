import { describe, expect, it } from 'vitest';
import { parseMessageReactions } from '../message-reactions';

describe('parseMessageReactions', () => {
  it('sums all reactions and keeps the ten most frequent emojis', () => {
    const results = Array.from({ length: 12 }, (_, index) => ({
      count: index + 1, reaction: { className: 'ReactionEmoji', emoticon: `emoji-${index}` },
    }));
    expect(parseMessageReactions({ results })).toEqual({
      reactions: 78,
      reactionBreakdown: results.slice(2).reverse().map(item => ({ emoji: item.reaction.emoticon, count: item.count })),
    });
  });

  it('aggregates custom and paid reactions without losing the numeric total', () => {
    expect(parseMessageReactions({ results: [
      { count: 4, reaction: { className: 'ReactionEmoji', emoticon: '👍' } },
      { count: 3, reaction: { className: 'ReactionCustomEmoji', documentId: 1n } },
      { count: 2, reaction: { className: 'ReactionCustomEmoji', documentId: 2n } },
      { count: 1, reaction: { className: 'ReactionPaid' } },
    ] })).toEqual({ reactions: 10, reactionBreakdown: [
      { emoji: 'custom', count: 5 }, { emoji: '👍', count: 4 }, { emoji: '⭐', count: 1 },
    ] });
  });

  it('distinguishes empty and unavailable reactions and isolates damaged data', () => {
    expect(parseMessageReactions({ results: [] })).toEqual({ reactions: 0, reactionBreakdown: [] });
    expect(parseMessageReactions(null)).toEqual({ reactions: null, reactionBreakdown: null });
    expect(parseMessageReactions({ results: [{ count: 'bad' }] })).toEqual({ reactions: null, reactionBreakdown: null });
    expect(parseMessageReactions({ get results() { throw new Error('damaged'); } }))
      .toEqual({ reactions: null, reactionBreakdown: null });
  });
});
