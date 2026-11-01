import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  channelFindUnique: vi.fn(), channelFindMany: vi.fn(), channelFindFirst: vi.fn(),
  subscriptionFindUnique: vi.fn(), subscriptionFindMany: vi.fn(), subscriptionFindFirst: vi.fn(),
}));
vi.mock('../prisma', () => ({ prisma: {
  channel: { findUnique: db.channelFindUnique, findMany: db.channelFindMany, findFirst: db.channelFindFirst },
  userChannel: {
    findUnique: db.subscriptionFindUnique,
    findMany: db.subscriptionFindMany,
    findFirst: db.subscriptionFindFirst,
  },
} }));

import { findUserMyChannel, listUserChannels, resolveUserChannel } from '../user-channels';

const channel = (id: number, overrides: Record<string, unknown> = {}) => ({
  id, title: `Channel ${id}`, username: `channel${id}`, tgId: null, type: 'channel', niche: 'global',
  isMine: false, isFavorite: false, isActive: true, consecutiveErrors: 0, lastMessageId: null,
  lastError: null, lastCollectedAt: null, createdAt: new Date('2026-10-01T00:00:00Z'), ...overrides,
});

const subscription = (id: number, overrides: Record<string, unknown> = {}) => ({
  id, userId: 7, channelId: id, isMine: true, isFavorite: true, niche: 'personal',
  tags: ['one'], isActive: true, customAdPriceUah: 1200, customCpmUah: 90,
  createdAt: new Date('2026-10-02T00:00:00Z'), ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.channelFindUnique.mockResolvedValue(channel(1));
  db.channelFindMany.mockResolvedValue([channel(1)]);
  db.channelFindFirst.mockResolvedValue(channel(1, { isMine: true }));
  db.subscriptionFindUnique.mockResolvedValue(subscription(1));
  db.subscriptionFindMany.mockResolvedValue([{ ...subscription(1), channel: channel(1) }]);
  db.subscriptionFindFirst.mockResolvedValue({ ...subscription(1), channel: channel(1) });
});

describe('user channel access', () => {
  it('merges personal fields and prices for a subscribed channel', async () => {
    const result = await resolveUserChannel(1, 7);
    expect(result).toMatchObject({
      id: 1, niche: 'personal', tags: ['one'], isMine: true, isFavorite: true,
      isActive: true, customAdPriceUah: 1200, customCpmUah: 90,
    });
    expect(db.subscriptionFindUnique).toHaveBeenCalledWith({ where: { userId_channelId: { userId: 7, channelId: 1 } } });
  });

  it('denies a user without a subscription without exposing the global channel', async () => {
    db.subscriptionFindUnique.mockResolvedValue(null);
    db.subscriptionFindMany.mockResolvedValue([]);
    expect(await resolveUserChannel(1, 7)).toBeNull();
    expect(await listUserChannels(7)).toEqual([]);
    expect(db.channelFindMany).not.toHaveBeenCalled();
  });

  it('uses global channels for a master session', async () => {
    expect(await resolveUserChannel(1, null)).toMatchObject({
      id: 1, niche: 'global', tags: [], customAdPriceUah: null, customCpmUah: null,
    });
    expect(db.subscriptionFindUnique).not.toHaveBeenCalled();
    expect((await listUserChannels(null)).map(item => item.id)).toEqual([1]);
  });

  it('combines activation flags and applies list filters', async () => {
    db.subscriptionFindMany.mockResolvedValue([
      { ...subscription(1), channel: channel(1, { isActive: false }) },
    ]);
    expect(await listUserChannels(7, { onlyActive: true, excludeMine: true })).toMatchObject([
      { id: 1, isActive: false, niche: 'personal', tags: ['one'] },
    ]);
    expect(db.subscriptionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 7, isActive: true, isMine: false, channel: { isActive: true } },
    }));
    await listUserChannels(null, { onlyActive: true, excludeMine: true });
    expect(db.channelFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, isMine: false },
    }));
  });

  it('finds the personal or global My Channel', async () => {
    expect(await findUserMyChannel(7)).toMatchObject({ id: 1, niche: 'personal', isMine: true });
    expect(db.subscriptionFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7, isMine: true } }));
    expect(await findUserMyChannel(null)).toMatchObject({ id: 1, isMine: true });
    db.subscriptionFindFirst.mockResolvedValue(null);
    expect(await findUserMyChannel(7)).toBeNull();
  });

  it('keeps the latest snapshot in the same channel list query', async () => {
    db.subscriptionFindMany.mockResolvedValue([
      { ...subscription(1), channel: { ...channel(1), snapshots: [{ membersCount: 1200 }] } },
    ]);
    expect(await listUserChannels(7, { withLatestSnapshot: true })).toMatchObject([
      { id: 1, snapshots: [{ membersCount: 1200 }] },
    ]);
    expect(db.subscriptionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { channel: { include: { snapshots: {
        orderBy: { collectedAt: 'desc' }, take: 1, select: { membersCount: true },
      } } } },
    }));
  });
});
