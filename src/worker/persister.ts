import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { ReactionBreakdownItem } from '../lib/types';

export async function addChannelToDb(params: {
  tgId: bigint;
  username: string | null;
  title: string;
  type: string;
  isMine: boolean;
}) {
  return await prisma.$transaction(async (tx) => {
    if (params.isMine) {
      await tx.channel.updateMany({
        where: { isMine: true },
        data: { isMine: false },
      });
    }

    const existing = await tx.channel.findFirst({
      where: {
        OR: [
          { tgId: params.tgId },
          ...(params.username ? [{ username: params.username }] : []),
        ],
      },
    });

    if (existing) {
      return await tx.channel.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          isMine: params.isMine ? true : existing.isMine,
          title: params.title,
          username: params.username,
          type: params.type,
          lastError: null,
        },
      });
    }

    return await tx.channel.create({
      data: {
        tgId: params.tgId,
        username: params.username,
        title: params.title,
        type: params.type,
        isMine: params.isMine,
        isActive: true,
      },
    });
  });
}

export async function updateChannelTitle(channelId: number, title: string) {
  return await prisma.channel.update({
    where: { id: channelId },
    data: { title },
  });
}

export async function saveSnapshot(channelId: number, participantsCount: number) {
  return await prisma.snapshot.create({
    data: {
      channelId,
      membersCount: participantsCount,
      collectedAt: new Date(),
    },
  });
}

export async function getPreviousSnapshot(channelId: number) {
  return await prisma.snapshot.findFirst({
    where: { channelId },
    orderBy: { collectedAt: 'desc' },
  });
}

export async function getActiveChannels() {
  return await prisma.channel.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });
}

export async function updateChannelState(
  channelId: number,
  maxMessageId: bigint,
  oldMaxMessageId: bigint | null
) {
  await prisma.channel.update({
    where: { id: channelId },
    data: {
      lastMessageId: maxMessageId > 0n ? maxMessageId : oldMaxMessageId,
      lastCollectedAt: new Date(),
      lastError: null,
      consecutiveErrors: 0,
    },
  });
}

export async function updateChannelErrorState(
  channelId: number,
  errorMessage: string,
  newErrors: number,
  shouldDisable: boolean
) {
  return await prisma.channel.update({
    where: { id: channelId },
    data: {
      lastError: errorMessage,
      consecutiveErrors: newErrors,
      ...(shouldDisable ? { isActive: false } : {}),
    },
  });
}

export class CollectAlreadyRunningError extends Error {
  constructor() {
    super('Сбор уже выполняется');
    this.name = 'CollectAlreadyRunningError';
  }
}

const COLLECT_LOCK_ID = 420241016;

