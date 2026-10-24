import type { Channel } from '@prisma/client';
import { prisma } from './prisma';
import type { CitationNetworkData, CitationNetworkEdge, CitationNetworkNode, DiscoveredHub } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXTERNAL_NODES = 30;

type TrackedChannel = Pick<Channel, 'id' | 'title' | 'username' | 'tgId' | 'niche'> & {
  subscribers: number | null;
};

export interface NetworkMention {
  sourceChannelId: number;
  targetUsername: string | null;
  targetTgId: bigint | null;
  type: string;
  publishedAt: Date;
}

function normalizeUsername(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]+$/.test(normalized) ? normalized : null;
}

export function aggregateCitationNetwork(
  channels: readonly TrackedChannel[],
  mentions: readonly NetworkMention[],
  options: { focalChannelId?: number; days?: number; now?: Date } = {},
): CitationNetworkData {
  const days = options.days ?? 30;
  const now = options.now ?? new Date();
  const graphSince = new Date(now.getTime() - days * DAY_MS);
  const hubsSince = new Date(now.getTime() - 30 * DAY_MS);
  const trackedById = new Map(channels.map(channel => [channel.id, channel]));
  const trackedByUsername = new Map(channels.flatMap(channel => {
    const username = normalizeUsername(channel.username);
    return username ? [[username, channel] as const] : [];
  }));
  const trackedByTgId = new Map(channels.flatMap(channel => channel.tgId
    ? [[channel.tgId.toString(), channel] as const] : []));

  const resolveTarget = (mention: NetworkMention): { id: string; username: string | null; tracked: boolean } | null => {
    const username = normalizeUsername(mention.targetUsername);
    const byName = username ? trackedByUsername.get(username) : undefined;
    const byId = mention.targetTgId ? trackedByTgId.get(mention.targetTgId.toString()) : undefined;
    if (byName && byId && byName.id !== byId.id) return null;
    const tracked = byId ?? byName;
    if (tracked) return { id: `channel:${tracked.id}`, username: normalizeUsername(tracked.username), tracked: true };
    return username ? { id: `external:${username}`, username, tracked: false } : null;
  };

  const edgeMap = new Map<string, CitationNetworkEdge>();
  const hubSources = new Map<string, Set<number>>();
  const hubMentions = new Map<string, number>();
  for (const mention of mentions) {
    if (!trackedById.has(mention.sourceChannelId) || mention.publishedAt > now) continue;
    if (mention.type !== 'mention' && mention.type !== 'forward') continue;
    const target = resolveTarget(mention);
    const source = `channel:${mention.sourceChannelId}`;
    if (!target || target.id === source) continue;

    if (!target.tracked && target.username && mention.publishedAt >= hubsSince) {
      const sources = hubSources.get(target.username) ?? new Set<number>();
      sources.add(mention.sourceChannelId);
      hubSources.set(target.username, sources);
      hubMentions.set(target.username, (hubMentions.get(target.username) ?? 0) + 1);
    }
    if (mention.publishedAt < graphSince) continue;
    const key = `${source}|${target.id}`;
    const edge = edgeMap.get(key) ?? {
      source, target: target.id, count: 0, forwardsCount: 0, mentionsCount: 0, isBidirectional: false,
    };
    edge.count++;
    if (mention.type === 'forward') edge.forwardsCount++;
    else edge.mentionsCount++;
    edgeMap.set(key, edge);
  }

  const allEdges = [...edgeMap.values()];
  const externalCounts = new Map<string, number>();
  for (const edge of allEdges) {
    if (edge.target.startsWith('external:')) {
      externalCounts.set(edge.target, (externalCounts.get(edge.target) ?? 0) + edge.count);
    }
  }
  const includedExternal = new Set([...externalCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_EXTERNAL_NODES).map(([id]) => id));
  const edges = allEdges.filter(edge => !edge.target.startsWith('external:') || includedExternal.has(edge.target));
  const edgeKeys = new Set(edges.map(edge => `${edge.source}|${edge.target}`));
  for (const edge of edges) edge.isBidirectional = edgeKeys.has(`${edge.target}|${edge.source}`);
  edges.sort((left, right) => right.count - left.count || left.source.localeCompare(right.source) || left.target.localeCompare(right.target));

  const counts = new Map<string, { inbound: number; outbound: number }>();
  for (const edge of edges) {
    const source = counts.get(edge.source) ?? { inbound: 0, outbound: 0 };
    source.outbound += edge.count;
    counts.set(edge.source, source);
    const target = counts.get(edge.target) ?? { inbound: 0, outbound: 0 };
    target.inbound += edge.count;
    counts.set(edge.target, target);
  }
  const focalId = options.focalChannelId ? `channel:${options.focalChannelId}` : null;
  const mutualWithFocal = (id: string) => focalId !== null && id !== focalId &&
    edgeKeys.has(`${id}|${focalId}`) && edgeKeys.has(`${focalId}|${id}`);
  const nodes: CitationNetworkNode[] = [
    ...channels.map(channel => {
      const id = `channel:${channel.id}`;
      const count = counts.get(id);
      return {
        id, channelId: channel.id, username: normalizeUsername(channel.username), title: channel.title,
        subscribers: channel.subscribers, niche: channel.niche, isTracked: true,
        inboundCount: count?.inbound ?? 0, outboundCount: count?.outbound ?? 0,
        isMutualWithFocal: mutualWithFocal(id),
      };
    }),
    ...[...includedExternal].map(id => {
      const count = counts.get(id);
      const username = id.slice('external:'.length);
      return {
        id, channelId: null, username, title: `@${username}`,
        subscribers: null, niche: null, isTracked: false,
        inboundCount: count?.inbound ?? 0, outboundCount: 0,
        isMutualWithFocal: false,
      };
    }),
  ];
  const discoveredHubs: DiscoveredHub[] = [...hubSources.entries()]
    .filter(([, sources]) => sources.size >= 2)
    .map(([username, sources]) => ({ username, citingChannels: sources.size, mentionsCount: hubMentions.get(username) ?? 0 }))
    .sort((left, right) => right.citingChannels - left.citingChannels || right.mentionsCount - left.mentionsCount || left.username.localeCompare(right.username));
  return { focalChannelId: options.focalChannelId ?? null, days, nodes, edges, discoveredHubs };
}

