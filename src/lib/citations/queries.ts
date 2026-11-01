import type { Prisma, PrismaClient } from '@prisma/client';
import type { CitationMention } from './types';
import { calculateCitationIndex } from './calculate';

function getUsernameVariants(username: string): string[] {
  const raw = username.replace(/^@/, '');
  const clean = raw.toLowerCase();
  return Array.from(new Set([clean, `@${clean}`, raw, `@${raw}`]));
}

function parseBigIntSafe(val: bigint | string | number | null | undefined): bigint | null {
  if (val === null || val === undefined || val === '') return null;
  try {
    return BigInt(val);
  } catch {
    return null;
  }
}

async function resolveCitingSubscribersMap(
  prisma: PrismaClient,
  sourceChannelIds: number[]
): Promise<Map<number, number>> {
  const subsMap = new Map<number, number>();
  if (sourceChannelIds.length === 0) return subsMap;

  const snapshots = await prisma.snapshot.findMany({
    where: { channelId: { in: sourceChannelIds } },
    orderBy: { collectedAt: 'desc' },
    distinct: ['channelId'],
    select: { channelId: true, membersCount: true },
  });

  for (const s of snapshots) {
    subsMap.set(s.channelId, s.membersCount);
  }

  // Fallback: if any citing channels don't have snapshots yet, check subscribersAtPublish on their posts
  const missingSourceIds = sourceChannelIds.filter((id) => !subsMap.has(id));
  if (missingSourceIds.length > 0) {
    const fallbackPosts = await prisma.post.findMany({
      where: {
        channelId: { in: missingSourceIds },
        subscribersAtPublish: { not: null, gt: 0 },
      },
      orderBy: { publishedAt: 'desc' },
      distinct: ['channelId'],
      select: { channelId: true, subscribersAtPublish: true },
    });
    for (const p of fallbackPosts) {
      if (p.subscribersAtPublish && !subsMap.has(p.channelId)) {
        subsMap.set(p.channelId, p.subscribersAtPublish);
      }
    }
  }

  return subsMap;
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
  const orConditions: Prisma.MentionWhereInput[] = [];
  if (channel.username) {
    orConditions.push({ targetUsername: { in: getUsernameVariants(channel.username) } });
  }
  const tgId = parseBigIntSafe(channel.tgId);
  if (tgId !== null) {
    orConditions.push({ targetTgId: tgId });
  }

  if (orConditions.length === 0) return 0;

  try {
    const { prisma } = await import('../prisma');

    const inboundRaw = await prisma.mention.groupBy({
      by: ['sourceChannelId'],
      where: {
        OR: orConditions,
        createdAt: { gte: dateLimit },
        sourceChannelId: { not: channel.id }, // Exclude self-citations
      },
      _count: { id: true },
    });

    if (inboundRaw.length === 0) return 0;

    const sourceChannelIds = Array.from(new Set(inboundRaw.map((i) => i.sourceChannelId)));
    const subsMap = await resolveCitingSubscribersMap(prisma, sourceChannelIds);

    const citations: CitationMention[] = inboundRaw.map((item) => ({
      mentions: item._count.id,
      citing_subscribers: subsMap.get(item.sourceChannelId) || 0,
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
    const { prisma } = await import('../prisma');

    const targetUsernames: string[] = [];
    const targetTgIds: bigint[] = [];

    for (const ch of channels) {
      if (ch.username) {
        targetUsernames.push(...getUsernameVariants(ch.username));
      }
      const tgId = parseBigIntSafe(ch.tgId);
      if (tgId !== null) {
        targetTgIds.push(tgId);
      }
    }

    const uniqueUsernames = Array.from(new Set(targetUsernames));
    const uniqueTgIds = Array.from(new Set(targetTgIds));

    if (uniqueUsernames.length === 0 && uniqueTgIds.length === 0) {
      return resultMap;
    }

    const orClauses: Prisma.MentionWhereInput[] = [];
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
      },
    });

    if (inboundMentions.length === 0) return resultMap;

    const sourceChannelIds = Array.from(new Set(inboundMentions.map((m) => m.sourceChannelId)));
    const subsMap = await resolveCitingSubscribersMap(prisma, sourceChannelIds);

    for (const ch of channels) {
      const usernameLower = ch.username ? ch.username.replace(/^@/, '').toLowerCase() : null;
      const tgIdBigInt = parseBigIntSafe(ch.tgId);

      const mentionsForCh = inboundMentions.filter((m) => {
        // Exclude self-citations
        if (m.sourceChannelId === ch.id) return false;

        if (usernameLower && m.targetUsername && m.targetUsername.replace(/^@/, '').toLowerCase() === usernameLower) {
          return true;
        }
        if (tgIdBigInt !== null && m.targetTgId !== null && BigInt(m.targetTgId) === tgIdBigInt) {
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
          citing_subscribers: subsMap.get(sourceId) || 0,
        });
      }

      resultMap.set(ch.id, calculateCitationIndex(citations));
    }
  } catch {
    // Return whatever was computed or 0
  }

  return resultMap;
}
