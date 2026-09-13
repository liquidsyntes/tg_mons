/**
 * Represents an individual inbound citation or mention of a Telegram channel.
 *
 * Supports flexible property naming conventions to accommodate diverse database query outputs,
 * raw API payloads, and synthetic test fixtures.
 *
 * @property mentions - Total count of mentions/reposts in this citation record.
 * @property count - Alias for `mentions` count.
 * @property citing_subscribers - Subscriber count of the citing channel (snake_case convention).
 * @property citingSubscribers - Subscriber count of the citing channel (camelCase convention).
 * @property subscribers - Subscriber count of the citing channel (general alias).
 * @property membersCount - Member count of citing channel from snapshot model (camelCase).
 * @property members_count - Member count of citing channel (snake_case alias).
 * @property currentMembers - Current member count of citing channel (camelCase).
 * @property current_members - Current member count of citing channel (snake_case alias).
 * @property sourceChannelId - Database ID of the citing channel (used for self-citation exclusion).
 * @property channelId - Alternative channel ID identifier.
 * @property sourceChannel - Nested source channel object containing member metrics.
 * @property citingChannel - Nested citing channel object containing member metrics.
 * @property channel - Nested channel reference containing member metrics.
 * @property createdAt - Timestamp when the citation occurred (used for 30-day temporal window).
 * @property publishedAt - Publication timestamp alias.
 * @property date - General date timestamp alias.
 * @property timestamp - Raw epoch or date timestamp alias.
 */
export interface CitationMention {
  mentions?: number | string | bigint;
  count?: number | string | bigint;
  citing_subscribers?: number | string | bigint;
  citingSubscribers?: number | string | bigint;
  subscribers?: number | string | bigint;
  membersCount?: number | string | bigint;
  members_count?: number | string | bigint;
  currentMembers?: number | string | bigint;
  current_members?: number | string | bigint;
  sourceChannelId?: number;
  channelId?: number;
  sourceChannel?: {
    currentMembers?: number | string | bigint;
    membersCount?: number | string | bigint;
    subscribers?: number | string | bigint;
  };
  citingChannel?: {
    currentMembers?: number | string | bigint;
    membersCount?: number | string | bigint;
    subscribers?: number | string | bigint;
  };
  channel?: {
    currentMembers?: number | string | bigint;
    membersCount?: number | string | bigint;
    subscribers?: number | string | bigint;
  };
  createdAt?: Date | string;
  publishedAt?: Date | string;
  date?: Date | string;
  timestamp?: Date | string;
}

/**
 * Flexible input container for channel citation index calculations.
 *
 * Accommodates channel models, database query payloads, or custom objects containing
 * mention collections under various naming conventions.
 *
 * @property id - Unique channel ID (used to filter out self-citations).
 * @property channelId - Alternative channel ID alias.
 * @property mentions - Array of `CitationMention` records or numeric mention count.
 * @property citations - Array of `CitationMention` records.
 * @property inboundMentions - Array of inbound `CitationMention` records (camelCase).
 * @property inbound_mentions - Array of inbound `CitationMention` records (snake_case).
 * @property inbound - Array of inbound citation records.
 */
export interface CitationChannelInput {
  id?: number;
  channelId?: number;
  mentions?: CitationMention[] | number;
  citations?: CitationMention[];
  inboundMentions?: CitationMention[];
  inbound_mentions?: CitationMention[];
  inbound?: CitationMention[];
  [key: string]: any;
}

