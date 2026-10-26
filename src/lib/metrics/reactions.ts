import type { ChannelReactionSummary, ReactionBreakdownItem } from '../types';

export function parseReactionBreakdown(value: unknown): ReactionBreakdownItem[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const items: ReactionBreakdownItem[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const { emoji, count } = item as Record<string, unknown>;
    if (typeof emoji !== 'string' || !emoji.trim() ||
        typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) continue;
    items.push({ emoji, count });
  }
  return items.sort((left, right) => right.count - left.count).slice(0, 10);
}

export function calculatePopularReactions(posts: Array<{
  reactions: number | null;
  reactionBreakdown: unknown;
}>): ChannelReactionSummary {
  const totals = new Map<string, number>();
  let totalReactions = 0;
  let coveredPosts = 0;

  for (const post of posts) {
    const breakdown = parseReactionBreakdown(post.reactionBreakdown);
    if (!breakdown || breakdown.length === 0) continue;
    const knownTotal = breakdown.reduce((sum, item) => sum + item.count, 0);
    totalReactions += Math.max(knownTotal, post.reactions ?? 0);
    coveredPosts++;
    for (const item of breakdown) totals.set(item.emoji, (totals.get(item.emoji) ?? 0) + item.count);
  }

  const top = [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([emoji, count]) => ({ emoji, count,
      sharePercent: totalReactions > 0 ? Number((100 * count / totalReactions).toFixed(1)) : 0 }));
  return { totalReactions, coveredPosts, top };
}
