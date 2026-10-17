import { TelegramClient } from 'telegram';
import { getTelegramClient } from './client';
import { materializeDailyMetrics } from '../lib/materialize';
import { calculateChannelMetrics } from '../lib/metrics';
import { checkChannelAlertRules } from '../lib/alerts';
import { logger } from '../lib/logger';
import {
  resolveChannelEntity,
  fetchFullChannel,
  fetchChannelMessages,
  TelegramTimeoutError,
  parseChannelIdentifier,
} from './fetcher';
import {
  addChannelToDb,
  getActiveChannels,
  saveSnapshot,
  getPreviousSnapshot,
  updateChannelState,
  createSyncJob,
  updateSyncJobProgress,
  finalizeSyncJob,
  getExistingGroupPost,
  upsertPostWithReactions,
  saveMentions,
  updateChannelTitle,
  saveFraudSignal,
  cleanupOldPostSnapshots,
} from './persister';
import { prisma } from '../lib/prisma';
import { checkViewsToSubsRatio, checkGrowthSmoothness, checkUncorrelatedSpikes, checkUniformReactionRatio } from '../lib/fraudDetector';
import { detectAd } from '../lib/adDetector';
import { readMessageContent } from './message-content';
import { extractPostMentions } from './post-mentions';
import { savePostImage } from './post-image';
import {
  sendTelegramRuleAlert,
  handleChannelError,
} from './retry-policy';

export { TelegramTimeoutError };

let activeSyncJobId: number | null = null;

export function getActiveSyncJobId(): number | null {
  return activeSyncJobId;
}

export async function addChannelByInput(input: string, isMine = false) {
  const client = await getTelegramClient();
  const entity: any = await resolveChannelEntity(client, input);

  if (!entity || (entity.className !== 'Channel' && entity.className !== 'Chat')) {
    throw new Error('Указанный ресурс не является каналом или группой Telegram');
  }

  const tgId = BigInt(entity.id.toString());
  const parsedInput = parseChannelIdentifier(input);
  const username = entity.username || (parsedInput.type === 'username' ? parsedInput.value : null);
  const title = entity.title || entity.firstName || 'Без названия';
  const type = entity.megagroup || entity.className === 'Chat' ? 'group' : 'channel';

  return await addChannelToDb({ tgId, username, title, type, isMine });
}

export async function collectChannelData(
  client: TelegramClient,
  channel: { id: number; title: string; username: string | null; tgId: bigint | null; lastMessageId: bigint | null },
  isBackfill = false
): Promise<{ snapshotsAdded: number; postsAdded: number; durationMs: number }> {
  const startTime = Date.now();
  const identifier = channel.username || (channel.tgId ? channel.tgId.toString() : null);
  if (!identifier) throw new Error(`Channel ${channel.id} has neither username nor tgId`);

  const entity: any = await resolveChannelEntity(client, identifier);

  // 1. Collect participants count (FullChannel)
  let participantsCount: number | null = null;
  try {
    const full: any = await fetchFullChannel(client, entity, identifier);
    participantsCount = full.fullChat?.participantsCount ?? null;

    if (entity.title && entity.title !== channel.title) {
      await updateChannelTitle(channel.id, entity.title);
    }
  } catch (err: any) {
    if (err instanceof TelegramTimeoutError) throw err;
    logger.warn('Could not fetch FullChannel', { channelId: channel.id, title: channel.title }, err);
    if (entity.participantsCount) {
      participantsCount = entity.participantsCount;
    }
  }

  let snapshotsAdded = 0;
  if (participantsCount !== null && participantsCount !== undefined) {
    await saveSnapshot(channel.id, participantsCount);
    snapshotsAdded = 1;
  }

  // 2. Collect Posts
  let postsAdded = 0;
  let maxMessageId = channel.lastMessageId || 0n;
  const thirtyDaysAgoSec = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000);

  try {
    const options: any = { limit: isBackfill ? 1000 : 200 };
    const messages = await fetchChannelMessages(client, entity, options, identifier);

    for (const msg of messages) {
      if (!msg.id) continue;
      const msgDateSec = msg.date;

      if (isBackfill && msgDateSec < thirtyDaysAgoSec) continue;
      if (msg.action && msg.action.className !== 'MessageActionEmpty') continue;

      const messageId = BigInt(msg.id);
      if (messageId > maxMessageId) {
        maxMessageId = messageId;
      }

      const publishedAt = new Date(msgDateSec * 1000);
      const views = typeof msg.views === 'number' ? msg.views : null;
      const content = await readMessageContent(
        msg,
        () => client.getRichMessage(entity, msg.id),
        { channelId: channel.id, messageId: msg.id },
      );
      const text = content.text;
      const forwards = typeof msg.forwards === 'number' ? msg.forwards : null;
      const comments = msg.replies && typeof msg.replies.replies === 'number' ? msg.replies.replies : null;
      const groupedId = msg.groupedId ? BigInt(msg.groupedId.toString()) : null;
      
      let reactions: number | null = null;
      if (msg.reactions && msg.reactions.results) {
         reactions = msg.reactions.results.reduce((acc: number, r: any) => acc + (r.count || 0), 0);
      }

      let targetMessageId = messageId;
      if (groupedId) {
          const existingGroupPost = await getExistingGroupPost(channel.id, groupedId);
          if (existingGroupPost) targetMessageId = existingGroupPost.messageId;
      }

      const adDetection = detectAd(text);
      const isAd = content.available ? adDetection.isAd || adDetection.isPartner : undefined;

      const post = await upsertPostWithReactions({
        channelId: channel.id,
        messageId: targetMessageId,
        publishedAt,
        views,
        reactions,
        comments,
        forwards,
        text,
        groupedId,
        subscribersAtPublish: participantsCount,
        isAd,
      });

      if (content.available) {
        await saveMentions(post.id, channel.id, extractPostMentions(msg, text, channel.username));
      }

      try {
        await savePostImage(client, msg, post.id);
      } catch {
        logger.warn('Could not save Telegram post image', { channelId: channel.id, messageId: msg.id });
      }

      postsAdded++;
    }
  } catch (err: any) {
    if (err instanceof TelegramTimeoutError) throw err;
    logger.warn('Could not fetch messages', { channelId: channel.id, title: channel.title }, err);
  }

  // 3. Update channel state
  await updateChannelState(channel.id, maxMessageId, channel.lastMessageId);

  const durationMs = Date.now() - startTime;
  return { snapshotsAdded, postsAdded, durationMs };
}