export async function buildCitationNetwork(options: {
  channelIds: number[];
  focalChannelId?: number;
  days?: number;
  nichesByChannelId?: ReadonlyMap<number, string>;
  now?: Date;
}): Promise<CitationNetworkData> {
  const days = options.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new RangeError('Invalid network period');
  const channelIds = [...new Set(options.channelIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (options.focalChannelId !== undefined && !channelIds.includes(options.focalChannelId)) {
    throw new RangeError('Focal channel is outside the selected channels');
  }
  if (channelIds.length === 0) return aggregateCitationNetwork([], [], { ...options, days });

  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - Math.max(days, 30) * DAY_MS);
  const [channels, snapshots, mentions] = await Promise.all([
    prisma.channel.findMany({
      where: { id: { in: channelIds }, isActive: true },
      select: { id: true, title: true, username: true, tgId: true, niche: true },
    }),
    prisma.snapshot.findMany({
      where: { channelId: { in: channelIds } },
      orderBy: { collectedAt: 'desc' }, distinct: ['channelId'],
      select: { channelId: true, membersCount: true },
    }),
    prisma.mention.findMany({
      where: { sourceChannelId: { in: channelIds }, sourcePost: { publishedAt: { gte: since, lte: now } } },
      select: {
        sourceChannelId: true, targetUsername: true, targetTgId: true, type: true,
        sourcePost: { select: { publishedAt: true } },
      },
    }),
  ]);
  const subscribers = new Map(snapshots.map(snapshot => [snapshot.channelId, snapshot.membersCount]));
  const tracked: TrackedChannel[] = channels.map(channel => ({
    ...channel,
    niche: options.nichesByChannelId?.get(channel.id) ?? channel.niche,
    subscribers: subscribers.get(channel.id) ?? null,
  }));
  return aggregateCitationNetwork(tracked, mentions.map(mention => ({
    sourceChannelId: mention.sourceChannelId,
    targetUsername: mention.targetUsername,
    targetTgId: mention.targetTgId,
    type: mention.type,
    publishedAt: mention.sourcePost.publishedAt,
  })), { focalChannelId: options.focalChannelId, days, now });
}
