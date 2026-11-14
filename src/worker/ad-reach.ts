import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getTelegramClient } from './client';
import { resolveChannelEntity, withRateLimitAndRetry, withTimeout } from './fetcher';

export const AD_REACH_CHECKPOINTS = [1, 12, 24, 48] as const;

interface AdReachChannelInfo {
  id: number;
  username: string | null;
  tgId: bigint | null;
}

interface AdReachPostRecord {
  id: number;
  channelId: number;
  messageId: bigint;
  publishedAt: Date;
  views: number | null;
  deletedAt: Date | null;
  deletedAfterHours: number | null;
  channel: AdReachChannelInfo;
  viewSnapshots: Array<{ hoursAfterPost: number }>;
}

interface DueAdReachTask {
  post: AdReachPostRecord;
  dueCheckpoints: number[];
}

interface TelegramMessageCandidate {
  id?: unknown;
  className?: unknown;
  views?: unknown;
}

/**
 * Определяет, что сообщение удалено в Telegram при успешном ответе канала:
 * отсутствует в ответе или имеет className === 'MessageEmpty'.
 */
export function isDeletedTelegramMessage(msg: unknown): boolean {
  if (msg === null || msg === undefined) {
    return true;
  }
  if (typeof msg === 'object' && 'className' in msg) {
    const className = (msg as TelegramMessageCandidate).className;
    if (className === 'MessageEmpty') {
      return true;
    }
  }
  return false;
}

function findMatchingMessage(messages: unknown[], targetMessageId: bigint): TelegramMessageCandidate | undefined {
  const expectedId = Number(targetMessageId);
  for (const item of messages) {
    if (item === null || typeof item !== 'object') continue;
    const candidate = item as TelegramMessageCandidate;
    if (candidate.id !== undefined && candidate.id !== null && Number(candidate.id) === expectedId) {
      return candidate;
    }
  }
  return undefined;
}

export async function runAdReachCycle(now: Date = new Date()): Promise<void> {
  logger.info('Starting Ad Reach collection cycle');
  try {
    // Окно 56 часов захватывает чекпоинт 48ч с запасом на случай пропусков cron.
    const cutoff = new Date(now.getTime() - 56 * 60 * 60 * 1000);

    const activeAds = (await prisma.post.findMany({
      where: {
        isAd: true,
        deletedAt: null,
        publishedAt: { gte: cutoff },
      },
      include: {
        channel: true,
        viewSnapshots: true,
      },
    })) as AdReachPostRecord[];

    if (activeAds.length === 0) {
      logger.info('No active ads found for reach collection');
      return;
    }

    const postsToFetch: DueAdReachTask[] = [];

    for (const ad of activeAds) {
      const ageHours = (now.getTime() - ad.publishedAt.getTime()) / (1000 * 60 * 60);
      const dueCheckpoints = AD_REACH_CHECKPOINTS.filter((cp) => {
        const isDue = ageHours >= cp - 5 / 60;
        const alreadyHas = ad.viewSnapshots.some((s) => s.hoursAfterPost === cp);
        return isDue && !alreadyHas;
      });

      if (dueCheckpoints.length > 0) {
        postsToFetch.push({ post: ad, dueCheckpoints });
      }
    }

    if (postsToFetch.length === 0) {
      logger.info('No new checkpoints due for active ads');
      return;
    }

    const client = await getTelegramClient();

    const byChannel = new Map<number, { channel: AdReachChannelInfo; tasks: DueAdReachTask[] }>();
    for (const item of postsToFetch) {
      const cid = item.post.channelId;
      if (!byChannel.has(cid)) {
        byChannel.set(cid, { channel: item.post.channel, tasks: [] });
      }
      byChannel.get(cid)!.tasks.push(item);
    }

    for (const [channelId, data] of byChannel.entries()) {
      const { channel, tasks } = data;
      const identifier = channel.username || channel.tgId?.toString();
      if (!identifier) continue;

      try {
        const entity = await resolveChannelEntity(client, identifier);
        const messageIds = tasks.map((t) => Number(t.post.messageId));

        const messages = await withRateLimitAndRetry(() =>
          withTimeout(() => client.getMessages(entity, { ids: messageIds }), 'getMessages', identifier),
        );

        if (!Array.isArray(messages)) {
          logger.warn('Unexpected getMessages response shape for ad reach check', { channelId, identifier });
          continue;
        }

        for (const task of tasks) {
          try {
            const msg = findMatchingMessage(messages, task.post.messageId);

            if (isDeletedTelegramMessage(msg)) {
              const detectedCheckpoint = Math.min(...task.dueCheckpoints);
              if (typeof prisma.post?.update === 'function') {
                await prisma.post.update({
                  where: { id: task.post.id },
                  data: {
                    deletedAt: task.post.deletedAt ?? now,
                    deletedAfterHours: task.post.deletedAfterHours ?? detectedCheckpoint,
                    lastCheckedAt: now,
                  },
                });
              }
              logger.info('Detected deleted ad post at checkpoint', {
                postId: task.post.id,
                channelId,
                checkpoint: detectedCheckpoint,
              });
              continue;
            }

            const views = msg && typeof msg.views === 'number' ? msg.views : null;
            if (views !== null) {
              for (const cp of task.dueCheckpoints) {
                await prisma.postViewSnapshot.upsert({
                  where: {
                    postId_hoursAfterPost: {
                      postId: task.post.id,
                      hoursAfterPost: cp,
                    },
                  },
                  update: { viewsCount: views, capturedAt: now },
                  create: {
                    postId: task.post.id,
                    hoursAfterPost: cp,
                    viewsCount: views,
                    capturedAt: now,
                  },
                });
                logger.info('Saved ad reach checkpoint', { postId: task.post.id, checkpoint: cp, views });
              }
            }

            if (typeof prisma.post?.update === 'function') {
              const previousViews = typeof task.post.views === 'number' ? task.post.views : 0;
              await prisma.post.update({
                where: { id: task.post.id },
                data: {
                  lastCheckedAt: now,
                  ...(views !== null ? { views: Math.max(previousViews, views) } : {}),
                },
              });
            }
          } catch (taskErr) {
            logger.warn('Failed to process ad reach post checkpoint', { postId: task.post.id, channelId }, taskErr);
          }
        }
      } catch (err) {
        // Сетевые сбои, таймауты и FLOOD_WAIT не должны приводить к ложной пометке deletedAt.
        logger.error(`Failed to collect ad reach for channel ${identifier}`, { channelId }, err);
      }
    }

    logger.info('Ad Reach collection cycle completed');
  } catch (err) {
    logger.error('Error during Ad Reach collection cycle', undefined, err);
  }
}
