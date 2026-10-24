import type { Channel, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { estimateAdPrice } from './pricing';
import type { AdAttributionPlacement, ChannelAdAttribution } from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SNAPSHOT_TOLERANCE_MS = 6 * HOUR_MS;

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
  const prices = new Map<number, number | null>();
  for (let index = 0; index < donorIds.length; index += 4) {
    const batch = await Promise.all(donorIds.slice(index, index + 4).map(async donorId => ({
      donorId,
      price: (await estimateAdPrice(donorId))?.estimatedPricePerPost ?? null,
    })));
    for (const item of batch) prices.set(item.donorId, item.price);
  }

  const toPlacement = ({ mention, target }: { mention: MentionRecord; target: ChannelBrief }, isOutbound: boolean): AdAttributionPlacement => {
    const publishedAt = mention.sourcePost.publishedAt;
    const channelSnapshots = snapshotsByChannel.get(target.id) ?? [];
    const deltaSubscribers24h = subscriberDeltaAt(channelSnapshots, publishedAt, 24, now);
    const deltaSubscribers48h = subscriberDeltaAt(channelSnapshots, publishedAt, 48, now);
    const price = mention.sourcePost.isAd ? prices.get(mention.sourceChannelId) ?? null : null;
    const views = mention.sourcePost.views;
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
      estimatedCpf: estimatedCpf(price, deltaSubscribers24h),
      conversionPercent: isOutbound && deltaSubscribers24h !== null && deltaSubscribers24h > 0 && views !== null && views > 0
        ? roundTwo((deltaSubscribers24h / views) * 100) : null,
      overlappingCampaigns: mention.sourcePost.isAd && hasOverlappingCampaign(
        mention.sourcePostId, publishedAt, campaignsByTarget.get(target.id) ?? [],
      ),
    };
  };
  const newestFirst = (left: AdAttributionPlacement, right: AdAttributionPlacement) =>
    right.publishedAt.localeCompare(left.publishedAt) || right.postId - left.postId;
  return {
    periodDays,
    inbound: [...inbound.values()].map(item => toPlacement(item, false)).sort(newestFirst),
    outbound: [...outbound.values()].map(item => toPlacement(item, true)).sort(newestFirst),
  };
}
