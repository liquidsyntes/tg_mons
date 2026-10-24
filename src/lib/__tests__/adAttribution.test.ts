import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  channels: vi.fn(), subscriptions: vi.fn(), mentions: vi.fn(), snapshots: vi.fn(), price: vi.fn(),
}));
vi.mock('../prisma', () => ({ prisma: {
  channel: { findMany: mocks.channels }, userChannel: { findMany: mocks.subscriptions },
  mention: { findMany: mocks.mentions }, snapshot: { findMany: mocks.snapshots },
} }));
vi.mock('../pricing', () => ({ estimateAdPrice: mocks.price }));

import { estimatedCpf, getChannelAdAttribution, hasOverlappingCampaign, subscriberDeltaAt } from '../adAttribution';

const publishedAt = new Date('2026-10-20T00:00:00.000Z');
const now = new Date('2026-10-23T00:00:00.000Z');
const donor = { id: 1, title: 'Донор', username: 'donor', tgId: 1n };
const target = { id: 2, title: 'Цель', username: 'target', tgId: 2n };
const secondDonor = { id: 3, title: 'Второй донор', username: 'other', tgId: 3n };

function mention(postId: number, source = donor, date = publishedAt) {
  return {
    sourcePostId: postId, sourceChannelId: source.id, targetUsername: 'target', targetTgId: null,
    sourcePost: { id: postId, messageId: BigInt(postId), publishedAt: date, views: 1000, isAd: true },
    sourceChannel: { id: source.id, title: source.title, username: source.username },
  };
}

const snapshots = [
  { channelId: 2, collectedAt: new Date('2026-10-19T23:00:00.000Z'), membersCount: 100 },
  { channelId: 2, collectedAt: new Date('2026-10-21T01:00:00.000Z'), membersCount: 120 },
  { channelId: 2, collectedAt: new Date('2026-10-22T01:00:00.000Z'), membersCount: 130 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscriptions.mockResolvedValue([donor, target, secondDonor].map(channel => ({ channel })));
  mocks.channels.mockResolvedValue([donor, target, secondDonor]);
  mocks.mentions.mockResolvedValue([mention(101)]);
  mocks.snapshots.mockResolvedValue(snapshots);
  mocks.price.mockResolvedValue({ estimatedPricePerPost: 200 });
});

describe('ad attribution calculations', () => {
  it('calculates 24h and 48h growth from bounded snapshots', () => {
    expect(subscriberDeltaAt(snapshots, publishedAt, 24, now)).toBe(20);
    expect(subscriberDeltaAt(snapshots, publishedAt, 48, now)).toBe(30);
  });

  it('returns unknown growth for missing, stale or not-yet-due snapshots', () => {
    expect(subscriberDeltaAt([], publishedAt, 24, now)).toBeNull();
    expect(subscriberDeltaAt([{ ...snapshots[0], collectedAt: new Date('2026-10-19T10:00:00Z') }, snapshots[1]], publishedAt, 24, now)).toBeNull();
    expect(subscriberDeltaAt(snapshots, publishedAt, 48, new Date('2026-10-21T12:00:00Z'))).toBeNull();
    expect(subscriberDeltaAt(snapshots, publishedAt, 24, new Date('2026-10-21T00:30:00Z'))).toBeNull();
  });

  it('keeps negative growth but does not calculate CPF without positive growth', () => {
    const falling = [snapshots[0], { ...snapshots[1], membersCount: 90 }];
    expect(subscriberDeltaAt(falling, publishedAt, 24, now)).toBe(-10);
    expect(estimatedCpf(200, -10)).toBeNull();
    expect(estimatedCpf(200, 0)).toBeNull();
    expect(estimatedCpf(null, 10)).toBeNull();
    expect(estimatedCpf(200, 20)).toBe(10);
  });

  it('detects overlapping 24-hour campaigns for the same target', () => {
    const campaigns = [
      { postId: 101, publishedAt },
      { postId: 102, publishedAt: new Date(publishedAt.getTime() + 12 * 60 * 60 * 1000) },
    ];
    expect(hasOverlappingCampaign(101, publishedAt, campaigns)).toBe(true);
    expect(hasOverlappingCampaign(101, publishedAt, [campaigns[0]])).toBe(false);
  });
});

describe('getChannelAdAttribution', () => {
  it('returns inbound ads, estimated CPF and an overlap warning without duplicate mentions', async () => {
    const second = mention(102, secondDonor, new Date(publishedAt.getTime() + 12 * 60 * 60 * 1000));
    mocks.mentions.mockResolvedValueOnce([mention(101), { ...mention(101), targetUsername: null, targetTgId: 2n }, second])
      .mockResolvedValueOnce([mention(101), second]);
    const result = await getChannelAdAttribution(2, 30, 7, now);
    expect(result?.inbound).toHaveLength(2);
    expect(result?.inbound.find(item => item.postId === 101)).toMatchObject({
      deltaSubscribers24h: 20, deltaSubscribers48h: 30,
      estimatedPricePerPost: 200, estimatedCpf: 10, overlappingCampaigns: true,
    });
    expect(mocks.subscriptions).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 7, isActive: true, channel: { isActive: true } },
    }));
  });

  it('returns outgoing placements with a view-to-subscriber conversion', async () => {
    mocks.mentions.mockResolvedValueOnce([mention(101)]).mockResolvedValueOnce([mention(101)]);
    const result = await getChannelAdAttribution(1, 30, null, now);
    expect(result?.outbound).toHaveLength(1);
    expect(result?.outbound[0]).toMatchObject({ targetChannel: { id: 2 }, conversionPercent: 2, estimatedCpf: 10 });
  });

  it('does not expose a channel outside the active user list', async () => {
    mocks.subscriptions.mockResolvedValue([{ channel: donor }]);
    expect(await getChannelAdAttribution(2, 30, 7, now)).toBeNull();
    expect(mocks.mentions).not.toHaveBeenCalled();
  });

  it('leaves price and CPF empty for ordinary inbound mentions', async () => {
    const ordinary = mention(103);
    ordinary.sourcePost.isAd = false;
    mocks.mentions.mockResolvedValueOnce([ordinary]).mockResolvedValueOnce([]);
    const result = await getChannelAdAttribution(2, 30, 7, now);
    expect(result?.inbound[0]).toMatchObject({ isAd: false, estimatedPricePerPost: null, estimatedCpf: null });
    expect(mocks.price).not.toHaveBeenCalled();
  });
});
