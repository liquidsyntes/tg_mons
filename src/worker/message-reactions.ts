import type { ReactionBreakdownItem } from '../lib/types';

interface ParsedMessageReactions {
  reactions: number | null;
  reactionBreakdown: ReactionBreakdownItem[] | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function reactionLabel(value: unknown): string {
  const reaction = record(value);
  if (!reaction) return 'custom';
  if (reaction.className === 'ReactionPaid') return '⭐';
  if (typeof reaction.emoticon === 'string' && reaction.emoticon.trim()) return reaction.emoticon;
  return 'custom';
}

export function parseMessageReactions(value: unknown): ParsedMessageReactions {
  try {
    const results = record(value)?.results;
    if (!Array.isArray(results)) return { reactions: null, reactionBreakdown: null };
    const counts = new Map<string, number>();
    let total = 0;
    let valid = 0;
    for (const value of results) {
      const entry = record(value);
      if (!entry || typeof entry.count !== 'number' || !Number.isSafeInteger(entry.count) || entry.count < 0) continue;
      valid++;
      total += entry.count;
      if (entry.count > 0) {
        const label = reactionLabel(entry.reaction);
        counts.set(label, (counts.get(label) ?? 0) + entry.count);
      }
    }
    if (results.length > 0 && valid === 0) return { reactions: null, reactionBreakdown: null };
    const reactionBreakdown = [...counts.entries()]
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji))
      .slice(0, 10);
    return { reactions: total, reactionBreakdown };
  } catch {
    return { reactions: null, reactionBreakdown: null };
  }
}