export async function runCollectCycle(signal?: AbortSignal): Promise<{
  totalChannels: number;
  successCount: number;
  errorCount: number;
  totalPosts: number;
  totalSnapshots: number;
  durationMs: number;
}> {
  const cycleStartTime = Date.now();
  logger.info('Starting collection cycle');

  const activeChannels = await getActiveChannels();
  logger.info('Found active channels to monitor', { activeChannelsCount: activeChannels.length });

  const job = await createSyncJob(activeChannels.length);
  const syncJobId = job.id;
  activeSyncJobId = syncJobId;

  let successCount = 0;
  let errorCount = 0;
  let totalPosts = 0;
  let totalSnapshots = 0;
  let fatalError: string | null = null;
  let interrupted = false;

  try {
    if (signal?.aborted) {
      interrupted = true;
      throw new Error('Collection interrupted before connecting');
    }
    let client: TelegramClient;
    try {
      client = await getTelegramClient();
    } catch (err: any) {
      fatalError = err.message || String(err);
      throw err;
    }

    for (const channel of activeChannels) {
      if (signal?.aborted) {
        interrupted = true;
        break;
      }
      try {
        logger.info('Processing channel', { title: channel.title, username: channel.username, tgId: channel.tgId, id: channel.id });
        const isInitial = !channel.lastCollectedAt;
        const result = await collectChannelData(client, channel, isInitial);

        successCount++;
        totalPosts += result.postsAdded;
        totalSnapshots += result.snapshotsAdded;

        if (syncJobId) {
          await updateSyncJobProgress(syncJobId, successCount, undefined, totalPosts).catch((dbErr) => logger.error('SyncJob update failed', undefined, dbErr));
        }

        let materialized = true;
        await materializeDailyMetrics(channel.id, 30).catch((err) => {
          materialized = false;
          logger.error('Materialization failed', { title: channel.title }, err);
        });

        if (materialized && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            await checkChannelAlertRules(channel.id, () => calculateChannelMetrics(channel.id), sendTelegramRuleAlert);
          } catch {
            logger.warn('Alert rule evaluation failed', { channelId: channel.id });
          }
        }

        try {
          const recentMetrics = await prisma.channelMetricDaily.findMany({
            where: { channelId: channel.id },
            orderBy: { date: 'desc' },
            take: 30,
          });

          if (recentMetrics.length > 0) {
            const smoothnessResult = checkGrowthSmoothness(recentMetrics);
            await saveFraudSignal(channel.id, 'growth_smoothness', {
              flag: smoothnessResult.flag, value: smoothnessResult.cv, reason: smoothnessResult.reason,
            });

            const sortedDesc = [...recentMetrics].sort((a, b) => b.date.getTime() - a.date.getTime());
            const oldestMetricDate = sortedDesc[sortedDesc.length - 1].date;
            const minDate = new Date(oldestMetricDate.getTime() - 86400000);

            const postsInRange = await prisma.post.findMany({
              where: {
                channelId: channel.id,
                publishedAt: { gte: minDate }
              },
              select: { publishedAt: true }
            });

            const mentionConditions: any[] = [];
            if (channel.username) {
              mentionConditions.push({ targetUsername: channel.username.toLowerCase() });
            }
            if (channel.tgId) {
              mentionConditions.push({ targetTgId: channel.tgId });
            }

            let mentionsDates: Date[] = [];
            if (mentionConditions.length > 0) {
              const mentionsInRange = await prisma.mention.findMany({
                where: {
                  createdAt: { gte: minDate },
                  OR: mentionConditions
                },
                select: { createdAt: true }
              });
              mentionsDates = mentionsInRange.map(m => m.createdAt);
            }

            const postsDates = postsInRange.map(p => p.publishedAt);
            const spikeResult = checkUncorrelatedSpikes(recentMetrics, postsDates, mentionsDates);
            await saveFraudSignal(channel.id, 'uncorrelated_spikes', {
              flag: spikeResult.flag, value: spikeResult.spikesCount, reason: spikeResult.reason,
            });
          } else {
            await saveFraudSignal(channel.id, 'growth_smoothness', { flag: false, value: 0, reason: '' });
            await saveFraudSignal(channel.id, 'uncorrelated_spikes', { flag: false, value: 0, reason: '' });
          }

          const recentPosts = await prisma.post.findMany({
            where: { channelId: channel.id },
            orderBy: { publishedAt: 'desc' },
            take: 30,
            select: { views: true, reactions: true, comments: true, forwards: true, publishedAt: true }
          });

          const latestSnapshot = await getPreviousSnapshot(channel.id);
          const currentMembers = latestSnapshot?.membersCount || 0;

          if (currentMembers > 0) {
            const ratioResult = checkViewsToSubsRatio(recentPosts, currentMembers);
            await saveFraudSignal(channel.id, 'views_to_subs_ratio', {
              flag: ratioResult.flag, value: ratioResult.ratio, reason: ratioResult.reason,
            });
          } else {
            await saveFraudSignal(channel.id, 'views_to_subs_ratio', { flag: false, value: 0, reason: '' });
          }

          const uniformResult = checkUniformReactionRatio(recentPosts);
          await saveFraudSignal(channel.id, 'uniform_err', {
            flag: uniformResult.flag, value: uniformResult.cv, reason: uniformResult.reason,
          });
        } catch (fraudErr) {
          logger.error('Fraud detection failed', { title: channel.title }, fraudErr);
        }

        logger.info('Channel processed successfully', { title: channel.title, durationMs: result.durationMs, snapshotsAdded: result.snapshotsAdded, postsAdded: result.postsAdded });
      } catch (err: any) {
        errorCount++;
        if (syncJobId) {
          await updateSyncJobProgress(syncJobId, undefined, errorCount, undefined).catch((dbErr) => logger.error('SyncJob update failed', undefined, dbErr));
        }

        await handleChannelError(channel, err);

        if (signal?.aborted) {
          interrupted = true;
          break;
        }

        if (err instanceof TelegramTimeoutError) {
          logger.warn('TelegramTimeoutError detected. Attempting to force reconnect client to recover dead socket');
          try {
            await client.disconnect();
            client = await getTelegramClient();
            logger.info('Client reconnected successfully after timeout');
          } catch (reconnectErr: any) {
            fatalError = `Failed to reconnect client after timeout: ${reconnectErr.message}`;
            logger.error('Fatal reconnect error. Aborting cycle', undefined, new Error(fatalError));
            break;
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) interrupted = true;
    else if (!fatalError) fatalError = err.message || String(err);
  } finally {
    const durationMs = Date.now() - cycleStartTime;
    if (signal?.aborted && successCount + errorCount < activeChannels.length) interrupted = true;
    try {
      await finalizeSyncJob(syncJobId, durationMs, successCount, errorCount, activeChannels.length, totalPosts, fatalError, interrupted)
        .catch((err) => logger.error('Final SyncJob update failed', undefined, err));
    } finally {
      activeSyncJobId = null;
    }

    if (!signal?.aborted) {
      await cleanupOldPostSnapshots()
        .then(deleted => {
          if (deleted > 0) logger.info('Old post snapshots removed', { deleted });
        })
        .catch(error => logger.warn('Post snapshot cleanup failed', undefined, error));
    }
    
    const webInternalUrl = process.env.WEB_INTERNAL_URL;
    const token = process.env.COLLECT_API_TOKEN;
    if (webInternalUrl && token) {
      try {
        await fetch(`${webInternalUrl}/api/internal/invalidate-cache`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        logger.info('Successfully invalidated web cache');
      } catch (err: any) {
        logger.warn('Failed to invalidate web cache', undefined, err);
      }
    } else {
       logger.warn('Skipping web cache invalidation: WEB_INTERNAL_URL or COLLECT_API_TOKEN is not set');
    }

    logger.info('Cycle completed', { durationMs, successCount, errorCount, totalSnapshots, totalPosts });
  }

  const durationMs = Date.now() - cycleStartTime;
  return {
    totalChannels: activeChannels.length,
    successCount,
    errorCount,
    totalPosts,
    totalSnapshots,
    durationMs,
  };
}
