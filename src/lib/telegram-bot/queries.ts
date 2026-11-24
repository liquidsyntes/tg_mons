import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { normalizeTelegramChatId } from '../digest';
import { isClearlyEventDigest } from '../events/digest';
import { isSameEvent } from '../events/matching';
import { calculateChannelMetrics } from '../metrics';
import { runFraudAudit } from '../fraudDetector';
import type {
  AddChannelCommandResult,
  AuthorizedBotAccess,
  BotChannelCardData,
  BotDigestExtras,
  BotEventItem,
  BotEventMention,
  BotLatestSyncJob,
  BotUserStatusSummary,
  DismissEventCommandResult,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

export async function defaultResolveAccess(chatId: string): Promise<AuthorizedBotAccess> {
  const normalized = normalizeTelegramChatId(chatId);
  if (!normalized) {
    return { authorized: false, userId: null, userName: null, isSystemAdmin: false };
  }

  const user = await prisma.user.findFirst({
    where: {
      telegramChatId: normalized,
      accessStatus: 'ACTIVE',
    },
    select: {
      id: true,
      username: true,
      telegramName: true,
      telegramUsername: true,
      role: true,
    },
  });

  if (user) {
    return {
      authorized: true,
      userId: user.id,
      userName: user.telegramName || user.telegramUsername || user.username,
      isSystemAdmin: user.role === 'ADMIN',
    };
  }

  const systemChatId = normalizeTelegramChatId(process.env.TELEGRAM_CHAT_ID);
  if (systemChatId && systemChatId === normalized) {
    return {
      authorized: true,
      userId: null,
      userName: 'admin',
      isSystemAdmin: true,
    };
  }

  return { authorized: false, userId: null, userName: null, isSystemAdmin: false };
}

export async function defaultGetLatestSyncJob(): Promise<BotLatestSyncJob | null> {
  return await prisma.syncJob.findFirst({
    orderBy: { startedAt: 'desc' },
    select: {
      status: true,
      startedAt: true,
      endedAt: true,
      channelsTotal: true,
      channelsSucceeded: true,
      channelsFailed: true,
      postsAdded: true,
      durationMs: true,
    },
  });
}

export async function defaultGetUserStatusSummary(userId: number | null): Promise<BotUserStatusSummary> {
  if (userId != null) {
    const [activeChannels, mySub] = await Promise.all([
      prisma.userChannel.count({
        where: { userId, isActive: true, channel: { isActive: true } },
      }),
      prisma.userChannel.findFirst({
        where: { userId, isMine: true },
        include: {
          channel: {
            select: {
              title: true,
              username: true,
              snapshots: {
                orderBy: { collectedAt: 'desc' },
                take: 1,
                select: { membersCount: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      activeChannels,
      myChannel: mySub
        ? {
            title: mySub.channel.title,
            username: mySub.channel.username,
            currentMembers: mySub.channel.snapshots[0]?.membersCount ?? null,
          }
        : null,
    };
  }

  const [activeChannels, myChannel] = await Promise.all([
    prisma.channel.count({ where: { isActive: true } }),
    prisma.channel.findFirst({
      where: { isMine: true },
      select: {
        title: true,
        username: true,
        snapshots: {
          orderBy: { collectedAt: 'desc' },
          take: 1,
          select: { membersCount: true },
        },
      },
    }),
  ]);

  return {
    activeChannels,
    myChannel: myChannel
      ? {
          title: myChannel.title,
          username: myChannel.username,
          currentMembers: myChannel.snapshots[0]?.membersCount ?? null,
        }
      : null,
  };
}

export async function defaultGetDigestExtras(now: Date, userId: number | null): Promise<BotDigestExtras> {
  const since = new Date(now.getTime() - DAY_MS);

  let channelIds: number[] | null = null;
  if (userId != null) {
    const subs = await prisma.userChannel.findMany({
      where: { userId, isActive: true, channel: { isActive: true } },
      select: { channelId: true },
    });
    channelIds = subs.map((item) => item.channelId);
    if (channelIds.length === 0) {
      return { bestPost: null, recentFraudSignals24h: 0 };
    }
  }

  const postWhere = {
    publishedAt: { gte: since, lte: now },
    deletedAt: null,
    ...(channelIds !== null
      ? { channelId: { in: channelIds } }
      : { channel: { isActive: true } }),
  };

  const signalWhere = {
    detectedAt: { gte: since, lte: now },
    ...(channelIds !== null
      ? { channelId: { in: channelIds } }
      : { channel: { isActive: true } }),
  };

  const [posts, recentFraudSignals24h] = await Promise.all([
    prisma.post.findMany({
      where: postWhere,
      select: {
        messageId: true,
        views: true,
        reactions: true,
        comments: true,
        forwards: true,
        text: true,
        channel: { select: { title: true } },
      },
      orderBy: { views: 'desc' },
      take: 100,
    }),
    prisma.fraudSignal.count({ where: signalWhere }),
  ]);

  let bestPost: BotDigestExtras['bestPost'] = null;
  let bestScore = -1;

  for (const post of posts) {
    const views = post.views ?? 0;
    const engagement = (post.reactions ?? 0) + (post.comments ?? 0) + (post.forwards ?? 0);
    const err = views > 0 ? Number(((engagement / views) * 100).toFixed(2)) : null;
    const score = err !== null ? err : views / 1_000_000;
    if (score > bestScore) {
      bestScore = score;
      const cleanText = post.text ? post.text.replace(/\s+/g, ' ').trim() : null;
      const snippet = cleanText && cleanText.length > 72 ? `${cleanText.slice(0, 69)}...` : cleanText;
      bestPost = {
        channelTitle: post.channel.title,
        messageId: post.messageId.toString(),
        err,
        views: post.views,
        snippet,
      };
    }
  }

  return { bestPost, recentFraudSignals24h };
}

export async function defaultFindChannelCardData(
  target: string,
  userId: number | null,
): Promise<BotChannelCardData | null> {
  const cleanUsername = target.replace(/^@+/, '').toLowerCase();
  if (!cleanUsername) return null;

  const channel = await prisma.channel.findFirst({
    where: {
      username: { equals: cleanUsername, mode: 'insensitive' },
    },
    select: {
      id: true,
      title: true,
      username: true,
    },
  });

  if (!channel) return null;

  let isTrackedByUser = true;
  if (userId != null) {
    const sub = await prisma.userChannel.findUnique({
      where: { userId_channelId: { userId, channelId: channel.id } },
      select: { isActive: true },
    });
    isTrackedByUser = Boolean(sub && sub.isActive);
  }

  const now = new Date();
  const date30dAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const scopedUserId = isTrackedByUser ? userId : undefined;

  const [metrics, recentPosts, dailyMetrics, fraudSignals] = await Promise.all([
    calculateChannelMetrics(channel.id, now, scopedUserId),
    prisma.post.findMany({
      where: { channelId: channel.id, publishedAt: { gte: date30dAgo } },
      select: {
        publishedAt: true,
        views: true,
        reactions: true,
        comments: true,
        forwards: true,
        subscribersAtPublish: true,
      },
    }),
    prisma.channelMetricDaily.findMany({
      where: { channelId: channel.id, date: { gte: date30dAgo } },
      orderBy: { date: 'desc' },
      select: { date: true, followers: true },
    }),
    prisma.fraudSignal.findMany({
      where: { channelId: channel.id, detectedAt: { gte: date30dAgo } },
      orderBy: { detectedAt: 'desc' },
    }),
  ]);

  if (!metrics) return null;

  const audit = runFraudAudit({
    id: channel.id,
    posts: recentPosts,
    metrics: dailyMetrics,
    currentMembers: metrics.currentMembers,
    fraudSignals,
  });

  return {
    id: channel.id,
    title: metrics.title,
    username: metrics.username,
    isTrackedByUser,
    currentMembers: metrics.currentMembers,
    delta7dAbs: metrics.delta7d.abs,
    delta7dPercent: metrics.delta7d.percent,
    delta30dAbs: metrics.delta30d.abs,
    delta30dPercent: metrics.delta30d.percent,
    er7d: metrics.er7d,
    err7d: metrics.err7d,
    adShare30dPercent: metrics.adShare30d?.percent ?? null,
    fraudScore: audit.fraudScore,
  };
}

export async function defaultAddChannel(target: string, userId: number | null): Promise<AddChannelCommandResult> {
  const cleanUsername = target.replace(/^@+/, '').toLowerCase();
  const existing = await prisma.channel.findFirst({
    where: { username: { equals: cleanUsername, mode: 'insensitive' } },
    select: { id: true, title: true, username: true, isActive: true },
  });

  if (existing) {
    if (!existing.isActive) {
      await prisma.channel.update({
        where: { id: existing.id },
        data: { isActive: true, consecutiveErrors: 0, lastError: null },
      });
    }
    if (userId != null) {
      await prisma.userChannel.upsert({
        where: { userId_channelId: { userId, channelId: existing.id } },
        update: { isActive: true },
        create: { userId, channelId: existing.id, isActive: true },
      });
    }
    return {
      added: true,
      alreadyExists: true,
      channelId: existing.id,
      title: existing.title,
      username: existing.username,
    };
  }

  return {
    added: false,
    message: `Не удалось автоматически добавить ${target}: обработчик воркера для новых каналов не подключен.`,
  };
}

function parseJsonPrices(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) result.push(trimmed);
    } else if (typeof item === 'number' && Number.isFinite(item)) {
      result.push(String(item));
    }
  }
  return result;
}

export async function defaultListUserEvents(userId: number | null): Promise<BotEventItem[]> {
  let userChannelIds: Set<number> | null = null;
  if (userId != null && typeof prisma.userChannel?.findMany === 'function') {
    const subs = await prisma.userChannel.findMany({
      where: { userId, isActive: true },
      select: { channelId: true },
    });
    userChannelIds = new Set(subs.map((item) => item.channelId));
    if (userChannelIds.size === 0) {
      return [];
    }
  }

  const events = await prisma.event.findMany({
    where: userId != null
      ? {
          dismissedAt: null,
          dismissedByUsers: { none: { userId } },
        }
      : { dismissedAt: null },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: {
      mentions: {
        include: {
          post: {
            select: {
              id: true,
              messageId: true,
              channelId: true,
              text: true,
              channel: {
                select: {
                  title: true,
                  username: true,
                  tgId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const filteredEvents: BotEventItem[] = [];
  for (const event of events) {
    const validMentions: BotEventMention[] = [];
    for (const mention of event.mentions) {
      if (isClearlyEventDigest(mention.post.text)) continue;
      if (userChannelIds && !userChannelIds.has(mention.post.channelId)) continue;
      validMentions.push({
        id: mention.id,
        postId: mention.postId,
        post: {
          messageId: mention.post.messageId.toString(),
          channel: mention.post.channel
            ? {
                title: mention.post.channel.title,
                username: mention.post.channel.username,
                tgId: mention.post.channel.tgId ? mention.post.channel.tgId.toString() : null,
              }
            : null,
        },
      });
    }

    if (userChannelIds && validMentions.length === 0) continue;
    if (event.mentions.length > 0 && validMentions.length === 0) continue;

    const item: BotEventItem = {
      id: event.id,
      title: event.title,
      date: event.date instanceof Date ? event.date : new Date(event.date),
      timeStr: event.timeStr ?? null,
      organizer: event.organizer ?? null,
      prices: parseJsonPrices(event.prices),
      mentions: validMentions,
    };

    const existing = filteredEvents.find((candidate) => isSameEvent(candidate, item));
    if (!existing) {
      filteredEvents.push(item);
      continue;
    }

    const linkedPostIds = new Set(existing.mentions.map((mention) => mention.postId));
    for (const mention of item.mentions) {
      if (!linkedPostIds.has(mention.postId)) {
        existing.mentions.push(mention);
      }
    }
  }

  return filteredEvents;
}

export async function defaultDismissEvent(
  eventId: number,
  userId: number | null,
): Promise<DismissEventCommandResult> {
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return { status: 'invalid_id' };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, dismissedAt: true },
  });
  if (!event) {
    return { status: 'not_found', eventId };
  }

  if (userId != null && typeof prisma.userDismissedEvent?.upsert === 'function') {
    await prisma.userDismissedEvent.upsert({
      where: {
        userId_eventId: {
          userId,
          eventId,
        },
      },
      create: { userId, eventId },
      update: {},
    });
    return { status: 'dismissed', eventId: event.id, title: event.title };
  }

  if (!event.dismissedAt) {
    await prisma.event.update({
      where: { id: eventId },
      data: { dismissedAt: new Date() },
    });
  }

  return { status: 'dismissed', eventId: event.id, title: event.title };
}