function parseCount(val: unknown): number {
  if (val === undefined || val === null) return 1;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (typeof val === 'bigint') {
    const n = Number(val);
    return isFinite(n) ? n : 0;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const clean = val.replace(/[\s,_]/g, '');
    const n = Number(clean);
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function parseSubscribers(val: unknown): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isFinite(val) && val > 1 ? val : 0;
  if (typeof val === 'bigint') {
    const n = Number(val);
    return isFinite(n) && n > 1 ? n : 0;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const clean = val.replace(/[\s,_]/g, '');
    const n = Number(clean);
    return isFinite(n) && n > 1 ? n : 0;
  }
  return 0;
}

function extractSubscribers(m: any): number {
  if (typeof m === 'number' || typeof m === 'bigint') {
    return parseSubscribers(m);
  }
  if (typeof m === 'string' && m.trim() !== '') {
    return parseSubscribers(m);
  }
  if (!m || typeof m !== 'object') return 0;

  const direct =
    m.citing_subscribers ??
    m.citingSubscribers ??
    m.subscribers ??
    m.membersCount ??
    m.members_count ??
    m.currentMembers ??
    m.current_members;

  const parsedDirect = parseSubscribers(direct);
  if (parsedDirect > 0) return parsedDirect;

  const nested =
    m.sourceChannel?.currentMembers ??
    m.sourceChannel?.current_members ??
    m.sourceChannel?.membersCount ??
    m.sourceChannel?.members_count ??
    m.sourceChannel?.subscribers ??
    m.source_channel?.currentMembers ??
    m.source_channel?.current_members ??
    m.source_channel?.membersCount ??
    m.source_channel?.members_count ??
    m.source_channel?.subscribers ??
    m.citingChannel?.currentMembers ??
    m.citingChannel?.current_members ??
    m.citingChannel?.membersCount ??
    m.citingChannel?.members_count ??
    m.citingChannel?.subscribers ??
    m.citing_channel?.currentMembers ??
    m.citing_channel?.current_members ??
    m.citing_channel?.membersCount ??
    m.citing_channel?.members_count ??
    m.citing_channel?.subscribers ??
    m.channel?.currentMembers ??
    m.channel?.current_members ??
    m.channel?.membersCount ??
    m.channel?.members_count ??
    m.channel?.subscribers;

  return parseSubscribers(nested);
}

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
  channel: CitationChannelInput | CitationMention[] | number | bigint | string | null | undefined,
  now: Date = new Date()
): number {
  if (!channel && channel !== 0) {
    return 0;
  }

  let mentionList: any[] = [];
  let selfId: number | undefined;

  if (Array.isArray(channel)) {
    mentionList = channel;
  } else if (typeof channel === 'number' || typeof channel === 'bigint') {
    mentionList = [channel];
  } else if (typeof channel === 'string' && channel.trim() !== '') {
    const clean = channel.replace(/[\s,_]/g, '');
    const num = Number(clean);
    if (isFinite(num) && num > 0) {
      mentionList = [num];
    } else {
      return 0;
    }
  } else if (typeof channel === 'object') {
    selfId = channel.id ?? channel.channelId;

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
    } else if (
      channel.citing_subscribers !== undefined ||
      channel.citingSubscribers !== undefined ||
      channel.subscribers !== undefined ||
      channel.membersCount !== undefined ||
      channel.members_count !== undefined ||
      channel.currentMembers !== undefined ||
      channel.current_members !== undefined ||
      channel.sourceChannel !== undefined ||
      channel.citingChannel !== undefined ||
      channel.channel !== undefined ||
      channel.count !== undefined
    ) {
      // Single mention object passed directly
      mentionList = [channel];
    } else if (typeof channel.mentions === 'number' || typeof channel.mentions === 'bigint') {
      if (channel.mentions <= 0) return 0;
      // Mentions count without citing subscriber details yields 0 weight
      return 0;
    }
  }

  if (!mentionList || mentionList.length === 0) {
    return 0;
  }

  const MS_30D = 30 * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  let totalScore = 0;

  for (const m of mentionList) {
    if (!m) continue;

    // Exclude self-citations if target channel id is known
    if (selfId !== undefined && typeof m === 'object') {
      const mentionSourceId =
        m.sourceChannelId ??
        m.source_channel_id ??
        m.sourceChannel?.id ??
        m.source_channel?.id ??
        m.channelId;
      if (mentionSourceId !== undefined && mentionSourceId === selfId) {
        continue;
      }
    }

    // Check date window if date is provided
    const dateVal =
      m.date ||
      m.createdAt ||
      m.created_at ||
      m.publishedAt ||
      m.published_at ||
      m.timestamp;
    if (dateVal) {
      let dateMs = NaN;
      if (typeof dateVal === 'number') {
        dateMs = dateVal < 10000000000 ? dateVal * 1000 : dateVal;
      } else {
        dateMs = new Date(dateVal).getTime();
      }
      if (!isNaN(dateMs)) {
        const diff = nowMs - dateMs;
        // Exclude if older than 30 days or unreasonably in the future (>1 day clock skew)
        if (diff > MS_30D || diff < -24 * 60 * 60 * 1000) {
          continue;
        }
      }
    }

    // Number of mentions (reposts/citations)
    const rawCount = typeof m === 'number' || typeof m === 'bigint'
      ? 1
      : (m.mentions ?? m.count);
    const count = parseCount(rawCount);

    if (count <= 0) continue;

    // Citing subscribers
    const subs = extractSubscribers(m);

    // Logarithmic formula: sum(mentions * log10(citing_subscribers))
    // Clamped so subs <= 1 yields 0 weight (log10(1) = 0, log10(0) = -Infinity)
    if (subs <= 1) continue;

    const weight = Math.log10(subs);
    if (isFinite(weight) && weight > 0) {
      totalScore += count * weight;
    }
  }

  if (isNaN(totalScore) || !isFinite(totalScore) || totalScore <= 0) {
    return 0;
  }

  return Number(totalScore.toFixed(2));
}

