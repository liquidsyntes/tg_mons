import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

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

export async function createSyncJob(totalChannels: number) {
  return await prisma.syncJob.create({
    data: {
      startedAt: new Date(),
      status: 'RUNNING',
      channelsTotal: totalChannels,
    },
  });
}

export async function updateSyncJobProgress(syncJobId: number, successCount?: number, errorCount?: number, postsAdded?: number) {
  return await prisma.syncJob.update({
    where: { id: syncJobId },
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
  fatalError: string | null
) {
  let finalStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' = 'COMPLETED';
  
  if (fatalError) {
    finalStatus = 'FAILED';
  } else if (errorCount > 0 && successCount > 0) {
    finalStatus = 'PARTIAL';
  } else if (errorCount > 0 && successCount === 0 && activeChannelsCount > 0) {
    finalStatus = 'FAILED';
  }

  return await prisma.syncJob.update({
    where: { id: syncJobId },
    data: {
      endedAt: new Date(),
      durationMs,
      status: finalStatus,
      errorSummary: fatalError ? fatalError.substring(0, 200) : null,
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
    comments: number | null;
    forwards: number | null;
    text: string | null;
    groupedId: bigint | null;
    subscribersAtPublish: number | null;
}) {
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
            comments: params.comments ?? undefined,
            forwards: params.forwards ?? undefined,
            text: params.text ?? undefined,
            groupedId: params.groupedId ?? undefined,
        },
        create: params,
    });

    if (params.views !== null && params.views !== undefined) {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (params.publishedAt.getTime() > sevenDaysAgo) {
            await prisma.postSnapshot.create({
                data: {
                    postId: post.id,
                    views: params.views,
                }
            });
        }
    }
    return post;
}

export async function saveMentions(
    postId: number,
    channelId: number,
    mentions: { type: string; targetUsername?: string | null; targetTgId?: bigint | null }[]
) {
    if (mentions.length > 0) {
        await prisma.mention.deleteMany({ where: { sourcePostId: postId } });
        await prisma.mention.createMany({
            data: mentions.map(m => ({
                sourcePostId: postId,
                sourceChannelId: channelId,
                targetUsername: m.targetUsername,
                targetTgId: m.targetTgId,
                type: m.type,
            }))
        });
    }
}

export async function saveFraudSignal(
  channelId: number,
  signalType: string,
  value: number,
  reason: string
) {
  return await prisma.fraudSignal.create({
    data: {
      channelId,
      signalType,
      value,
      reason,
    },
  });
}
