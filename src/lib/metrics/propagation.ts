import { prisma } from '../prisma';
import type { OriginRole, PropagationChain, PropagationChannel, PropagationData, TopCitedPost } from '../types';

const DAY_MS = 86_400_000;

export interface TrackedPropagationChannel extends Omit<PropagationChannel, 'tgId'> {
  tgId: bigint | null;
}

export interface PropagationMention {
  sourcePostId: number;
  sourceChannelId: number;
  targetUsername: string | null;
  targetTgId: bigint | null;
  targetMessageId: bigint | null;
  type: string;
  sourcePost: { messageId: bigint; publishedAt: Date; text: string | null };
}

export interface OriginPost {
  id: number;
  channelId: number;
  messageId: bigint;
  publishedAt: Date;
  text: string | null;
}

interface DonorSummary {
  channel: TrackedPropagationChannel;
  count: number;
  delays: number[];
}

interface PostSummary {
  post: OriginPost;
  citationsCount: number;
  delays: number[];
  donors: Map<number, DonorSummary>;
}

function username(value: string | null): string | null {
  const normalized = value?.trim().replace(/^@/, '').toLowerCase();
  return normalized && /^[a-z0-9_]+$/.test(normalized) ? normalized : null;
}

function messageId(value: string): bigint | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? BigInt(number) : null;
}

export function linkedMessageIds(text: string | null): bigint[] {
  const ids: bigint[] = [];
  for (const match of (text ?? '').matchAll(/(?:t\.me\/|telegram\.me\/)([a-z0-9_]+)\/(\d+)/gi)) {
    const id = messageId(match[2]);
    if (id !== null) ids.push(id);
  }
  return ids;
}

function linkedMessageId(text: string | null, targetUsername: string | null): bigint | null {
  if (!targetUsername) return null;
  for (const match of (text ?? '').matchAll(/(?:t\.me\/|telegram\.me\/)([a-z0-9_]+)\/(\d+)/gi)) {
    if (username(match[1]) === targetUsername) return messageId(match[2]);
  }
  return null;
}

export function calculateOriginProfile(incomingCount: number, outgoingCount: number): {
  role: OriginRole; originRatio: number | null;
} {
  const total = incomingCount + outgoingCount;
  const originRatio = outgoingCount > 0 ? Number((incomingCount / outgoingCount).toFixed(2)) : null;
  if (total < 3) return { role: 'isolated', originRatio };
  if (outgoingCount === 0 || incomingCount >= 2 * outgoingCount) return { role: 'origin', originRatio };
  if (incomingCount === 0 || outgoingCount >= 2 * incomingCount) return { role: 'distributor', originRatio };
  return { role: 'balanced', originRatio };
}