/**
 * Database helper: Queries inbound mentions for a single channel over the last 30 days and computes its citation index.
 *
 * Performs a Prisma database aggregation on the `mention` table:
 * 1. Matches incoming mentions by `targetUsername` (with and without '@' prefix) or `targetTgId`.
 * 2. Excludes self-citations where `sourceChannelId === channel.id`.
 * 3. Restricts citations to the specified date window (`createdAt >= dateLimit`).
 * 4. Resolves subscriber counts of citing channels using their latest `Snapshot` (with fallback to post `subscribersAtPublish`).
 * 5. Computes and returns the logarithmic citation index score.
 *
 * @param channel - Target channel object containing `id`, optional `username`, and optional `tgId`.
 * @param dateLimit - Cutoff date for the citation lookback window (defaults to 30 days prior to current time).
 * @returns {Promise<number>} A Promise resolving to the calculated citation index score (number >= 0). Returns 0 on error or if no mentions exist.
 */
export async function getCitationIndexForChannel(
  channel: { id: number; username: string | null; tgId: bigint | string | number | null },
  dateLimit: Date = new Date(Date.now() - 30 * 24 * 3600 * 1000)
): Promise<number> {
  const orConditions: any[] = [];
  if (channel.username) {
    const cleanUsername = channel.username.replace(/^@/, '').toLowerCase();
    const rawUsername = channel.username.replace(/^@/, '');
    const userVariants = Array.from(new Set([cleanUsername, `@${cleanUsername}`, rawUsername, `@${rawUsername}`]));
    orConditions.push({ targetUsername: { in: userVariants } });
  }
  if (channel.tgId) {
    try {
      orConditions.push({ targetTgId: BigInt(channel.tgId) });
    } catch {
      // ignore invalid tgId
    }
  }

  if (orConditions.length === 0) return 0;

  try {
    const { prisma } = await import('./prisma');

    const inboundRaw = await prisma.mention.groupBy({
      by: ['sourceChannelId'],
      where: {
        OR: orConditions,
        createdAt: { gte: dateLimit },
        sourceChannelId: { not: channel.id }, // Exclude self-citations
      },
      _count: { id: true }
    });

    if (inboundRaw.length === 0) return 0;

    const sourceChannelIds = Array.from(new Set(inboundRaw.map(i => i.sourceChannelId)));
    const snapshots = await prisma.snapshot.findMany({
      where: { channelId: { in: sourceChannelIds } },
      orderBy: { collectedAt: 'desc' },
      distinct: ['channelId'],
      select: { channelId: true, membersCount: true }
    });

    const subsMap = new Map<number, number>();
    for (const s of snapshots) {
      subsMap.set(s.channelId, s.membersCount);
    }

    // Fallback: if any citing channels don't have snapshots yet, check subscribersAtPublish on their posts
    const missingSourceIds = sourceChannelIds.filter(id => !subsMap.has(id));
    if (missingSourceIds.length > 0) {
      const fallbackPosts = await prisma.post.findMany({
        where: {
          channelId: { in: missingSourceIds },
          subscribersAtPublish: { not: null, gt: 0 },
        },
        orderBy: { publishedAt: 'desc' },
        distinct: ['channelId'],
        select: { channelId: true, subscribersAtPublish: true }
      });
      for (const p of fallbackPosts) {
        if (p.subscribersAtPublish && !subsMap.has(p.channelId)) {
          subsMap.set(p.channelId, p.subscribersAtPublish);
        }
      }
    }

    const citations: CitationMention[] = inboundRaw.map(item => ({
      mentions: item._count.id,
      citing_subscribers: subsMap.get(item.sourceChannelId) || 0
    }));

    return calculateCitationIndex(citations);
  } catch {
    return 0;
  }
}

/**
 * Database helper: Batch calculates citation indices for multiple channels in an optimized query.
 *
 * Efficiently aggregates inbound mentions for an array of channels in a single database round-trip:
 * 1. Collects unique target usernames and Telegram IDs across all provided channels.
 * 2. Fetches matching inbound mentions from the Prisma `mention` table within the lookback window (`createdAt >= dateLimit`).
 * 3. Retrieves latest subscriber counts for all citing source channels in one `Snapshot` query (with fallback to post `subscribersAtPublish`).
 * 4. Disaggregates mentions per channel, filters out self-citations, and computes the logarithmic citation index for each channel.
 *
 * @param channels - Array of target channel objects, each containing `id`, optional `username`, and optional `tgId`.
 * @param dateLimit - Cutoff date for the lookback window (defaults to 30 days prior to current time).
 * @returns {Promise<Map<number, number>>} A Promise resolving to a Map where keys are channel IDs and values are computed citation index scores.
 */
