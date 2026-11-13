import { TelegramClient } from 'telegram';
import { disconnectTelegramClient, getTelegramClient } from './client';
import { materializeDailyMetrics } from '../lib/materialize';
import { calculateChannelMetrics } from '../lib/metrics';
import { checkChannelAlertRules } from '../lib/alerts';
import { formatSyncJobErrorSummary, type SyncChannelFailure } from '../lib/ops';
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
  updateChannelState,
  createSyncJob,
  updateSyncJobProgress,
  finalizeSyncJob,
  getExistingGroupPost,
  upsertPostWithReactions,
  saveMentions,
  updateChannelTitle,
  cleanupOldPostSnapshots,
  cleanupOldPostEngagementHours,
} from './persister';
import { evaluateAndSaveChannelFraudSignals } from './fraud-evaluator';
import { detectAd } from '../lib/adDetector';
import { detectContentType } from '../lib/contentType';
import { readMessageContent } from './message-content';
import { parseMessageReactions } from './message-reactions';
import { extractPostMentions } from './post-mentions';
import { savePostImage } from './post-image';
import {
  sendTelegramRuleAlert,
  handleChannelError,
  isTelegramSessionAuthError,
} from './retry-policy';

export { TelegramTimeoutError };

interface ResolvedTelegramChannelEntity {
  className?: string;
  id?: string;
  username?: string;
  title?: string;
  firstName?: string;
  megagroup?: boolean;
  participantsCount?: number;
}

interface FullChannelResponse {
  fullChat?: { participantsCount?: number };
}

interface FetchMessagesOptions {
  limit: number;
}

function channelEntityFields(value: unknown): ResolvedTelegramChannelEntity {
  if (value === null || typeof value !== 'object') return {};
  const id = 'id' in value ? value.id : undefined;
  return {
    className: 'className' in value && typeof value.className === 'string' ? value.className : undefined,
    id: id === null || id === undefined ? undefined : String(id),
    username: 'username' in value && typeof value.username === 'string' ? value.username : undefined,
    title: 'title' in value && typeof value.title === 'string' ? value.title : undefined,
    firstName: 'firstName' in value && typeof value.firstName === 'string' ? value.firstName : undefined,
    megagroup: 'megagroup' in value && typeof value.megagroup === 'boolean' ? value.megagroup : undefined,
    participantsCount: 'participantsCount' in value && typeof value.participantsCount === 'number'
      ? value.participantsCount : undefined,
  };
}

function fullChannelFields(value: unknown): FullChannelResponse {
  if (value === null || typeof value !== 'object' || !('fullChat' in value)) return {};
  const fullChat = value.fullChat;
  if (fullChat === null || typeof fullChat !== 'object' || !('participantsCount' in fullChat)) return {};
  return { fullChat: {
    participantsCount: typeof fullChat.participantsCount === 'number' ? fullChat.participantsCount : undefined,
  } };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || String(error);
  if (error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message || String(error);
  }
  return String(error);
}

let activeSyncJobId: number | null = null;

export function getActiveSyncJobId(): number | null {
  return activeSyncJobId;
}

