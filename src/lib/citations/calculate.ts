import type { CitationInput } from './types';
import { isRecord, parseFiniteNumber, parseCount, extractSubscribers, hasDirectMentionFields, extractMentionSourceId } from './normalization';

/**
 * Calculates a quantitative "citation index" based on channel mentions and reposts (`calculateCitationIndex`).
 *
 * This index weights incoming citations logarithmically by the referring channel's subscriber base:
 * CI = sum(count_i * log10(citing_subscribers_i))
 *
 * Logarithmic Weighting Rationale:
 * A logarithmic scale ensures that citations from large channels carry significantly more authority
 * without completely overwhelming the index:
 * - 1,000 subscribers     => log10(1,000) = 3.0
 * - 10,000 subscribers    => log10(10,000) = 4.0
 * - 100,000 subscribers   => log10(100,000) = 5.0
 * - 1,000,000 subscribers => log10(1,000,000) = 6.0
 *
 * Normalization & Edge Case Handling:
 * 1. Clamping: Citing channels with subscribers <= 1 receive 0 weight (prevents log10(1) = 0, log10(0) = -Infinity, or negative values).
 * 2. Temporal Window: Mentions are strictly filtered to the last 30 days (`0 <= now - mentionDate <= 30 days`, with a 24-hour future tolerance for clock skew).
 * 3. Self-Citations: Excludes any citation where citing channel matches the target channel (`sourceChannelId === targetChannelId`).
 * 4. Precision & Bounds: Clamped to >= 0 and rounded to 2 decimal places (`Number(totalScore.toFixed(2))`).
 * 5. Input Resilience: Safely handles empty arrays, 0 mentions, null, undefined, strings, numbers, and BigInts without crashing.
 *
 * @param channel - Object containing mentions/citations, an array of `CitationMention`, or a numeric mention count.
 * @param now - Reference date for the 30-day lookback window (defaults to `new Date()`).
 * @returns {number} Normalized citation index score (number >= 0, rounded to 2 decimal places).
 */
export function calculateCitationIndex(
  channel: CitationInput,
  now: Date = new Date()
): number {
  if (!channel && channel !== 0) {
    return 0;
  }

  let mentionList: ReadonlyArray<unknown> = [];
  let selfId: number | undefined;

  if (Array.isArray(channel)) {
    mentionList = channel;
  } else if (typeof channel === 'number' || typeof channel === 'bigint') {
    mentionList = [channel];
  } else if (typeof channel === 'string' && channel.trim() !== '') {
    const num = parseFiniteNumber(channel);
    if (num !== null && num > 0) {
      mentionList = [num];
    } else {
      return 0;
    }
  } else if (isRecord(channel)) {
    const rawId = channel.id ?? channel.channelId;
    if (typeof rawId === 'number') {
      selfId = rawId;
    }

    if (Array.isArray(channel.mentions)) {
      mentionList = channel.mentions;
    } else if (Array.isArray(channel.inboundMentions)) {
      mentionList = channel.inboundMentions;
    } else if (Array.isArray(channel.inbound_mentions)) {
      mentionList = channel.inbound_mentions;
    } else if (Array.isArray(channel.inbound)) {
      mentionList = channel.inbound;
    } else if (Array.isArray(channel.citations)) {
      mentionList = channel.citations;
    } else if (hasDirectMentionFields(channel)) {
      // Single mention object passed directly
      mentionList = [channel];
    } else if (typeof channel.mentions === 'number' || typeof channel.mentions === 'bigint') {
      return 0;
    }
  }

  if (mentionList.length === 0) {
    return 0;
  }

  const MS_30D = 30 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  let totalScore = 0;

  for (const m of mentionList) {
    if (!m) continue;

    // Exclude self-citations if target channel id is known
    if (selfId !== undefined && isRecord(m)) {
      const mentionSourceId = extractMentionSourceId(m);
      if (mentionSourceId !== undefined && mentionSourceId === selfId) {
        continue;
      }
    }

    // Check date window if date is provided
    if (isRecord(m)) {
      const dateVal =
        m.date ||
        m.createdAt ||
        m.created_at ||
        m.publishedAt ||
        m.published_at ||
        m.timestamp;
      if (dateVal instanceof Date || typeof dateVal === 'string' || typeof dateVal === 'number') {
        const dateMs =
          typeof dateVal === 'number'
            ? (dateVal < 10000000000 ? dateVal * 1000 : dateVal)
            : new Date(dateVal).getTime();
        if (!Number.isNaN(dateMs)) {
          const diff = nowMs - dateMs;
          // Exclude if older than 30 days or unreasonably in the future (>1 day clock skew)
          if (diff > MS_30D || diff < -24 * 60 * 60 * 1000) {
            continue;
          }
        }
      }
    }

    // Number of mentions (reposts/citations)
    const rawCount =
      typeof m === 'number' || typeof m === 'bigint'
        ? 1
        : isRecord(m)
        ? (m.mentions ?? m.count)
        : undefined;
    const count = parseCount(rawCount);

    if (count <= 0) continue;

    // Citing subscribers
    const subs = extractSubscribers(m);

    // Logarithmic formula: sum(mentions * log10(citing_subscribers))
    // Clamped so subs <= 1 yields 0 weight (log10(1) = 0, log10(0) = -Infinity)
    if (subs <= 1) continue;

    const weight = Math.log10(subs);
    if (Number.isFinite(weight) && weight > 0) {
      totalScore += count * weight;
    }
  }

  if (!Number.isFinite(totalScore) || totalScore <= 0) {
    return 0;
  }

  return Number(totalScore.toFixed(2));
}
