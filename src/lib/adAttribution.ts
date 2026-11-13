import type { Channel, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { calculatePlacementPrice, estimateAdPrice } from './pricing';
import type {
  AdAttributionPlacement,
  AdCampaignSummary,
  AdPlacementDeal,
  AdPlacementFormat,
  AdPlacementStatus,
  AdPriceResult,
  ChannelAdAttribution,
} from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SNAPSHOT_TOLERANCE_MS = 6 * HOUR_MS;

export const AD_PLACEMENT_FORMATS: readonly AdPlacementFormat[] = ['1/24', '2/48', '3/72', 'native', 'eternal'];
export const AD_PLACEMENT_STATUSES: readonly AdPlacementStatus[] = ['planned', 'published', 'completed', 'cancelled'];

export function isAdPlacementFormat(value: unknown): value is AdPlacementFormat {
  return typeof value === 'string' && (AD_PLACEMENT_FORMATS as readonly string[]).includes(value);
}

export function isAdPlacementStatus(value: unknown): value is AdPlacementStatus {
  return typeof value === 'string' && (AD_PLACEMENT_STATUSES as readonly string[]).includes(value);
}

type ChannelBrief = Pick<Channel, 'id' | 'title' | 'username' | 'tgId'>;

interface SnapshotPoint {
  channelId: number;
  membersCount: number;
  collectedAt: Date;
}

interface MentionRecord {
  sourcePostId: number;
  sourceChannelId: number;
  targetUsername: string | null;
  targetTgId: bigint | null;
  sourcePost: { id: number; messageId: bigint; publishedAt: Date; views: number | null; isAd: boolean };
  sourceChannel: { id: number; title: string; username: string | null };
}

export interface StoredAdPlacementRecord {
  id: number;
  targetChannelId: number;
  donorChannelId: number;
  postId: number | null;
  priceAmount: number;
  currency: string;
  format: string;
  status: string;
  scheduledAt: Date | null;
  inviteLink: string | null;
  actualJoins: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  targetChannel: { id: number; title: string; username: string | null };
  donorChannel: { id: number; title: string; username: string | null };
  post?: { views: number | null; publishedAt: Date } | null;
}

export interface AdPlacementMetricsInput {
  priceAmount: number | null;
  postViews: number | null;
  estimatedGain: number | null;
  actualJoins: number | null;
}

export interface AdPlacementMetricsResult {
  effectiveGain: number | null;
  cpm: number | null;
  cpf: number | null;
}

export interface MatchableMentionPlacement {
  postId: number;
  publishedAt: Date;
  donorChannelId: number;
  targetChannelId: number;
}

export interface CampaignDealSummaryInput {
  donorChannelId: number;
  donorChannel?: { id: number; title: string; username: string | null };
  priceAmount: number;
  currency?: string;
  status: AdPlacementStatus | string;
  effectiveGain: number | null;
  postViews: number | null;
}

const mentionSelect = {
  sourcePostId: true,
  sourceChannelId: true,
  targetUsername: true,
  targetTgId: true,
  sourcePost: { select: { id: true, messageId: true, publishedAt: true, views: true, isAd: true } },
  sourceChannel: { select: { id: true, title: true, username: true } },
} satisfies Prisma.MentionSelect;

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function subscriberDeltaAt(
  snapshots: readonly SnapshotPoint[],
  publishedAt: Date,
  hoursAfterPost: 24 | 48,
  now: Date,
): number | null {
  const targetTime = publishedAt.getTime() + hoursAfterPost * HOUR_MS;
  if (now.getTime() < targetTime) return null;

  let baseline: SnapshotPoint | null = null;
  let after: SnapshotPoint | null = null;
  for (const snapshot of snapshots) {
    const time = snapshot.collectedAt.getTime();
    if (time <= publishedAt.getTime() && time >= publishedAt.getTime() - SNAPSHOT_TOLERANCE_MS &&
        (!baseline || time > baseline.collectedAt.getTime())) baseline = snapshot;
    if (time >= targetTime && time <= targetTime + SNAPSHOT_TOLERANCE_MS && time <= now.getTime() &&
        (!after || time < after.collectedAt.getTime())) after = snapshot;
  }
  return baseline && after ? after.membersCount - baseline.membersCount : null;
}

export function estimatedCpf(price: number | null, deltaSubscribers24h: number | null): number | null {
  return price !== null && price > 0 && deltaSubscribers24h !== null && deltaSubscribers24h > 0
    ? roundTwo(price / deltaSubscribers24h) : null;
}

export function calculateAdPlacementMetrics(input: AdPlacementMetricsInput): AdPlacementMetricsResult {
  const effectiveGain = input.actualJoins !== null && input.actualJoins !== undefined
    ? input.actualJoins
    : input.estimatedGain;
  const validPrice = input.priceAmount !== null && Number.isFinite(input.priceAmount) && input.priceAmount >= 0
    ? input.priceAmount
    : null;
  const cpm = validPrice !== null && input.postViews !== null && Number.isFinite(input.postViews) && input.postViews > 0
    ? roundTwo((validPrice / input.postViews) * 1000)
    : null;
  const cpf = validPrice !== null && effectiveGain !== null && Number.isFinite(effectiveGain) && effectiveGain > 0
    ? roundTwo(validPrice / effectiveGain)
    : null;
  return { effectiveGain, cpm, cpf };
}

export function matchPlacementDeal<T extends {
  id: number;
  postId: number | null;
  donorChannelId: number;
  targetChannelId: number;
  scheduledAt: Date | null;
  status: string;
}>(
  mention: MatchableMentionPlacement,
  deals: readonly T[],
  usedDealIds?: ReadonlySet<number>,
): T | null {
  const available = usedDealIds ? deals.filter(deal => !usedDealIds.has(deal.id)) : deals;
  const byPost = available.filter(
    deal => deal.postId === mention.postId
      && deal.donorChannelId === mention.donorChannelId
      && deal.targetChannelId === mention.targetChannelId,
  );
  if (byPost.length > 0) {
    const active = byPost.find(deal => deal.status !== 'cancelled');
    return active ?? byPost[0];
  }

  const mentionTime = mention.publishedAt.getTime();
  const byWindow = available
    .filter(deal => deal.postId === null
      && deal.status !== 'cancelled'
      && deal.donorChannelId === mention.donorChannelId
      && deal.targetChannelId === mention.targetChannelId
      && deal.scheduledAt !== null)
    .map(deal => ({ deal, diffMs: Math.abs(mentionTime - deal.scheduledAt!.getTime()) }))
    .filter(item => item.diffMs <= DAY_MS)
    .sort((left, right) => left.diffMs - right.diffMs || left.deal.id - right.deal.id);

  return byWindow.length > 0 ? byWindow[0].deal : null;
}

export function serializeAdPlacementDeal(
  record: StoredAdPlacementRecord,
  context: { postViews: number | null; estimatedGain: number | null },
): AdPlacementDeal {
  const format: AdPlacementFormat = isAdPlacementFormat(record.format) ? record.format : '1/24';
  const status: AdPlacementStatus = isAdPlacementStatus(record.status) ? record.status : 'planned';
  const metrics = calculateAdPlacementMetrics({
    priceAmount: record.priceAmount,
    postViews: context.postViews ?? record.post?.views ?? null,
    estimatedGain: context.estimatedGain,
    actualJoins: record.actualJoins,
  });

  return {
    id: record.id,
    targetChannelId: record.targetChannelId,
    donorChannelId: record.donorChannelId,
    targetChannel: record.targetChannel,
    donorChannel: record.donorChannel,
    postId: record.postId,
    priceAmount: record.priceAmount,
    currency: record.currency || 'UAH',
    format,
    status,
    scheduledAt: record.scheduledAt ? record.scheduledAt.toISOString() : null,
    inviteLink: record.inviteLink,
    actualJoins: record.actualJoins,
    notes: record.notes,
    effectiveGain: metrics.effectiveGain,
    factualCpm: metrics.cpm,
    factualCpf: metrics.cpf,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function summarizeAdCampaigns(
  deals: readonly CampaignDealSummaryInput[],
  defaultCurrency = 'UAH',
): AdCampaignSummary {
  const activeDeals = deals.filter(deal => deal.status !== 'cancelled');
  let totalSpent = 0;
  let activeDealsCount = 0;
  let totalGainedSubscribers = 0;
  let spentWithPositiveGain = 0;
  let positiveGainTotal = 0;
  let spentWithViews = 0;
  let totalViewsWithPrice = 0;

  const byDonor = new Map<number, {
    channelId: number;
    title: string;
    username: string | null;
    spent: number;
    gainedSubscribers: number;
  }>();

  for (const deal of activeDeals) {
    totalSpent += deal.priceAmount;
    if (deal.status === 'planned' || deal.status === 'published') {
      activeDealsCount += 1;
    }
    if (deal.effectiveGain !== null && Number.isFinite(deal.effectiveGain)) {
      totalGainedSubscribers += deal.effectiveGain;
      if (deal.effectiveGain > 0) {
        spentWithPositiveGain += deal.priceAmount;
        positiveGainTotal += deal.effectiveGain;

        const existing = byDonor.get(deal.donorChannelId) ?? {
          channelId: deal.donorChannelId,
          title: deal.donorChannel?.title ?? `Канал #${deal.donorChannelId}`,
          username: deal.donorChannel?.username ?? null,
          spent: 0,
          gainedSubscribers: 0,
        };
        existing.spent += deal.priceAmount;
        existing.gainedSubscribers += deal.effectiveGain;
        byDonor.set(deal.donorChannelId, existing);
      }
    }
    if (deal.postViews !== null && Number.isFinite(deal.postViews) && deal.postViews > 0) {
      spentWithViews += deal.priceAmount;
      totalViewsWithPrice += deal.postViews;
    }
  }

  let bestDonor: AdCampaignSummary['bestDonor'] = null;
  for (const donor of byDonor.values()) {
    if (donor.gainedSubscribers <= 0) continue;
    const cpf = roundTwo(donor.spent / donor.gainedSubscribers);
    if (
      !bestDonor
      || cpf < bestDonor.cpf
      || (cpf === bestDonor.cpf && donor.gainedSubscribers > bestDonor.gainedSubscribers)
      || (cpf === bestDonor.cpf && donor.gainedSubscribers === bestDonor.gainedSubscribers && donor.channelId < bestDonor.channelId)
    ) {
      bestDonor = {
        channelId: donor.channelId,
        title: donor.title,
        username: donor.username,
        cpf,
        gainedSubscribers: donor.gainedSubscribers,
        spent: roundTwo(donor.spent),
      };
    }
  }

  return {
    dealsCount: activeDeals.length,
    activeDealsCount,
    totalSpent: roundTwo(totalSpent),
    currency: activeDeals.find(deal => deal.currency)?.currency ?? defaultCurrency,
    totalGainedSubscribers,
    avgCpf: positiveGainTotal > 0 ? roundTwo(spentWithPositiveGain / positiveGainTotal) : null,
    avgCpm: totalViewsWithPrice > 0 ? roundTwo((spentWithViews / totalViewsWithPrice) * 1000) : null,
    bestDonor,
  };
}

export function hasOverlappingCampaign(
  postId: number,
  publishedAt: Date,
  campaigns: readonly { postId: number; publishedAt: Date }[],
): boolean {
  return campaigns.some(other => other.postId !== postId &&
    Math.abs(other.publishedAt.getTime() - publishedAt.getTime()) < DAY_MS);
}

async function getAccessibleChannels(userId: number | null): Promise<ChannelBrief[]> {
  const select = { id: true, title: true, username: true, tgId: true } as const;
  if (userId === null) return prisma.channel.findMany({ where: { isActive: true }, select });
  const subscriptions = await prisma.userChannel.findMany({
    where: { userId, isActive: true, channel: { isActive: true } },
    select: { channel: { select } },
  });
  return subscriptions.map(subscription => subscription.channel);
}

function targetForMention(
  mention: Pick<MentionRecord, 'targetUsername' | 'targetTgId'>,
  byUsername: ReadonlyMap<string, ChannelBrief>,
  byTgId: ReadonlyMap<string, ChannelBrief>,
): ChannelBrief | null {
  const byId = mention.targetTgId ? byTgId.get(mention.targetTgId.toString()) : undefined;
  const byName = mention.targetUsername ? byUsername.get(mention.targetUsername.replace(/^@/, '').toLowerCase()) : undefined;
  if (byId && byName && byId.id !== byName.id) return null;
  return byId ?? byName ?? null;
}

export async function getChannelAdAttribution(
  channelId: number,
  periodDays = 30,
  userId: number | null = null,
  now: Date = new Date(),
): Promise<ChannelAdAttribution | null> {
  if (!Number.isSafeInteger(channelId) || channelId <= 0 ||
      !Number.isInteger(periodDays) || periodDays < 1 || periodDays > 90) {
    throw new RangeError('Invalid channel or period');
  }
  const accessible = await getAccessibleChannels(userId);
  const current = accessible.find(channel => channel.id === channelId);
  if (!current) return null;

  const accessibleIds = accessible.map(channel => channel.id);
  const byUsername = new Map(accessible.flatMap(channel => channel.username
    ? [[channel.username.replace(/^@/, '').toLowerCase(), channel] as const] : []));
  const byTgId = new Map(accessible.flatMap(channel => channel.tgId
    ? [[channel.tgId.toString(), channel] as const] : []));
  const since = new Date(now.getTime() - periodDays * DAY_MS);
  const targetConditions: Prisma.MentionWhereInput[] = [];
  if (current.username) targetConditions.push({ targetUsername: current.username.replace(/^@/, '').toLowerCase() });
  if (current.tgId) targetConditions.push({ targetTgId: current.tgId });

  const mentions: MentionRecord[] = await prisma.mention.findMany({
    where: {
      sourceChannelId: { in: accessibleIds },
      sourcePost: { publishedAt: { gte: since, lte: now } },
      OR: [{ sourceChannelId: channelId }, ...targetConditions],
    },
    select: mentionSelect,
  });

  const inbound = new Map<string, { mention: MentionRecord; target: ChannelBrief }>();
  const outbound = new Map<string, { mention: MentionRecord; target: ChannelBrief }>();
  for (const mention of mentions) {
    const target = targetForMention(mention, byUsername, byTgId);
    if (!target || target.id === mention.sourceChannelId) continue;
    const key = `${mention.sourcePostId}:${target.id}`;
    if (target.id === channelId) inbound.set(key, { mention, target });
    if (mention.sourceChannelId === channelId && mention.sourcePost.isAd) outbound.set(key, { mention, target });
  }

  const targets = new Map<number, ChannelBrief>([[current.id, current]]);
  for (const { target } of outbound.values()) targets.set(target.id, target);
  const allTargetConditions: Prisma.MentionWhereInput[] = [];
  for (const target of targets.values()) {
    if (target.username) allTargetConditions.push({ targetUsername: target.username.replace(/^@/, '').toLowerCase() });
    if (target.tgId) allTargetConditions.push({ targetTgId: target.tgId });
  }
  const overlapMentions: MentionRecord[] = allTargetConditions.length > 0
    ? await prisma.mention.findMany({
      where: {
        sourceChannelId: { in: accessibleIds },
        sourcePost: { isAd: true, publishedAt: { gte: new Date(since.getTime() - DAY_MS), lte: now } },
        OR: allTargetConditions,
      },
      select: mentionSelect,
    }) : [];

  const campaignsByTarget = new Map<number, Array<{ postId: number; publishedAt: Date }>>();
  const seenCampaigns = new Set<string>();
  for (const mention of overlapMentions) {
    const target = targetForMention(mention, byUsername, byTgId);
    if (!target || !targets.has(target.id) || target.id === mention.sourceChannelId) continue;
    const key = `${target.id}:${mention.sourcePostId}`;
    if (seenCampaigns.has(key)) continue;
    seenCampaigns.add(key);
    const list = campaignsByTarget.get(target.id) ?? [];
    list.push({ postId: mention.sourcePostId, publishedAt: mention.sourcePost.publishedAt });
    campaignsByTarget.set(target.id, list);
  }

  const snapshots = await prisma.snapshot.findMany({
    where: {
      channelId: { in: [...targets.keys()] },
      collectedAt: { gte: new Date(since.getTime() - SNAPSHOT_TOLERANCE_MS), lte: now },
    },
    select: { channelId: true, membersCount: true, collectedAt: true },
    orderBy: { collectedAt: 'asc' },
  });
  const snapshotsByChannel = new Map<number, SnapshotPoint[]>();
  for (const snapshot of snapshots) {
    const list = snapshotsByChannel.get(snapshot.channelId) ?? [];
    list.push(snapshot);
    snapshotsByChannel.set(snapshot.channelId, list);
  }

  const donorIds = [...new Set([
    ...[...inbound.values()].filter(item => item.mention.sourcePost.isAd).map(item => item.mention.sourceChannelId),
    ...(outbound.size > 0 ? [channelId] : []),
  ])];
  const prices = new Map<number, AdPriceResult | null>();
  for (let index = 0; index < donorIds.length; index += 4) {
    const batch = await Promise.all(donorIds.slice(index, index + 4).map(async donorId => ({
      donorId,
      price: await estimateAdPrice(donorId, userId),
    })));
    for (const item of batch) prices.set(item.donorId, item.price);
  }

  const storedDeals: StoredAdPlacementRecord[] = typeof prisma.adPlacement?.findMany === 'function'
    ? await prisma.adPlacement.findMany({
      where: {
        userId,
        targetChannelId: { in: accessibleIds },
        donorChannelId: { in: accessibleIds },
        OR: [{ targetChannelId: channelId }, { donorChannelId: channelId }],
      },
      include: {
        targetChannel: { select: { id: true, title: true, username: true } },
        donorChannel: { select: { id: true, title: true, username: true } },
        post: { select: { views: true, publishedAt: true } },
      },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    })
    : [];

  const matchedInboundDealIds = new Set<number>();
  const matchedOutboundDealIds = new Set<number>();
  const summaryInputs: CampaignDealSummaryInput[] = [];

  const toPlacement = (
    { mention, target }: { mention: MentionRecord; target: ChannelBrief },
    isOutbound: boolean,
  ): AdAttributionPlacement => {
    const publishedAt = mention.sourcePost.publishedAt;
    const channelSnapshots = snapshotsByChannel.get(target.id) ?? [];
    const deltaSubscribers24h = subscriberDeltaAt(channelSnapshots, publishedAt, 24, now);
    const deltaSubscribers48h = subscriberDeltaAt(channelSnapshots, publishedAt, 48, now);
    const views = mention.sourcePost.views;
    const priceData = mention.sourcePost.isAd ? prices.get(mention.sourceChannelId) ?? null : null;
    const resolvedPrice = priceData ? calculatePlacementPrice(views, priceData.cpm, priceData,
      priceData.priceSource === 'niche_estimate' ? priceData.estimatedPricePerPost : undefined) : null;
    const price = resolvedPrice?.price ?? null;

    const usedIds = isOutbound ? matchedOutboundDealIds : matchedInboundDealIds;
    const matchedRecord = matchPlacementDeal(
      {
        postId: mention.sourcePostId,
        publishedAt,
        donorChannelId: mention.sourceChannelId,
        targetChannelId: target.id,
      },
      storedDeals,
      usedIds,
    );
    if (matchedRecord) {
      usedIds.add(matchedRecord.id);
    }

    const estimatedGain = deltaSubscribers24h ?? deltaSubscribers48h;
    const deal = matchedRecord
      ? serializeAdPlacementDeal(matchedRecord, { postViews: views, estimatedGain })
      : null;

    if (deal && !isOutbound) {
      summaryInputs.push({
        donorChannelId: deal.donorChannelId,
        donorChannel: deal.donorChannel,
        priceAmount: deal.priceAmount,
        currency: deal.currency,
        status: deal.status,
        effectiveGain: deal.effectiveGain,
        postViews: views,
      });
    }

    return {
      postId: mention.sourcePostId,
      messageId: mention.sourcePost.messageId.toString(),
      publishedAt: publishedAt.toISOString(),
      sourceChannel: mention.sourceChannel,
      targetChannel: { id: target.id, title: target.title, username: target.username },
      isAd: mention.sourcePost.isAd,
      views,
      deltaSubscribers24h,
      deltaSubscribers48h,
      estimatedPricePerPost: price,
      priceSource: resolvedPrice?.source ?? null,
      estimatedCpf: estimatedCpf(price, deltaSubscribers24h),
      conversionPercent: isOutbound && deltaSubscribers24h !== null && deltaSubscribers24h > 0 && views !== null && views > 0
        ? roundTwo((deltaSubscribers24h / views) * 100) : null,
      overlappingCampaigns: mention.sourcePost.isAd && hasOverlappingCampaign(
        mention.sourcePostId, publishedAt, campaignsByTarget.get(target.id) ?? [],
      ),
      deal,
    };
  };

  const newestFirst = (left: AdAttributionPlacement, right: AdAttributionPlacement) =>
    right.publishedAt.localeCompare(left.publishedAt) || right.postId - left.postId;

  const sortPrioritized = (items: Array<{ mention: MentionRecord; target: ChannelBrief }>) =>
    [...items].sort((left, right) =>
      Number(right.mention.sourcePost.isAd) - Number(left.mention.sourcePost.isAd)
      || right.mention.sourcePost.publishedAt.getTime() - left.mention.sourcePost.publishedAt.getTime()
      || right.mention.sourcePostId - left.mention.sourcePostId);

  const inboundPlacements = sortPrioritized([...inbound.values()])
    .map(item => toPlacement(item, false))
    .sort(newestFirst);
  const outboundPlacements = sortPrioritized([...outbound.values()])
    .map(item => toPlacement(item, true))
    .sort(newestFirst);

  const targetSnapshots = snapshotsByChannel.get(channelId) ?? [];
  const manualPlacements: AdPlacementDeal[] = [];
  for (const record of storedDeals) {
    if (record.targetChannelId !== channelId || matchedInboundDealIds.has(record.id)) continue;
    const referenceTime = record.post?.publishedAt ?? record.scheduledAt;
    const withinPeriod = !referenceTime || referenceTime.getTime() >= since.getTime();
    const isPlanned = record.status === 'planned';
    if (!withinPeriod && !isPlanned) continue;

    const estimatedGain = referenceTime && record.status !== 'cancelled'
      ? (subscriberDeltaAt(targetSnapshots, referenceTime, 24, now)
        ?? subscriberDeltaAt(targetSnapshots, referenceTime, 48, now))
      : null;
    const postViews = record.post?.views ?? null;
    const serialized = serializeAdPlacementDeal(record, { postViews, estimatedGain });
    manualPlacements.push(serialized);
    summaryInputs.push({
      donorChannelId: serialized.donorChannelId,
      donorChannel: serialized.donorChannel,
      priceAmount: serialized.priceAmount,
      currency: serialized.currency,
      status: serialized.status,
      effectiveGain: serialized.effectiveGain,
      postViews,
    });
  }

  return {
    periodDays,
    inbound: inboundPlacements,
    outbound: outboundPlacements,
    manualPlacements,
    summary: summarizeAdCampaigns(summaryInputs),
    accessibleChannels: accessible
      .filter(channel => channel.id !== channelId)
      .map(({ id, title, username }) => ({ id, title, username }))
      .sort((left, right) => left.title.localeCompare(right.title, 'ru')),
  };
}
