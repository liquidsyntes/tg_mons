import { Api, TelegramClient } from 'telegram';
import { prisma } from '../lib/prisma';
import { getTelegramClient } from './client';

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function sendTelegramAlert(channelTitle: string, diff: number, diffPercent: number, currentMembers: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const sign = diff > 0 ? '+' : '';
  const emoji = diff > 0 ? '🚀' : '🔻';
  const text = `${emoji} <b>Аномалия в канале "${channelTitle}"!</b>\n\nИзменение: ${sign}${diff} подписчиков (${sign}${diffPercent.toFixed(2)}%)\nТекущая аудитория: ${currentMembers}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('[Alert] Telegram alert failed:', err);
  }
}

export async function withRateLimitAndRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sleep(1000 + Math.floor(Math.random() * 300));
      return await fn();
    } catch (err: any) {
      const floodMatch = err.errorMessage?.match(/FLOOD_WAIT_(\d+)/);
      const floodSeconds = err.seconds || (floodMatch ? parseInt(floodMatch[1], 10) : null);

      if (floodSeconds && attempt < maxRetries - 1) {
        const waitTime = (floodSeconds + 2) * 1000 + Math.floor(Math.random() * 1500);
        console.warn(`[RateLimit] FLOOD_WAIT detected: sleeping for ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(waitTime);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export function parseChannelIdentifier(input: string): { type: 'username' | 'invite' | 'id'; value: string } {
  const trimmed = input.trim();

  // Invite link: https://t.me/+hash or https://t.me/joinchat/hash
  const inviteMatch = trimmed.match(/(?:t\.me\/\+|t\.me\/joinchat\/)([a-zA-Z0-9_-]+)/);
  if (inviteMatch) {
    return { type: 'invite', value: inviteMatch[1] };
  }

  // URL with username: https://t.me/username
  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/([a-zA-Z0-9_]{4,})/);
  if (urlMatch) {
    return { type: 'username', value: urlMatch[1] };
  }

  // @username or plain username
  const cleanUsername = trimmed.replace(/^@/, '');
  if (/^[a-zA-Z0-9_]{4,}$/.test(cleanUsername)) {
    return { type: 'username', value: cleanUsername };
  }

  // Plain numeric ID
  if (/^-?\d+$/.test(trimmed)) {
    return { type: 'id', value: trimmed };
  }

  return { type: 'username', value: cleanUsername };
}

export async function resolveChannelEntity(client: TelegramClient, input: string) {
  const parsed = parseChannelIdentifier(input);

  if (parsed.type === 'invite') {
    // Check invite hash
    const inviteRes = await withRateLimitAndRetry(() =>
      client.invoke(new Api.messages.CheckChatInvite({ hash: parsed.value }))
    );

    if (inviteRes.className === 'ChatInviteAlready') {
      const chat = (inviteRes as any).chat;
      return chat;
    } else if (inviteRes.className === 'ChatInvite') {
      throw new Error(
        'Аккаунт сборщика еще не вступил в этот приватный канал. Вступите в него перед добавлением.'
      );
    }
    throw new Error('Не удалось получить информацию о приватном канале');
  }

  // Resolve by username or ID
  const entity = await withRateLimitAndRetry(() => client.getEntity(parsed.value));
  return entity;
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

  // Transactionally handle isMine if set
  const channel = await prisma.$transaction(async (tx) => {
    if (isMine) {
      await tx.channel.updateMany({
        where: { isMine: true },
        data: { isMine: false },
      });
    }

    const existing = await tx.channel.findFirst({
      where: {
        OR: [
          { tgId },
          ...(username ? [{ username }] : []),
        ],
      },
    });

    if (existing) {
      return await tx.channel.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          isMine: isMine ? true : existing.isMine,
          title,
          username,
          type,
          lastError: null,
        },
      });
    }

    return await tx.channel.create({
      data: {
        tgId,
        username,
        title,
        type,
        isMine,
        isActive: true,
      },
    });
  });

  // Run initial backfill asynchronously or synchronously
  return channel;
}

