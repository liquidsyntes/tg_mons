import { TelegramClient } from 'telegram';
import { getTelegramClient } from './client';
import { materializeDailyMetrics } from '../lib/materialize';
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
} from './persister';
import {
  sendTelegramAnomalyAlert,
  handleChannelError,
} from './retry-policy';

export { TelegramTimeoutError };

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
    const previousSnapshot = await getPreviousSnapshot(channel.id);
    if (previousSnapshot && previousSnapshot.membersCount > 0) {
      const diff = participantsCount - previousSnapshot.membersCount;
      const diffPercent = (diff / previousSnapshot.membersCount) * 100;
      
      if (Math.abs(diffPercent) >= 1 || Math.abs(diff) >= 500) {
        await sendTelegramAnomalyAlert(channel.title, diff, diffPercent, participantsCount);
      }
    }
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
      const text = msg.message || null;
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

      const extractedMentions: { type: string, targetUsername?: string | null, targetTgId?: any }[] = [];

      if (msg.fwdFrom) {
          const fromId = msg.fwdFrom.fromId;
          if (fromId && fromId.className === 'PeerChannel') {
              extractedMentions.push({ type: 'forward', targetTgId: fromId.channelId ? fromId.channelId.toString() : null });
          }
      }

      if (text) {
          const usernameRegex = /@([a-zA-Z0-9_]{4,})/g;
          let match;
          while ((match = usernameRegex.exec(text)) !== null) {
              const uname = match[1].toLowerCase();
              if (uname !== channel.username?.toLowerCase()) {
                 extractedMentions.push({ type: 'mention', targetUsername: uname });
              }
          }
          const linkRegex = /(?:t\.me\/|telegram\.me\/)([a-zA-Z0-9_]{4,})/g;
          while ((match = linkRegex.exec(text)) !== null) {
              const uname = match[1].toLowerCase();
              if (uname !== channel.username?.toLowerCase() && uname !== 'joinchat') {
                 extractedMentions.push({ type: 'mention', targetUsername: uname });
              }
          }
      }
      
      const uniqueMentionsStr = Array.from(new Set(extractedMentions.map(m => JSON.stringify(m))));
      const uniqueMentions = uniqueMentionsStr.map(s => JSON.parse(s));

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
      });

      await saveMentions(post.id, channel.id, uniqueMentions.map(m => ({
          ...m,
          targetTgId: m.targetTgId ? BigInt(m.targetTgId) : null,
      })));

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

export async function runCollectCycle(): Promise<{
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

  let syncJobId: number | null = null;
  try {
    const job = await createSyncJob(activeChannels.length);
    syncJobId = job.id;
  } catch (err) {
    logger.error('Could not create SyncJob record', undefined, err);
  }

  let successCount = 0;
  let errorCount = 0;
  let totalPosts = 0;
  let totalSnapshots = 0;
  let fatalError: string | null = null;

  try {
    let client: TelegramClient;
    try {
      client = await getTelegramClient();
    } catch (err: any) {
      fatalError = err.message || String(err);
      throw err;
    }

    for (const channel of activeChannels) {
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

        await materializeDailyMetrics(channel.id, 30).catch((err) => {
          logger.error('Materialization failed', { title: channel.title }, err);
        });

        logger.info('Channel processed successfully', { title: channel.title, durationMs: result.durationMs, snapshotsAdded: result.snapshotsAdded, postsAdded: result.postsAdded });
      } catch (err: any) {
        errorCount++;
        if (syncJobId) {
          await updateSyncJobProgress(syncJobId, undefined, errorCount, undefined).catch((dbErr) => logger.error('SyncJob update failed', undefined, dbErr));
        }

        await handleChannelError(channel, err);

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
    if (!fatalError) fatalError = err.message || String(err);
  } finally {
    const durationMs = Date.now() - cycleStartTime;
    if (syncJobId) {
      await finalizeSyncJob(syncJobId, durationMs, successCount, errorCount, activeChannels.length, totalPosts, fatalError)
        .catch((err) => logger.error('Final SyncJob update failed', undefined, err));
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