export async function addChannelByInput(input: string, isMine = false) {
  const client = await getTelegramClient();
  const entity = channelEntityFields(await resolveChannelEntity(client, input));

  if ((entity.className !== 'Channel' && entity.className !== 'Chat') || !entity.id) {
    throw new Error('Указанный ресурс не является каналом или группой Telegram');
  }

  const tgId = BigInt(entity.id);
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

  const entity = await resolveChannelEntity(client, identifier);
  const entityFields = channelEntityFields(entity);

  // 1. Collect participants count (FullChannel)
  let participantsCount: number | null = null;
  try {
    const full = fullChannelFields(await fetchFullChannel(client, entity, identifier));
    participantsCount = full.fullChat?.participantsCount ?? null;

    if (entityFields.title && entityFields.title !== channel.title) {
      await updateChannelTitle(channel.id, entityFields.title);
    }
  } catch (err: unknown) {
    if (err instanceof TelegramTimeoutError) throw err;
    logger.warn('Could not fetch FullChannel', { channelId: channel.id, title: channel.title }, err);
    if (entityFields.participantsCount) {
      participantsCount = entityFields.participantsCount;
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
    const options: FetchMessagesOptions = { limit: isBackfill ? 1000 : 200 };
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
      
      let parsedReactions: ReturnType<typeof parseMessageReactions> = { reactions: null, reactionBreakdown: null };
      try {
        parsedReactions = parseMessageReactions(msg.reactions);
      } catch (error) {
        logger.warn('Could not read Telegram reactions', { channelId: channel.id, messageId: msg.id }, error);
      }
      let targetMessageId = messageId;
      if (groupedId) {
          const existingGroupPost = await getExistingGroupPost(channel.id, groupedId);
          if (existingGroupPost) targetMessageId = existingGroupPost.messageId;
      }
      const isAlbumChild = targetMessageId !== messageId;

      const adDetection = detectAd(text);
      const isAd = content.available ? adDetection.isAd || adDetection.isPartner : undefined;
      const contentType = detectContentType(msg);

      const post = await upsertPostWithReactions({
        channelId: channel.id,
        messageId: targetMessageId,
        publishedAt,
        views,
        reactions: isAlbumChild ? null : parsedReactions.reactions,
        reactionBreakdown: isAlbumChild ? null : parsedReactions.reactionBreakdown,
        comments,
        forwards: isAlbumChild ? null : forwards,
        text,
        groupedId,
        subscribersAtPublish: participantsCount,
        isAd,
        contentType,
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
  } catch (err: unknown) {
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
  const channelFailures: SyncChannelFailure[] = [];

  try {
    if (signal?.aborted) {
      interrupted = true;
      throw new Error('Collection interrupted before connecting');
    }
    let client: TelegramClient;
    try {
      client = await getTelegramClient();
    } catch (err: unknown) {
      fatalError = errorMessage(err);
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

        await evaluateAndSaveChannelFraudSignals(channel);

        logger.info('Channel processed successfully', { title: channel.title, durationMs: result.durationMs, snapshotsAdded: result.snapshotsAdded, postsAdded: result.postsAdded });
      } catch (err: unknown) {
        if (isTelegramSessionAuthError(err)) {
          fatalError = `Telegram session authorization failed: ${errorMessage(err)}`;
          logger.error('Fatal Telegram session auth error; aborting collection cycle without penalizing channels', {
            channelId: channel.id,
            title: channel.title,
          }, new Error(fatalError));
          await disconnectTelegramClient().catch(() => {});
          break;
        }

        errorCount++;
        channelFailures.push({ channelId: channel.id, message: errorMessage(err) });
        if (syncJobId) {
          await updateSyncJobProgress(syncJobId, undefined, errorCount, undefined).catch((dbErr) => logger.error('SyncJob update failed', undefined, dbErr));
        }

        await handleChannelError(channel, err instanceof Error ? err : new Error(errorMessage(err)));

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
          } catch (reconnectErr: unknown) {
            fatalError = `Failed to reconnect client after timeout: ${errorMessage(reconnectErr)}`;
            logger.error('Fatal reconnect error. Aborting cycle', undefined, new Error(fatalError));
            break;
          }
        }
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) interrupted = true;
    else if (!fatalError) fatalError = errorMessage(err);
  } finally {
    const durationMs = Date.now() - cycleStartTime;
    if (signal?.aborted && successCount + errorCount < activeChannels.length) interrupted = true;
    const databasePassword = (() => {
      try { return new URL(process.env.DATABASE_URL || '').password; } catch { return undefined; }
    })();
    const errorSummary = formatSyncJobErrorSummary(fatalError, channelFailures, [
      process.env.TG_SESSION, process.env.TG_SESSION_LOCAL, process.env.TG_API_HASH,
      process.env.TELEGRAM_BOT_TOKEN, process.env.COLLECT_API_TOKEN,
      process.env.OPENROUTER_API_KEY, process.env.DATABASE_URL, databasePassword,
    ]);
    try {
      await finalizeSyncJob(syncJobId, durationMs, successCount, errorCount, activeChannels.length, totalPosts, fatalError, interrupted, errorSummary)
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
      await cleanupOldPostEngagementHours()
        .then(deleted => {
          if (deleted > 0) logger.info('Old hourly engagement removed', { deleted });
        })
        .catch(error => logger.warn('Hourly engagement cleanup failed', undefined, error));
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
      } catch (err: unknown) {
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