export async function collectChannelData(
  client: TelegramClient,
  channelId: number,
  isBackfill = false
): Promise<{ snapshotsAdded: number; postsAdded: number; durationMs: number }> {
  const startTime = Date.now();
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error(`Channel ${channelId} not found in DB`);

  const identifier = channel.username || (channel.tgId ? channel.tgId.toString() : null);
  if (!identifier) throw new Error(`Channel ${channelId} has neither username nor tgId`);

  const entity: any = await resolveChannelEntity(client, identifier);

  // 1. Collect participants count (FullChannel)
  let participantsCount: number | null = null;
  try {
    const full: any = await withRateLimitAndRetry(() =>
      client.invoke(new Api.channels.GetFullChannel({ channel: entity }))
    );
    participantsCount = full.fullChat?.participantsCount ?? null;

    // Metadata update (title, type)
    if (entity.title && entity.title !== channel.title) {
      await prisma.channel.update({
        where: { id: channel.id },
        data: { title: entity.title },
      });
    }
  } catch (err: any) {
    console.warn(`[Collector] Could not fetch FullChannel for ${channel.title}: ${err.message}`);
    // Some basic groups may store participantsCount directly on entity
    if (entity.participantsCount) {
      participantsCount = entity.participantsCount;
    }
  }

  let snapshotsAdded = 0;
  if (participantsCount !== null && participantsCount !== undefined) {
    const previousSnapshot = await prisma.snapshot.findFirst({
      where: { channelId: channel.id },
      orderBy: { collectedAt: 'desc' },
    });

    if (previousSnapshot && previousSnapshot.membersCount > 0) {
      const diff = participantsCount - previousSnapshot.membersCount;
      const diffPercent = (diff / previousSnapshot.membersCount) * 100;
      
      // Аномалия: изменение больше 1% или больше 500 человек за один цикл сбора
      if (Math.abs(diffPercent) >= 1 || Math.abs(diff) >= 500) {
        await sendTelegramAlert(channel.title, diff, diffPercent, participantsCount);
      }
    }

    await prisma.snapshot.create({
      data: {
        channelId: channel.id,
        membersCount: participantsCount,
        collectedAt: new Date(),
      },
    });
    snapshotsAdded = 1;
  }

  // 2. Collect Posts
  let postsAdded = 0;
  let maxMessageId = channel.lastMessageId ? BigInt(channel.lastMessageId) : BigInt(0);

  const thirtyDaysAgoSec = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000);
  const minId = (!isBackfill && channel.lastMessageId) ? Number(channel.lastMessageId) : undefined;

  try {
    const options: any = { limit: isBackfill ? 1000 : 200 };
    if (minId) {
      options.minId = minId;
    }

    const messages = await withRateLimitAndRetry(() => client.getMessages(entity, options));

    for (const msg of messages) {
      if (!msg.id) continue;
      const msgDateSec = msg.date;

      // If backfilling, only collect posts up to 30 days old
      if (isBackfill && msgDateSec < thirtyDaysAgoSec) {
        continue;
      }

      // Filter out action / service messages if needed
      if (msg.action && msg.action.className !== 'MessageActionEmpty') {
        continue;
      }

      const messageId = BigInt(msg.id);
      if (messageId > maxMessageId) {
        maxMessageId = messageId;
      }

      const publishedAt = new Date(msgDateSec * 1000);
      const views = typeof msg.views === 'number' ? msg.views : null;
      const text = msg.message || null;

      // Extract mentions
      const extractedMentions: { type: string, targetUsername?: string | null, targetTgId?: any }[] = [];

      // 1. Forward
      if (msg.fwdFrom) {
          const fromId = msg.fwdFrom.fromId;
          if (fromId && fromId.className === 'PeerChannel') {
              extractedMentions.push({
                  type: 'forward',
                  targetTgId: fromId.channelId,
              });
          }
      }

      // 2. Text mentions
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

      const post = await prisma.post.upsert({
        where: {
          channelId_messageId: {
            channelId: channel.id,
            messageId,
          },
        },
        update: {
          views: views ?? undefined,
          text: text ?? undefined,
        },
        create: {
          channelId: channel.id,
          messageId,
          publishedAt,
          views,
          text,
        },
      });

      if (views !== null && views !== undefined) {
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (publishedAt.getTime() > sevenDaysAgo) {
              await prisma.postSnapshot.create({
                  data: {
                      postId: post.id,
                      views,
                  }
              });
          }
      }

      if (uniqueMentions.length > 0) {
          await prisma.mention.deleteMany({ where: { sourcePostId: post.id } });
          await prisma.mention.createMany({
              data: uniqueMentions.map(m => ({
                  sourcePostId: post.id,
                  sourceChannelId: channel.id,
                  targetUsername: m.targetUsername,
                  targetTgId: m.targetTgId ? BigInt(m.targetTgId) : null,
                  type: m.type,
              }))
          });
      }

      postsAdded++;
    }
  } catch (err: any) {
    console.warn(`[Collector] Could not fetch messages for ${channel.title}: ${err.message}`);
  }

  // 3. Update channel state
  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      lastMessageId: maxMessageId > BigInt(0) ? maxMessageId : channel.lastMessageId,
      lastCollectedAt: new Date(),
      lastError: null,
    },
  });

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
  console.log(`[Collector] === Starting collection cycle at ${new Date().toISOString()} ===`);

  let client: TelegramClient;
  try {
    client = await getTelegramClient();
  } catch (err: any) {
    console.error(`[Collector] Telegram client initialization error: ${err.message}`);
    throw err;
  }

  // Fetch active channels
  const activeChannels = await prisma.channel.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });

  console.log(`[Collector] Found ${activeChannels.length} active channels to monitor`);

  let successCount = 0;
  let errorCount = 0;
  let totalPosts = 0;
  let totalSnapshots = 0;

  for (const channel of activeChannels) {
    const channelStartTime = Date.now();
    try {
      console.log(`[Collector] Processing channel: "${channel.title}" (@${channel.username || channel.tgId || channel.id})...`);
      const isInitial = !channel.lastCollectedAt;
      const result = await collectChannelData(client, channel.id, isInitial);

      successCount++;
      totalPosts += result.postsAdded;
      totalSnapshots += result.snapshotsAdded;

      console.log(
        `[Collector] ✓ "${channel.title}" done in ${result.durationMs}ms | Snapshots: ${result.snapshotsAdded}, Posts: ${result.postsAdded}`
      );
    } catch (err: any) {
      errorCount++;
      const errorMessage = err.message || String(err);
      console.error(`[Collector] ✗ Failed for "${channel.title}": ${errorMessage}`);

      // Isolate error: save to DB and continue next channel
      await prisma.channel.update({
        where: { id: channel.id },
        data: {
          lastError: errorMessage,
        },
      }).catch((dbErr) => console.error('[Collector] Could not update channel error status:', dbErr));
    }
  }

  const durationMs = Date.now() - cycleStartTime;
  console.log(
    `[Collector] === Cycle completed in ${(durationMs / 1000).toFixed(1)}s | Success: ${successCount}, Errors: ${errorCount}, Snapshots: ${totalSnapshots}, Posts: ${totalPosts} ===\n`
  );

  return {
    totalChannels: activeChannels.length,
    successCount,
    errorCount,
    totalPosts,
    totalSnapshots,
    durationMs,
  };
}
