import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ channel: vi.fn(), subscription: vi.fn(), posts: vi.fn(), curve: vi.fn() }));
vi.mock('../prisma', () => ({ prisma: {
  channel: { findUnique: db.channel }, userChannel: { findUnique: db.subscription }, post: { findMany: db.posts },
} }));
vi.mock('../metrics/queries', () => ({ getAdReachCurve: db.curve }));

import { calculatePlacementPrice, estimateAdPrice, getNicheCpm } from '../pricing';

beforeEach(() => {
  vi.clearAllMocks();
  db.channel.mockResolvedValue({ niche: 'general' });
  db.subscription.mockResolvedValue({ niche: 'news', customAdPriceUah: null, customCpmUah: null });
  db.posts.mockResolvedValue([{ id: 1, views: 1000 }, { id: 2, views: 2000 }]);
  db.curve.mockResolvedValue([]);
});

describe('personal ad pricing', () => {
  it('prioritizes the fixed user price over custom CPM and the niche rate', () => {
    expect(calculatePlacementPrice(null, getNicheCpm('news'), {
      customAdPriceUah: 900, customCpmUah: 500,
    })).toEqual({ price: 900, source: 'custom_price', cpm: 100 });
  });

  it('calculates a placement from custom CPM and requires positive views', () => {
    expect(calculatePlacementPrice(1500, 100, { customCpmUah: 300 })).toEqual({
      price: 450, source: 'custom_cpm', cpm: 300,
    });
    expect(calculatePlacementPrice(0, 100, { customCpmUah: 300 }).price).toBeNull();
    expect(calculatePlacementPrice(null, 100, { customCpmUah: 300 }).price).toBeNull();
  });

  it('returns to niche CPM when user values are null or zero', () => {
    expect(calculatePlacementPrice(1500, 100, { customAdPriceUah: null, customCpmUah: null })).toEqual({
      price: 150, source: 'niche_estimate', cpm: 100,
    });
    expect(calculatePlacementPrice(1500, 100, { customAdPriceUah: 0, customCpmUah: 0 }).price).toBe(150);
  });

  it('uses only the requesting users settings and returns the selected price source', async () => {
    db.subscription.mockResolvedValue({ niche: 'news', customAdPriceUah: 700, customCpmUah: 300 });
    const fixed = await estimateAdPrice(7, 3);
    expect(fixed).toMatchObject({ estimatedPricePerPost: 700, priceSource: 'custom_price',
      customAdPriceUah: 700, customCpmUah: 300 });
    expect(db.subscription).toHaveBeenCalledWith({ where: { userId_channelId: { userId: 3, channelId: 7 } },
      select: { niche: true, customAdPriceUah: true, customCpmUah: true } });
    expect(db.channel).not.toHaveBeenCalled();

    db.subscription.mockResolvedValue({ niche: 'news', customAdPriceUah: null, customCpmUah: 300 });
    expect(await estimateAdPrice(7, 3)).toMatchObject({ estimatedPricePerPost: 450,
      priceSource: 'custom_cpm', cpm: 300 });
    db.subscription.mockResolvedValue({ niche: 'news', customAdPriceUah: null, customCpmUah: null });
    expect(await estimateAdPrice(7, 3)).toMatchObject({ estimatedPricePerPost: 150,
      priceSource: 'niche_estimate', cpm: 100 });
  });

  it('does not expose a channel absent from the users list', async () => {
    db.subscription.mockResolvedValue(null);
    expect(await estimateAdPrice(7, 3)).toBeNull();
    expect(db.posts).not.toHaveBeenCalled();
  });
});
