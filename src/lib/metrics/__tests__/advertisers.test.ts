import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateAdvertisers, getTopAdvertisers, type AdvertiserChannel, type AdvertiserMention } from '../advertisers';

const db = vi.hoisted(() => ({ channels: vi.fn(), subscriptions: vi.fn(), mentions: vi.fn() }));
vi.mock('../../prisma', () => ({ prisma: {
  channel: { findMany: db.channels }, userChannel: { findMany: db.subscriptions }, mention: { findMany: db.mentions },
} }));

const donors: AdvertiserChannel[] = [
  { id: 1, title: 'Крипто', username: 'crypto_one', niche: 'crypto' },
  { id: 2, title: 'Новости', username: 'news_two', niche: 'news' },
];
const mention = (sourcePostId: number, sourceChannelId: number, targetUsername: string | null,
  views: number | null, publishedAt: string): AdvertiserMention => ({
  sourcePostId, sourceChannelId, targetUsername,
  sourcePost: { views, publishedAt: new Date(publishedAt) },
});

describe('advertiser aggregation', () => {
  it('groups unique placements across donor channels and estimates spend by niche CPM', () => {
    const result = aggregateAdvertisers([
      mention(10, 1, 'Brand', 1000, '2026-10-20T12:00:00Z'),
      mention(10, 1, '@brand', 1000, '2026-10-20T12:00:00Z'),
      mention(11, 2, 'brand', 2000, '2026-10-22T12:00:00Z'),
    ], donors, [{ id: 9, username: 'brand' }]);
    expect(result).toEqual([expect.objectContaining({
      username: 'brand', placementsCount: 2, channelsCount: 2,
      totalViews: 3000, avgViews: 1500, estimatedSpendUah: 700,
      firstSeenAt: '2026-10-20T12:00:00.000Z', lastSeenAt: '2026-10-22T12:00:00.000Z',
      isTrackedChannel: true, channelId: 9,
      donorChannels: [
        { id: 1, title: 'Крипто', username: 'crypto_one', placementsCount: 1 },
        { id: 2, title: 'Новости', username: 'news_two', placementsCount: 1 },
      ],
    })]);
  });

  it('skips self mentions, inaccessible donors and posts without an external username', () => {
    expect(aggregateAdvertisers([
      mention(10, 1, 'crypto_one', 100, '2026-10-20T12:00:00Z'),
      mention(11, 3, 'outside', 100, '2026-10-20T12:00:00Z'),
      mention(12, 1, null, 100, '2026-10-20T12:00:00Z'),
      mention(13, 1, 'brand', null, '2026-10-20T12:00:00Z'),
    ], donors, [{ id: 1, username: 'crypto_one' }])).toEqual([expect.objectContaining({
      username: 'brand', placementsCount: 1, totalViews: null, avgViews: null, estimatedSpendUah: null,
      isTrackedChannel: false, channelId: null,
    })]);
  });

  it('uses personal donor pricing in the estimated advertiser budget', () => {
    const customDonor = { ...donors[0], customAdPriceUah: 900, customCpmUah: 400 };
    expect(aggregateAdvertisers([
      mention(10, 1, 'brand', null, '2026-10-20T12:00:00Z'),
    ], [customDonor], [])).toEqual([expect.objectContaining({
      totalViews: null, estimatedSpendUah: 900,
    })]);
    expect(aggregateAdvertisers([
      mention(11, 1, 'brand', 1000, '2026-10-20T12:00:00Z'),
    ], [{ ...donors[0], customAdPriceUah: null, customCpmUah: 400 }], []))
      .toEqual([expect.objectContaining({ estimatedSpendUah: 400 })]);
  });
});

describe('getTopAdvertisers access scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries only active user channels in the selected niche and hides other users channels', async () => {
    db.subscriptions.mockResolvedValue([
      { isActive: true, niche: 'crypto', customAdPriceUah: 600, customCpmUah: null,
        channel: { id: 1, title: 'Крипто', username: 'crypto_one', isActive: true } },
      { isActive: false, niche: 'crypto', channel: { id: 2, title: 'Скрытый', username: 'hidden_two', isActive: true } },
      { isActive: true, niche: 'news', channel: { id: 3, title: 'Новости', username: 'news_three', isActive: true } },
      { isActive: false, niche: 'news', channel: { id: 9, title: 'Бренд', username: 'brand', isActive: true } },
    ]);
    db.mentions.mockResolvedValue([
      mention(10, 1, 'brand', 1000, '2026-10-20T12:00:00Z'),
      mention(11, 2, 'foreign', 1000, '2026-10-20T12:00:00Z'),
    ]);
    const result = await getTopAdvertisers(3, 30, 'crypto', new Date('2026-10-26T12:00:00Z'));
    expect(db.channels).not.toHaveBeenCalled();
    expect(db.mentions).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sourceChannelId: { in: [1] },
        sourcePost: { channelId: { in: [1] }, isAd: true,
          publishedAt: { gte: new Date('2026-09-26T12:00:00Z'), lte: new Date('2026-10-26T12:00:00Z') } } }),
    }));
    expect(result.advertisers).toEqual([expect.objectContaining({ username: 'brand',
      isTrackedChannel: true, channelId: 9, estimatedSpendUah: 600 })]);
  });

  it('returns empty without querying mentions when no channels are accessible', async () => {
    db.subscriptions.mockResolvedValue([]);
    expect(await getTopAdvertisers(4, 7, null)).toEqual({ days: 7, niche: null, advertisers: [] });
    expect(db.mentions).not.toHaveBeenCalled();
  });
});