export async function createSyncJob(totalChannels: number) {
  return prisma.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${COLLECT_LOCK_ID}) AS acquired
    `;
    if (!lock?.acquired) throw new CollectAlreadyRunningError();

    const minutes = Number.parseInt(process.env.HEALTH_STUCK_THRESHOLD_MINUTES || '120', 10);
    const thresholdMs = Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 120 * 60_000;
    const now = new Date();
    const staleBefore = new Date(now.getTime() - thresholdMs);
    await tx.syncJob.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: staleBefore } },
      data: { status: 'FAILED', endedAt: now, errorSummary: 'Прерванный цикл превысил срок ожидания' },
    });
    const active = await tx.syncJob.findFirst({
      where: { status: 'RUNNING', startedAt: { gte: staleBefore } },
      select: { id: true },
    });
    if (active) throw new CollectAlreadyRunningError();

    return tx.syncJob.create({
      data: { startedAt: now, status: 'RUNNING', channelsTotal: totalChannels },
    });
  });
}

export async function markInterruptedSyncJob(syncJobId: number): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: syncJobId } });
  if (!job || job.status !== 'RUNNING') return;
  await prisma.syncJob.updateMany({
    where: { id: syncJobId, status: 'RUNNING' },
    data: {
      status: job.channelsSucceeded > 0 ? 'PARTIAL' : 'FAILED',
      endedAt: new Date(),
      durationMs: Date.now() - job.startedAt.getTime(),
      errorSummary: 'Сбор прерван при остановке worker',
    },
  });
}

export async function updateSyncJobProgress(syncJobId: number, successCount?: number, errorCount?: number, postsAdded?: number) {
  return await prisma.syncJob.updateMany({
    where: { id: syncJobId, status: 'RUNNING' },
    data: {
      ...(successCount !== undefined ? { channelsSucceeded: successCount } : {}),
      ...(errorCount !== undefined ? { channelsFailed: errorCount } : {}),
      ...(postsAdded !== undefined ? { postsAdded } : {}),
    },
  });
}

export async function finalizeSyncJob(
  syncJobId: number,
  durationMs: number,
  successCount: number,
  errorCount: number,
  activeChannelsCount: number,
  totalPosts: number,
  fatalError: string | null,
  interrupted = false,
  errorSummary: string | null = null,
) {
  let finalStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' = 'COMPLETED';
  
  if (interrupted) {
    finalStatus = successCount > 0 ? 'PARTIAL' : 'FAILED';
  } else if (fatalError) {
    finalStatus = 'FAILED';
  } else if (errorCount > 0 && successCount > 0) {
    finalStatus = 'PARTIAL';
  } else if (errorCount > 0 && successCount === 0 && activeChannelsCount > 0) {
    finalStatus = 'FAILED';
  }

  return await prisma.syncJob.updateMany({
    where: { id: syncJobId, status: 'RUNNING' },
    data: {
      endedAt: new Date(),
      durationMs,
      status: finalStatus,
      errorSummary: interrupted ? 'Сбор прерван при остановке worker' : errorSummary,
      channelsSucceeded: successCount,
      channelsFailed: errorCount,
      postsAdded: totalPosts,
    },
  });
}

export async function getExistingGroupPost(channelId: number, groupedId: bigint) {
    return await prisma.post.findFirst({
        where: { channelId, groupedId }
    });
}

export async function upsertPostWithReactions(params: {
    channelId: number;
    messageId: bigint;
    publishedAt: Date;
    views: number | null;
    reactions: number | null;
    reactionBreakdown?: ReactionBreakdownItem[] | null;
    comments: number | null;
    forwards: number | null;
    text: string | null;
    groupedId: bigint | null;
    subscribersAtPublish: number | null;
    isAd?: boolean;
    contentType?: string;
}) {
    const reactionBreakdown = params.reactionBreakdown?.map(item => ({ emoji: item.emoji, count: item.count }));
    const post = await prisma.post.upsert({
        where: {
            channelId_messageId: {
                channelId: params.channelId,
                messageId: params.messageId,
            },
        },
        update: {
            views: params.views ?? undefined,
            reactions: params.reactions ?? undefined,
            reactionBreakdown,
            comments: params.comments ?? undefined,
            forwards: params.forwards ?? undefined,
            text: params.text ?? undefined,
            groupedId: params.groupedId ?? undefined,
            isAd: params.isAd ?? undefined,
            contentType: params.contentType ?? undefined,
        },
        create: {
            channelId: params.channelId,
            messageId: params.messageId,
            publishedAt: params.publishedAt,
            views: params.views,
            reactions: params.reactions,
            reactionBreakdown,
            comments: params.comments,
            forwards: params.forwards,
            text: params.text,
            groupedId: params.groupedId,
            subscribersAtPublish: params.subscribersAtPublish,
            isAd: params.isAd ?? false,
            contentType: params.contentType ?? 'text',
        },
    });

    if (params.views !== null && params.views !== undefined) {
        const now = new Date();
        const postAgeMs = now.getTime() - params.publishedAt.getTime();
        if (postAgeMs >= 0 && postAgeMs <= 72 * 60 * 60 * 1000) {
            const previous = await prisma.postSnapshot.findFirst({
                where: { postId: post.id },
                orderBy: { collectedAt: 'desc' },
                select: { collectedAt: true },
            });
            if (!previous || now.getTime() - previous.collectedAt.getTime() >= 45 * 60 * 1000) {
                await prisma.postSnapshot.create({
                    data: { postId: post.id, views: params.views, collectedAt: now },
                });
            }
        }
    }
    return post;
}

export async function saveMentions(
    postId: number,
    channelId: number,
    mentions: { type: string; targetUsername?: string | null; targetTgId?: bigint | null; targetMessageId?: bigint | null }[]
) {
    if (mentions.length > 0) {
        await prisma.mention.deleteMany({ where: { sourcePostId: postId } });
        await prisma.mention.createMany({
            data: mentions.map(m => ({
                sourcePostId: postId,
                sourceChannelId: channelId,
                targetUsername: m.targetUsername,
                targetTgId: m.targetTgId,
                targetMessageId: m.targetMessageId,
                type: m.type,
            }))
        });
    }
}

export interface FraudSignalState {
  flag: boolean;
  value: number;
  reason: string;
}

export async function saveFraudSignal(channelId: number, signalType: string, state: FraudSignalState): Promise<void> {
  const now = new Date();
  if (!state.flag) {
    await prisma.fraudSignal.deleteMany({
      where: { channelId, signalType, detectedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    });
    return;
  }

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  await prisma.$transaction(async tx => {
    const where = { channelId, signalType, detectedAt: { gte: today, lt: tomorrow } };
    const existing = await tx.fraudSignal.findFirst({
      where,
      orderBy: { detectedAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      await tx.fraudSignal.update({
        where: { id: existing.id },
        data: { value: state.value, reason: state.reason, detectedAt: now },
      });
      await tx.fraudSignal.deleteMany({ where: { ...where, id: { not: existing.id } } });
    } else {
      await tx.fraudSignal.create({
        data: { channelId, signalType, value: state.value, reason: state.reason, detectedAt: now },
      });
    }
  });
}

export async function cleanupOldPostSnapshots(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let deleted = 0;
  for (let batch = 0; batch < 10; batch++) {
    const stale = await prisma.postSnapshot.findMany({
      where: { collectedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 1000,
    });
    if (stale.length === 0) break;
    const result = await prisma.postSnapshot.deleteMany({
      where: { id: { in: stale.map(snapshot => snapshot.id) }, collectedAt: { lt: cutoff } },
    });
    deleted += result.count;
    if (stale.length < 1000) break;
  }
  return deleted;
}
