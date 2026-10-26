import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ channels: vi.fn(), mentions: vi.fn(), posts: vi.fn() }));
vi.mock('../../prisma', () => ({ prisma: {
  channel: { findMany: db.channels }, mention: { findMany: db.mentions }, post: { findMany: db.posts },
} }));

import { analyzePropagation, calculateOriginProfile, getPropagationForChannel,
  type OriginPost, type PropagationMention, type TrackedPropagationChannel } from '../propagation';

const now = new Date('2026-10-26T12:00:00Z');
const channels: TrackedPropagationChannel[] = [
  { id: 1, title: 'Источник', username: 'source', tgId: 1n },
  { id: 2, title: 'Репостер', username: 'reposter', tgId: 2n },
  { id: 3, title: 'Цитатор', username: 'citer', tgId: 3n },
];
const original: OriginPost = { id: 10, channelId: 1, messageId: 42n,
  publishedAt: new Date('2026-10-20T10:00:00Z'), text: 'Исходная публикация' };
function mention(sourcePostId: number, sourceChannelId: number, targetUsername: string | null,
  targetTgId: bigint | null, targetMessageId: bigint | null, type: string,
  date: string, text: string | null = null): PropagationMention {
  return { sourcePostId, sourceChannelId, targetUsername, targetTgId, targetMessageId, type,
    sourcePost: { messageId: BigInt(sourcePostId + 100), publishedAt: new Date(date), text } };
}

describe('origin profile', () => {
  it('classifies zero and boundary counts without division by zero', () => {
    expect(calculateOriginProfile(0, 0)).toEqual({ role: 'isolated', originRatio: null });
    expect(calculateOriginProfile(1, 1)).toEqual({ role: 'isolated', originRatio: 1 });
    expect(calculateOriginProfile(3, 0)).toEqual({ role: 'origin', originRatio: null });
    expect(calculateOriginProfile(0, 3)).toEqual({ role: 'distributor', originRatio: 0 });
    expect(calculateOriginProfile(4, 2)).toEqual({ role: 'origin', originRatio: 2 });
    expect(calculateOriginProfile(2, 4)).toEqual({ role: 'distributor', originRatio: 0.5 });
    expect(calculateOriginProfile(3, 3)).toEqual({ role: 'balanced', originRatio: 1 });
  });
});

describe('analyzePropagation', () => {
  it('matches forwarded and directly linked posts with citation delays', () => {
    const result = analyzePropagation(channels, [
      mention(20, 2, null, 1n, 42n, 'forward', '2026-10-20T10:30:00Z'),
      mention(21, 3, 'source', null, null, 'mention', '2026-10-20T11:00:00Z', 'https://t.me/source/42'),
      mention(21, 3, 'source', null, null, 'mention', '2026-10-20T11:00:00Z', 'https://t.me/source/42'),
      mention(22, 1, 'reposter', null, null, 'mention', '2026-10-20T11:30:00Z'),
    ], [original], 1, now);
    expect(result).toMatchObject({ role: 'origin', originRatio: 2, incomingCount: 2,
      outgoingCount: 1, averageIncomingDelayMinutes: 45 });
    expect(result.topCitedPosts).toEqual([expect.objectContaining({
      id: 10, messageId: '42', citationsCount: 2, averageDelayMinutes: 45,
      citingChannels: expect.arrayContaining([
        expect.objectContaining({ id: 2, averageDelayMinutes: 30 }),
        expect.objectContaining({ id: 3, averageDelayMinutes: 60 }),
      ]),
    })]);
    expect(result.recentChains).toHaveLength(3);
    expect(result.recentChains.find(chain => chain.source.id === 1)?.delayMinutes).toBeNull();
  });

  it('keeps unmatched chains visible but never invents a source post or delay', () => {
    const result = analyzePropagation(channels.slice(0, 2), [
      mention(20, 2, 'source', null, null, 'mention', '2026-10-20T11:00:00Z'),
      mention(21, 3, 'source', null, 42n, 'forward', '2026-10-20T11:00:00Z'),
      mention(22, 1, 'citer', null, null, 'mention', '2026-10-20T11:00:00Z'),
    ], [original], 1, now);
    expect(result.incomingCount).toBe(1);
    expect(result.outgoingCount).toBe(0);
    expect(result.topCitedPosts).toEqual([]);
    expect(result.averageIncomingDelayMinutes).toBeNull();
    expect(result.recentChains).toEqual([expect.objectContaining({ source: expect.objectContaining({ id: 2 }),
      originPostId: null, delayMinutes: null })]);
  });
});

describe('getPropagationForChannel access scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.channels.mockResolvedValue(channels.slice(0, 2));
    db.mentions.mockResolvedValue([]);
    db.posts.mockResolvedValue([]);
  });

  it('queries only allowed sources and returns an isolated profile', async () => {
    const result = await getPropagationForChannel([1, 2], 1, now);
    expect(db.mentions).toHaveBeenCalledWith(expect.objectContaining({ where: {
      sourceChannelId: { in: [1, 2] },
      sourcePost: { channelId: { in: [1, 2] },
        publishedAt: { gte: new Date('2026-09-26T12:00:00Z'), lte: now } },
    } }));
    expect(db.posts).not.toHaveBeenCalled();
    expect(result).toMatchObject({ role: 'isolated', incomingCount: 0, outgoingCount: 0 });
  });

  it('rejects a focal channel outside the user selection', async () => {
    await expect(getPropagationForChannel([1], 2, now)).rejects.toBeInstanceOf(RangeError);
    expect(db.mentions).not.toHaveBeenCalled();
  });
});