function average(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function analyzePropagation(
  channels: readonly TrackedPropagationChannel[],
  mentions: readonly PropagationMention[],
  originPosts: readonly OriginPost[],
  focalChannelId: number,
  now: Date = new Date(),
): PropagationData {
  const byId = new Map(channels.map(channel => [channel.id, channel]));
  if (!byId.has(focalChannelId)) throw new RangeError('Focal channel is outside the selected channels');
  const byUsername = new Map(channels.flatMap(channel => {
    const name = username(channel.username);
    return name ? [[name, channel] as const] : [];
  }));
  const byTgId = new Map(channels.flatMap(channel => channel.tgId
    ? [[channel.tgId.toString(), channel] as const] : []));
  const postByKey = new Map(originPosts.filter(post => byId.has(post.channelId))
    .map(post => [`${post.channelId}:${post.messageId}`, post] as const));
  const since = now.getTime() - 30 * DAY_MS;
  const resolved = new Map<string, { mention: PropagationMention; source: TrackedPropagationChannel;
    target: TrackedPropagationChannel; targetMessageId: bigint | null }>();

  for (const mention of mentions) {
    const source = byId.get(mention.sourceChannelId);
    const targetName = username(mention.targetUsername);
    const byName = targetName ? byUsername.get(targetName) : undefined;
    const byTelegramId = mention.targetTgId ? byTgId.get(mention.targetTgId.toString()) : undefined;
    if (byName && byTelegramId && byName.id !== byTelegramId.id) continue;
    const target = byTelegramId ?? byName;
    const published = mention.sourcePost.publishedAt.getTime();
    if (!source || !target || source.id === target.id ||
        (mention.type !== 'forward' && mention.type !== 'mention') ||
        !Number.isFinite(published) || published < since || published > now.getTime()) continue;
    const targetMessageId = mention.targetMessageId ??
      linkedMessageId(mention.sourcePost.text, username(target.username));
    const key = `${mention.sourcePostId}:${target.id}`;
    const previous = resolved.get(key);
    if (!previous || (previous.targetMessageId === null && targetMessageId !== null) ||
        (previous.targetMessageId === null && mention.type === 'forward' && previous.mention.type !== 'forward')) {
      resolved.set(key, { mention, source, target, targetMessageId });
    }
  }

  const records = [...resolved.values()];
  const incomingCount = records.filter(record => record.target.id === focalChannelId).length;
  const outgoingCount = records.filter(record => record.source.id === focalChannelId).length;
  const profile = calculateOriginProfile(incomingCount, outgoingCount);
  const incomingDelays: number[] = [];
  const groupedPosts = new Map<number, PostSummary>();
  const recentChains: PropagationChain[] = [];

  for (const record of records) {
    if (record.source.id !== focalChannelId && record.target.id !== focalChannelId) continue;
    const original = record.targetMessageId === null ? null :
      postByKey.get(`${record.target.id}:${record.targetMessageId}`) ?? null;
    const elapsed = original ? record.mention.sourcePost.publishedAt.getTime() - original.publishedAt.getTime() : -1;
    const delayMinutes = elapsed >= 0 ? Math.round(elapsed / 60_000) : null;
    recentChains.push({
      source: { id: record.source.id, title: record.source.title, username: record.source.username,
        tgId: record.source.tgId?.toString() ?? null },
      target: { id: record.target.id, title: record.target.title, username: record.target.username,
        tgId: record.target.tgId?.toString() ?? null },
      type: record.mention.type === 'forward' ? 'forward' : 'mention',
      citingMessageId: record.mention.sourcePost.messageId.toString(),
      publishedAt: record.mention.sourcePost.publishedAt.toISOString(),
      originPostId: delayMinutes === null ? null : original?.id ?? null,
      delayMinutes,
    });
    if (record.target.id !== focalChannelId || !original || delayMinutes === null) continue;
    incomingDelays.push(delayMinutes);
    const group: PostSummary = groupedPosts.get(original.id) ?? { post: original, citationsCount: 0,
      delays: [], donors: new Map() };
    group.citationsCount++;
    group.delays.push(delayMinutes);
    const donor: DonorSummary = group.donors.get(record.source.id) ?? { channel: record.source, count: 0, delays: [] };
    donor.count++;
    donor.delays.push(delayMinutes);
    group.donors.set(record.source.id, donor);
    groupedPosts.set(original.id, group);
  }

  const topCitedPosts: TopCitedPost[] = [...groupedPosts.values()].map(group => ({
    id: group.post.id,
    messageId: group.post.messageId.toString(),
    publishedAt: group.post.publishedAt.toISOString(),
    textSnippet: group.post.text?.slice(0, 160) ?? null,
    citationsCount: group.citationsCount,
    averageDelayMinutes: average(group.delays),
    citingChannels: [...group.donors.values()].map(donor => ({
      id: donor.channel.id, title: donor.channel.title, username: donor.channel.username,
      citationsCount: donor.count, averageDelayMinutes: average(donor.delays),
    })).sort((left, right) => right.citationsCount - left.citationsCount || left.title.localeCompare(right.title)),
  })).sort((left, right) => right.citationsCount - left.citationsCount ||
    right.publishedAt.localeCompare(left.publishedAt)).slice(0, 5);

  return {
    periodDays: 30,
    focalTgId: byId.get(focalChannelId)?.tgId?.toString() ?? null,
    ...profile,
    incomingCount,
    outgoingCount,
    averageIncomingDelayMinutes: average(incomingDelays),
    topCitedPosts,
    recentChains: recentChains.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)).slice(0, 10),
  };
}

export async function getPropagationForChannel(
  channelIds: number[],
  focalChannelId: number,
  now: Date = new Date(),
): Promise<PropagationData> {
  const allowedIds = [...new Set(channelIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!allowedIds.includes(focalChannelId)) throw new RangeError('Focal channel is outside the selected channels');
  const [channels, mentions] = await Promise.all([
    prisma.channel.findMany({ where: { id: { in: allowedIds }, isActive: true },
      select: { id: true, title: true, username: true, tgId: true } }),
    prisma.mention.findMany({
      where: { sourceChannelId: { in: allowedIds },
        sourcePost: { channelId: { in: allowedIds },
          publishedAt: { gte: new Date(now.getTime() - 30 * DAY_MS), lte: now } } },
      select: { sourcePostId: true, sourceChannelId: true, targetUsername: true,
        targetTgId: true, targetMessageId: true, type: true,
        sourcePost: { select: { messageId: true, publishedAt: true, text: true } } },
    }),
  ]);
  const messageIds = [...new Set(mentions.flatMap(mention => [
    ...(mention.targetMessageId === null ? [] : [mention.targetMessageId]),
    ...linkedMessageIds(mention.sourcePost.text),
  ]).map(id => id.toString()))].map(BigInt);
  const originPosts = messageIds.length === 0 ? [] : await prisma.post.findMany({
    where: { channelId: { in: allowedIds }, messageId: { in: messageIds } },
    select: { id: true, channelId: true, messageId: true, publishedAt: true, text: true },
  });
  return analyzePropagation(channels, mentions, originPosts, focalChannelId, now);
}
