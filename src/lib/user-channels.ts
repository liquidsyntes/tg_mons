import type { Channel, UserChannel } from '@prisma/client';
import { prisma } from './prisma';

export type UserChannelView = Channel & {
  tags: string[];
  customAdPriceUah: number | null;
  customCpmUah: number | null;
};

interface ListUserChannelsOptions {
  onlyActive?: boolean;
  excludeMine?: boolean;
  withLatestSnapshot?: boolean;
}

function mergeUserChannel<T extends Channel>(channel: T, subscription: UserChannel): T & UserChannelView {
  return {
    ...channel,
    isMine: subscription.isMine,
    isFavorite: subscription.isFavorite,
    niche: subscription.niche || channel.niche,
    tags: subscription.tags ?? [],
    isActive: subscription.isActive && channel.isActive,
    customAdPriceUah: subscription.customAdPriceUah ?? null,
    customCpmUah: subscription.customCpmUah ?? null,
  };
}

function legacyChannel<T extends Channel>(channel: T): T & UserChannelView {
  return { ...channel, tags: [], customAdPriceUah: null, customCpmUah: null };
}

export async function resolveUserChannel(channelId: number, userId?: number | null): Promise<UserChannelView | null> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;
  if (userId == null || typeof prisma.userChannel?.findUnique !== 'function') return legacyChannel(channel);

  const subscription = await prisma.userChannel.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  return subscription ? mergeUserChannel(channel, subscription) : null;
}

export async function listUserChannels(
  userId?: number | null,
  options: ListUserChannelsOptions = {},
): Promise<Array<UserChannelView & { snapshots?: Array<{ membersCount: number }> }>> {
  const { onlyActive = false, excludeMine = false, withLatestSnapshot = false } = options;
  const latestSnapshot = {
    orderBy: { collectedAt: 'desc' as const },
    take: 1,
    select: { membersCount: true },
  };

  if (userId != null && typeof prisma.userChannel?.findMany === 'function') {
    const where = {
      userId,
      ...(onlyActive ? { isActive: true, channel: { isActive: true } } : {}),
      ...(excludeMine ? { isMine: false } : {}),
    };
    const orderBy = [{ isMine: 'desc' as const }, { createdAt: 'asc' as const }];
    if (withLatestSnapshot) {
      const subscriptions = await prisma.userChannel.findMany({
        where,
        include: { channel: { include: { snapshots: latestSnapshot } } },
        orderBy,
      });
      return subscriptions.map(sub => mergeUserChannel(sub.channel, sub));
    }
    const subscriptions = await prisma.userChannel.findMany({ where, include: { channel: true }, orderBy });
    return subscriptions.map(sub => mergeUserChannel(sub.channel, sub));
  }

  const where = {
    ...(onlyActive ? { isActive: true } : {}),
    ...(excludeMine ? { isMine: false } : {}),
  };
  const orderBy = [{ isMine: 'desc' as const }, { createdAt: 'asc' as const }];
  if (withLatestSnapshot) {
    const channels = await prisma.channel.findMany({
      where,
      include: { snapshots: latestSnapshot },
      orderBy,
    });
    return channels.map(legacyChannel);
  }
  const channels = await prisma.channel.findMany({ where, orderBy });
  return channels.map(legacyChannel);
}

export async function findUserMyChannel(userId?: number | null): Promise<UserChannelView | null> {
  if (userId != null && typeof prisma.userChannel?.findFirst === 'function') {
    const subscription = await prisma.userChannel.findFirst({
      where: { userId, isMine: true },
      include: { channel: true },
    });
    return subscription ? mergeUserChannel(subscription.channel, subscription) : null;
  }
  const channel = await prisma.channel.findFirst({ where: { isMine: true } });
  return channel ? legacyChannel(channel) : null;
}