export async function getCitationIndicesForChannels(
  channels: Array<{ id: number; username: string | null; tgId: bigint | string | number | null }>,
  dateLimit: Date = new Date(Date.now() - 30 * 24 * 3600 * 1000)
): Promise<Map<number, number>> {
  const resultMap = new Map<number, number>();
  for (const ch of channels) {
    resultMap.set(ch.id, 0);
  }

  if (channels.length === 0) return resultMap;

  try {
    const { prisma } = await import('./prisma');

    const targetUsernames: string[] = [];
    const targetTgIds: bigint[] = [];

    for (const ch of channels) {
      if (ch.username) {
        const clean = ch.username.replace(/^@/, '').toLowerCase();
        const raw = ch.username.replace(/^@/, '');
        targetUsernames.push(clean, `@${clean}`);
        if (raw !== clean) {
          targetUsernames.push(raw, `@${raw}`);
        }
      }
      if (ch.tgId) {
        try {
          targetTgIds.push(BigInt(ch.tgId));
        } catch {
          // ignore
        }
      }
    }

    const uniqueUsernames = Array.from(new Set(targetUsernames));
    const uniqueTgIds = Array.from(new Set(targetTgIds));

    if (uniqueUsernames.length === 0 && uniqueTgIds.length === 0) {
      return resultMap;
    }

    const orClauses: any[] = [];
    if (uniqueUsernames.length > 0) {
      orClauses.push({ targetUsername: { in: uniqueUsernames } });
    }
    if (uniqueTgIds.length > 0) {
      orClauses.push({ targetTgId: { in: uniqueTgIds } });
    }

    const inboundMentions = await prisma.mention.findMany({
      where: {
        createdAt: { gte: dateLimit },
        OR: orClauses,
      },
      select: {
        sourceChannelId: true,
        targetUsername: true,
        targetTgId: true,
      }
    });

    if (inboundMentions.length === 0) return resultMap;

    const sourceChannelIds = Array.from(new Set(inboundMentions.map(m => m.sourceChannelId)));
    const snapshots = await prisma.snapshot.findMany({
      where: { channelId: { in: sourceChannelIds } },
      orderBy: { collectedAt: 'desc' },
      distinct: ['channelId'],
      select: { channelId: true, membersCount: true }
    });

    const subsMap = new Map<number, number>();
    for (const s of snapshots) {
      subsMap.set(s.channelId, s.membersCount);
    }

    // Fallback: if any citing channels don't have snapshots yet, check subscribersAtPublish on their posts
    const missingSourceIds = sourceChannelIds.filter(id => !subsMap.has(id));
    if (missingSourceIds.length > 0) {
      const fallbackPosts = await prisma.post.findMany({
        where: {
          channelId: { in: missingSourceIds },
          subscribersAtPublish: { not: null, gt: 0 },
        },
        orderBy: { publishedAt: 'desc' },
        distinct: ['channelId'],
        select: { channelId: true, subscribersAtPublish: true }
      });
      for (const p of fallbackPosts) {
        if (p.subscribersAtPublish && !subsMap.has(p.channelId)) {
          subsMap.set(p.channelId, p.subscribersAtPublish);
        }
      }
    }

    for (const ch of channels) {
      const usernameLower = ch.username ? ch.username.replace(/^@/, '').toLowerCase() : null;
      let tgIdBigInt: bigint | null = null;
      if (ch.tgId) {
        try {
          tgIdBigInt = BigInt(ch.tgId);
        } catch {
          tgIdBigInt = null;
        }
      }

      const mentionsForCh = inboundMentions.filter(m => {
        // Exclude self-citations
        if (m.sourceChannelId === ch.id) return false;

        if (usernameLower && m.targetUsername && m.targetUsername.replace(/^@/, '').toLowerCase() === usernameLower) {
          return true;
        }
        if (tgIdBigInt && m.targetTgId && BigInt(m.targetTgId) === tgIdBigInt) {
          return true;
        }
        return false;
      });

      if (mentionsForCh.length === 0) continue;

      // Group by sourceChannelId
      const sourceCountMap = new Map<number, number>();
      for (const m of mentionsForCh) {
        sourceCountMap.set(m.sourceChannelId, (sourceCountMap.get(m.sourceChannelId) || 0) + 1);
      }

      const citations: CitationMention[] = [];
      for (const [sourceId, count] of sourceCountMap.entries()) {
        citations.push({
          mentions: count,
          citing_subscribers: subsMap.get(sourceId) || 0
        });
      }

      resultMap.set(ch.id, calculateCitationIndex(citations));
    }
  } catch {
    // Return whatever was computed or 0
  }

  return resultMap;
}
