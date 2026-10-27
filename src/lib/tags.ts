export const MAX_CHANNEL_TAGS = 10;
export const MAX_CHANNEL_TAG_LENGTH = 30;

/**
 * Normalizes and validates an input array of personal channel tags.
 * - Rejects non-arrays or arrays containing non-string items (returns null)
 * - Trims whitespace and removes empty strings
 * - Rejects tags longer than MAX_CHANNEL_TAG_LENGTH characters (returns null)
 * - Deduplicates case-insensitively while preserving the casing of the first occurrence
 * - Rejects lists exceeding MAX_CHANNEL_TAGS unique tags (returns null)
 */
export function normalizeChannelTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') {
      return null;
    }

    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.length > MAX_CHANNEL_TAG_LENGTH) {
      return null;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);

    if (normalized.length > MAX_CHANNEL_TAGS) {
      return null;
    }
  }

  return normalized;
}

export interface ChannelTagSummary {
  tag: string;
  count: number;
}

/**
 * Collects unique tags across channels (case-insensitive grouping, preserving first-seen casing)
 * sorted by channel count descending, then alphabetically.
 */
export function summarizeChannelTags(
  channels: ReadonlyArray<{ tags?: readonly string[] | null }>
): ChannelTagSummary[] {
  const byLower = new Map<string, { tag: string; count: number }>();

  for (const channel of channels) {
    const channelTags = channel.tags ?? [];
    const seenInChannel = new Set<string>();
    for (const rawTag of channelTags) {
      const trimmed = rawTag.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seenInChannel.has(key)) continue;
      seenInChannel.add(key);
      const existing = byLower.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byLower.set(key, { tag: trimmed, count: 1 });
      }
    }
  }

  return Array.from(byLower.values()).sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru')
  );
}

/**
 * Checks whether a channel has a given tag (case-insensitive).
 */
export function channelHasTag(
  tags: readonly string[] | null | undefined,
  targetTag: string
): boolean {
  if (!tags || tags.length === 0) return false;
  const targetKey = targetTag.trim().toLowerCase();
  if (!targetKey) return false;
  return tags.some(tag => tag.trim().toLowerCase() === targetKey);
}
