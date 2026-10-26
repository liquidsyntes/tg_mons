import { prisma } from '../prisma';
import { calculatePlacementPrice, getNicheCpm, type PriceOverrides } from '../pricing';
import type { TopAdvertiser, TopAdvertisersResponse } from '../types';

export interface AdvertiserChannel extends PriceOverrides {
  id: number;
  title: string;
  username: string | null;
  niche: string;
}

export interface AdvertiserMention {
  sourcePostId: number;
  sourceChannelId: number;
  targetUsername: string | null;
  sourcePost: { publishedAt: Date; views: number | null };
}

function normalizedUsername(value: string | null): string | null {
  const username = value?.trim().replace(/^@/, '').toLowerCase();
  return username && /^[a-z0-9_]{4,}$/.test(username) ? username : null;
}

export function aggregateAdvertisers(
  mentions: readonly AdvertiserMention[],
  donorChannels: readonly AdvertiserChannel[],
  trackedChannels: readonly Pick<AdvertiserChannel, 'id' | 'username'>[],
): TopAdvertiser[] {
  const donors = new Map(donorChannels.map(channel => [channel.id, channel]));
  const tracked = new Map(trackedChannels.flatMap(channel => {
    const username = normalizedUsername(channel.username);
    return username ? [[username, channel] as const] : [];
  }));
  const groups = new Map<string, {
    posts: Set<number>; donors: Map<number, { channel: AdvertiserChannel; posts: Set<number> }>;
    totalViews: number; knownViews: number; estimatedSpend: number; knownPrices: number;
    firstSeenAt: Date; lastSeenAt: Date;
  }>();

  for (const mention of mentions) {
    const username = normalizedUsername(mention.targetUsername);
    const donor = donors.get(mention.sourceChannelId);
    if (!username || !donor || normalizedUsername(donor.username) === username ||
        tracked.get(username)?.id === donor.id) continue;
    const { publishedAt, views } = mention.sourcePost;
    if (!Number.isFinite(publishedAt.getTime())) continue;
    let group = groups.get(username);
    if (!group) {
      group = { posts: new Set(), donors: new Map(), totalViews: 0, knownViews: 0,
        estimatedSpend: 0, knownPrices: 0, firstSeenAt: publishedAt, lastSeenAt: publishedAt };
      groups.set(username, group);
    }
    if (group.posts.has(mention.sourcePostId)) continue;
    group.posts.add(mention.sourcePostId);
    const donorEntry = group.donors.get(donor.id) ?? { channel: donor, posts: new Set<number>() };
    donorEntry.posts.add(mention.sourcePostId);
    group.donors.set(donor.id, donorEntry);
    if (views !== null && Number.isFinite(views) && views >= 0) {
      group.totalViews += views;
      group.knownViews++;
    }
    const placementPrice = calculatePlacementPrice(views, getNicheCpm(donor.niche), donor).price;
    if (placementPrice !== null) {
      group.estimatedSpend += placementPrice;
      group.knownPrices++;
    }
    if (publishedAt < group.firstSeenAt) group.firstSeenAt = publishedAt;
    if (publishedAt > group.lastSeenAt) group.lastSeenAt = publishedAt;
  }

  return [...groups.entries()].map(([username, group]) => {
    const target = tracked.get(username);
    const donorList = [...group.donors.values()].map(({ channel, posts }) => ({
      id: channel.id, title: channel.title, username: channel.username, placementsCount: posts.size,
    })).sort((left, right) => right.placementsCount - left.placementsCount || left.title.localeCompare(right.title));
    return {
      username,
      placementsCount: group.posts.size,
      channelsCount: donorList.length,
      donorChannels: donorList,
      totalViews: group.knownViews > 0 ? group.totalViews : null,
      avgViews: group.knownViews > 0 ? Math.round(group.totalViews / group.knownViews) : null,
      estimatedSpendUah: group.knownPrices > 0 ? group.estimatedSpend : null,
      firstSeenAt: group.firstSeenAt.toISOString(),
      lastSeenAt: group.lastSeenAt.toISOString(),
      isTrackedChannel: Boolean(target),
      channelId: target?.id ?? null,
    };
  }).sort((left, right) => right.placementsCount - left.placementsCount ||
    (right.totalViews ?? -1) - (left.totalViews ?? -1) || left.username.localeCompare(right.username));
}

export async function getTopAdvertisers(
  userId: number | null,
  days: 7 | 30,
  niche: string | null,
  now: Date = new Date(),
): Promise<TopAdvertisersResponse> {
  let donors: AdvertiserChannel[];
  let tracked: Array<Pick<AdvertiserChannel, 'id' | 'username'>>;
  if (userId === null) {
    const channels = await prisma.channel.findMany({
      where: { isActive: true }, select: { id: true, title: true, username: true, niche: true },
    });
    tracked = channels;
    donors = niche ? channels.filter(channel => channel.niche === niche) : channels;
  } else {
    const subscriptions = await prisma.userChannel.findMany({
      where: { userId }, select: { isActive: true, niche: true,
        customAdPriceUah: true, customCpmUah: true,
        channel: { select: { id: true, title: true, username: true, isActive: true } } },
    });
    tracked = subscriptions.map(subscription => subscription.channel);
    donors = subscriptions.filter(subscription => subscription.isActive && subscription.channel.isActive &&
      (!niche || subscription.niche === niche)).map(subscription => ({
      id: subscription.channel.id, title: subscription.channel.title,
      username: subscription.channel.username, niche: subscription.niche,
      customAdPriceUah: subscription.customAdPriceUah,
      customCpmUah: subscription.customCpmUah,
    }));
  }
  if (donors.length === 0) return { days, niche, advertisers: [] };
  const donorIds = donors.map(channel => channel.id);
  const mentions = await prisma.mention.findMany({
    where: { sourceChannelId: { in: donorIds },
      type: 'mention', targetUsername: { not: null },
      sourcePost: { channelId: { in: donorIds }, isAd: true,
        publishedAt: { gte: new Date(now.getTime() - days * 86_400_000), lte: now } } },
    select: { sourcePostId: true, sourceChannelId: true, targetUsername: true,
      sourcePost: { select: { publishedAt: true, views: true } } },
  });
  return { days, niche, advertisers: aggregateAdvertisers(mentions, donors, tracked) };
}
