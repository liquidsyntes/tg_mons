import { Api } from 'telegram';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getTelegramClient } from './client';
import { resolveChannelEntity, withRateLimitAndRetry, withTimeout } from './fetcher';

const CHECKPOINTS = [1, 12, 24, 48]; // hours

export async function runAdReachCycle() {
  logger.info('Starting Ad Reach collection cycle');
  try {
    const now = new Date();
    // Only looking at posts up to 50 hours old
    const cutoff = new Date(now.getTime() - 50 * 60 * 60 * 1000);

    const activeAds = await prisma.post.findMany({
      where: {
        isAd: true,
        publishedAt: { gte: cutoff },
      },
      include: {
        channel: true,
        viewSnapshots: true,
      },
    });

    if (activeAds.length === 0) {
      logger.info('No active ads found for reach collection');
      return;
    }

    // Determine which checkpoints are due for each post
    const postsToFetch: { post: any; dueCheckpoints: number[] }[] = [];

    for (const ad of activeAds) {
      const ageHours = (now.getTime() - ad.publishedAt.getTime()) / (1000 * 60 * 60);
      const dueCheckpoints = CHECKPOINTS.filter((cp) => {
        const isDue = ageHours >= cp - (5 / 60);
        const alreadyHas = ad.viewSnapshots.some((s: any) => s.hoursAfterPost === cp);
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

    const byChannel = new Map<number, { channel: any; tasks: any[] }>();
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
        const entity: any = await resolveChannelEntity(client, identifier);
        const messageIds = tasks.map((t) => Number(t.post.messageId));

        const messages = await withRateLimitAndRetry(() =>
          withTimeout(() => client.getMessages(entity, { ids: messageIds }), 'getMessages', identifier)
        );

        for (const task of tasks) {
          const msg = messages.find((m: any) => m && Number(m.id) === Number(task.post.messageId));
          if (!msg) continue;

          const views = typeof msg.views === 'number' ? msg.views : null;
          if (views === null) continue;

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
            logger.info(`Saved ad reach checkpoint`, { postId: task.post.id, checkpoint: cp, views });
          }
        }
      } catch (err) {
        logger.error(`Failed to collect ad reach for channel ${identifier}`, undefined, err);
      }
    }

    logger.info('Ad Reach collection cycle completed');
  } catch (err) {
    logger.error('Error during Ad Reach collection cycle', undefined, err);
  }
}
