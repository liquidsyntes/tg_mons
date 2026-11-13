import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  channels: vi.fn(),
  subscriptions: vi.fn(),
  mentions: vi.fn(),
  snapshots: vi.fn(),
  adPlacements: vi.fn(),
  price: vi.fn(),
}));
vi.mock('../prisma', () => ({ prisma: {
  channel: { findMany: mocks.channels },
  userChannel: { findMany: mocks.subscriptions },
  mention: { findMany: mocks.mentions },
  snapshot: { findMany: mocks.snapshots },
  adPlacement: { findMany: mocks.adPlacements },
} }));
vi.mock('../pricing', async importOriginal => ({
  ...await importOriginal<typeof import('../pricing')>(), estimateAdPrice: mocks.price,
}));

import {
  calculateAdPlacementMetrics,
  estimatedCpf,
  getChannelAdAttribution,
  hasOverlappingCampaign,
  matchPlacementDeal,
  subscriberDeltaAt,
  summarizeAdCampaigns,
} from '../adAttribution';

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
  mocks.adPlacements.mockResolvedValue([]);
  mocks.price.mockResolvedValue({ estimatedPricePerPost: 200, cpm: 200,
    priceSource: 'niche_estimate', customAdPriceUah: null, customCpmUah: null });
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

  it('calculates factual CPM and CPF preferring actualJoins and guarding zero denominators', () => {
    expect(calculateAdPlacementMetrics({
      priceAmount: 1500,
      postViews: 5000,
      estimatedGain: 20,
      actualJoins: 30,
    })).toEqual({
      effectiveGain: 30,
      cpm: 300,
      cpf: 50,
    });

    expect(calculateAdPlacementMetrics({
      priceAmount: 1500,
      postViews: 5000,
      estimatedGain: 25,
      actualJoins: null,
    })).toEqual({
      effectiveGain: 25,
      cpm: 300,
      cpf: 60,
    });

    expect(calculateAdPlacementMetrics({
      priceAmount: 1500,
      postViews: 0,
      estimatedGain: 0,
      actualJoins: null,
    })).toEqual({
      effectiveGain: 0,
      cpm: null,
      cpf: null,
    });
  });

  it('matches mention placements to stored deals by postId or +-24h scheduled window', () => {
    const mentionPlacement = {
      postId: 101,
      publishedAt,
      donorChannelId: 1,
      targetChannelId: 2,
    };

    const exact = {
      id: 11,
      postId: 101,
      donorChannelId: 1,
      targetChannelId: 2,
      scheduledAt: null,
      status: 'completed',
    };
    const byWindowNear = {
      id: 12,
      postId: null,
      donorChannelId: 1,
      targetChannelId: 2,
      scheduledAt: new Date(publishedAt.getTime() + 2 * 60 * 60 * 1000),
      status: 'published',
    };
    const byWindowCancelled = {
      id: 13,
      postId: null,
      donorChannelId: 1,
      targetChannelId: 2,
      scheduledAt: publishedAt,
      status: 'cancelled',
    };
    const byWindowTooFar = {
      id: 14,
      postId: null,
      donorChannelId: 1,
      targetChannelId: 2,
      scheduledAt: new Date(publishedAt.getTime() + 30 * 60 * 60 * 1000),
      status: 'published',
    };

    expect(matchPlacementDeal(mentionPlacement, [byWindowNear, exact])?.id).toBe(11);
    expect(matchPlacementDeal(mentionPlacement, [byWindowCancelled, byWindowTooFar, byWindowNear])?.id).toBe(12);
    expect(matchPlacementDeal(mentionPlacement, [byWindowNear], new Set([12]))).toBeNull();
  });

  it('summarizes campaign budget, average CPF, average CPM and best donor while skipping cancelled deals', () => {
    const summary = summarizeAdCampaigns([
      {
        donorChannelId: 1,
        donorChannel: { id: 1, title: 'Донор', username: 'donor' },
        priceAmount: 1000,
        currency: 'UAH',
        status: 'completed',
        effectiveGain: 25,
        postViews: 2000,
      },
      {
        donorChannelId: 3,
        donorChannel: { id: 3, title: 'Второй донор', username: 'other' },
        priceAmount: 900,
        currency: 'UAH',
        status: 'completed',
        effectiveGain: 30,
        postViews: 3000,
      },
      {
        donorChannelId: 1,
        donorChannel: { id: 1, title: 'Донор', username: 'donor' },
        priceAmount: 5000,
        currency: 'UAH',
        status: 'cancelled',
        effectiveGain: 10,
        postViews: 500,
      },
    ]);

    expect(summary).toEqual({
      dealsCount: 2,
      activeDealsCount: 0,
      totalSpent: 1900,
      currency: 'UAH',
      totalGainedSubscribers: 55,
      avgCpf: 34.55,
      avgCpm: 380,
      bestDonor: {
        channelId: 3,
        title: 'Второй донор',
        username: 'other',
        cpf: 30,
        gainedSubscribers: 30,
        spent: 900,
      },
    });
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
      estimatedPricePerPost: 200, priceSource: 'niche_estimate', estimatedCpf: 10, overlappingCampaigns: true,
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

  it('uses a personal fixed price and custom CPM for CPF', async () => {
    mocks.price.mockResolvedValueOnce({ estimatedPricePerPost: 800, cpm: 100,
      priceSource: 'custom_price', customAdPriceUah: 800, customCpmUah: 300 });
    const fixed = await getChannelAdAttribution(2, 30, 7, now);
    expect(fixed?.inbound[0]).toMatchObject({ estimatedPricePerPost: 800,
      priceSource: 'custom_price', estimatedCpf: 40 });
    expect(mocks.price).toHaveBeenCalledWith(1, 7);

    mocks.price.mockResolvedValue({ estimatedPricePerPost: 450, cpm: 300,
      priceSource: 'custom_cpm', customAdPriceUah: null, customCpmUah: 300 });
    const cpm = await getChannelAdAttribution(2, 30, 7, now);
    expect(cpm?.inbound[0]).toMatchObject({ estimatedPricePerPost: 300,
      priceSource: 'custom_cpm', estimatedCpf: 15 });
  });

  it('attaches stored AdPlacement deals to matching mentions and separates unmatched planned placements', async () => {
    mocks.adPlacements.mockResolvedValue([
      {
        id: 50,
        targetChannelId: 2,
        donorChannelId: 1,
        postId: 101,
        priceAmount: 1000,
        currency: 'UAH',
        format: '2/48',
        status: 'completed',
        scheduledAt: publishedAt,
        inviteLink: 'https://t.me/+abc123',
        actualJoins: 40,
        notes: 'Хороший отклик',
        createdAt: publishedAt,
        updatedAt: publishedAt,
        targetChannel: { id: 2, title: 'Цель', username: 'target' },
        donorChannel: { id: 1, title: 'Донор', username: 'donor' },
        post: { views: 1000, publishedAt },
      },
      {
        id: 51,
        targetChannelId: 2,
        donorChannelId: 3,
        postId: null,
        priceAmount: 500,
        currency: 'UAH',
        format: '1/24',
        status: 'planned',
        scheduledAt: new Date('2026-10-25T10:00:00.000Z'),
        inviteLink: null,
        actualJoins: null,
        notes: 'Запланировано на воскресенье',
        createdAt: publishedAt,
        updatedAt: publishedAt,
        targetChannel: { id: 2, title: 'Цель', username: 'target' },
        donorChannel: { id: 3, title: 'Второй донор', username: 'other' },
        post: null,
      },
    ]);

    const result = await getChannelAdAttribution(2, 30, 7, now);
    expect(result?.inbound[0]?.deal).toMatchObject({
      id: 50,
      format: '2/48',
      status: 'completed',
      priceAmount: 1000,
      actualJoins: 40,
      effectiveGain: 40,
      factualCpm: 1000,
      factualCpf: 25,
    });
    expect(result?.manualPlacements).toHaveLength(1);
    expect(result?.manualPlacements?.[0]).toMatchObject({
      id: 51,
      status: 'planned',
      priceAmount: 500,
    });
    expect(result?.summary).toMatchObject({
      dealsCount: 2,
      activeDealsCount: 1,
      totalSpent: 1500,
      totalGainedSubscribers: 40,
      avgCpf: 25,
      avgCpm: 1000,
      bestDonor: { channelId: 1, cpf: 25 },
    });
  });
});
