import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ channels: vi.fn(), snapshots: vi.fn(), mentions: vi.fn() }));
vi.mock('../prisma', () => ({ prisma: {
  channel: { findMany: mocks.channels }, snapshot: { findMany: mocks.snapshots }, mention: { findMany: mocks.mentions },
} }));

import { aggregateCitationNetwork, buildCitationNetwork, type NetworkMention } from '../citationNetwork';

const now = new Date('2026-10-24T12:00:00.000Z');
const channels = [
  { id: 1, title: 'Первый', username: 'Foo', tgId: 1n, niche: 'news', subscribers: 1000 },
  { id: 2, title: 'Второй', username: 'bar', tgId: 2n, niche: 'news', subscribers: 2000 },
  { id: 3, title: 'Третий', username: 'third', tgId: 3n, niche: 'science', subscribers: null },
];
const recent = new Date('2026-10-23T12:00:00.000Z');

function mention(sourceChannelId: number, targetUsername: string | null, type = 'mention', targetTgId: bigint | null = null, publishedAt = recent): NetworkMention {
  return { sourceChannelId, targetUsername, targetTgId, type, publishedAt };
}

describe('aggregateCitationNetwork', () => {
  it('excludes self-citations and marks reciprocal tracked edges', () => {
    const result = aggregateCitationNetwork(channels, [
      mention(1, '@BAR'), mention(1, 'bar'),
      mention(2, null, 'forward', 1n),
      mention(1, 'foo'),
    ], { focalChannelId: 1, now });
    expect(result.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'channel:1', target: 'channel:2', count: 2,
        mentionsCount: 2, forwardsCount: 0, isBidirectional: true }),
      expect.objectContaining({ source: 'channel:2', target: 'channel:1', count: 1,
        forwardsCount: 1, isBidirectional: true }),
    ]));
    expect(result.edges).toHaveLength(2);
    expect(result.nodes.find(node => node.channelId === 2)).toMatchObject({
      isMutualWithFocal: true, inboundCount: 2, outboundCount: 1,
    });
  });

  it('discovers external hubs by distinct citing channels over a fixed 30-day window', () => {
    const old = new Date('2026-10-04T12:00:00.000Z');
    const result = aggregateCitationNetwork(channels, [
      mention(1, '@HubChannel', 'mention', null, old),
      mention(1, 'hubchannel', 'mention', null, old),
      mention(2, 'HUBCHANNEL', 'mention', null, old),
      mention(3, null, 'forward', 999n, old),
    ], { focalChannelId: 1, days: 7, now });
    expect(result.edges).toEqual([]);
    expect(result.discoveredHubs).toEqual([{ username: 'hubchannel', citingChannels: 2, mentionsCount: 3 }]);
    expect(result.nodes.every(node => node.isTracked)).toBe(true);
  });

  it('returns a typed empty graph for a channel without mentions', () => {
    const result = aggregateCitationNetwork(channels.slice(0, 1), [], { focalChannelId: 1, now });
    expect(result).toMatchObject({ focalChannelId: 1, days: 30, edges: [], discoveredHubs: [] });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({ subscribers: 1000, inboundCount: 0, outboundCount: 0 });
  });

  it('treats a globally known but unavailable target as external to this user', () => {
    const result = aggregateCitationNetwork(channels.slice(0, 1), [mention(1, 'bar')], { focalChannelId: 1, now });
    expect(result.edges[0].target).toBe('external:bar');
    expect(result.nodes.find(node => node.id === 'external:bar')).toMatchObject({ isTracked: false, subscribers: null });
  });
});

describe('buildCitationNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channels.mockResolvedValue(channels.map(({ subscribers, ...channel }) => channel));
    mocks.snapshots.mockResolvedValue([{ channelId: 1, membersCount: 1000 }]);
    mocks.mentions.mockResolvedValue([{
      sourceChannelId: 1, targetUsername: 'bar', targetTgId: null, type: 'mention',
      sourcePost: { publishedAt: recent },
    }]);
  });

  it('queries publication dates and applies user-specific niches', async () => {
    const result = await buildCitationNetwork({ channelIds: [1, 2, 3], focalChannelId: 1, days: 7,
      nichesByChannelId: new Map([[1, 'personal']]), now });
    expect(mocks.mentions).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      sourcePost: { publishedAt: { gte: new Date('2026-09-24T12:00:00.000Z'), lte: now } },
    }) }));
    expect(result.nodes.find(node => node.channelId === 1)).toMatchObject({ niche: 'personal', subscribers: 1000 });
  });

  it('rejects a focal channel outside the allowed selection', async () => {
    await expect(buildCitationNetwork({ channelIds: [1], focalChannelId: 2 })).rejects.toBeInstanceOf(RangeError);
    expect(mocks.mentions).not.toHaveBeenCalled();
  });
});
