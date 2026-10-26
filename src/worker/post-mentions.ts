import type { Api } from 'telegram';

export interface PostMention {
  type: string;
  targetUsername?: string;
  targetTgId?: bigint;
  targetMessageId?: bigint;
}

/** Shared by ordinary collection and article recovery. */
export function extractPostMentions(
  message: Pick<Api.Message, 'fwdFrom'>,
  text: string | null,
  sourceUsername: string | null,
): PostMention[] {
  const mentions: PostMention[] = [];
  const from = message.fwdFrom?.fromId;
  if (from?.className === 'PeerChannel') {
    const channelPost = message.fwdFrom?.channelPost;
    mentions.push({ type: 'forward', targetTgId: BigInt(from.channelId.toString()),
      ...(typeof channelPost === 'number' && Number.isSafeInteger(channelPost) && channelPost > 0
        ? { targetMessageId: BigInt(channelPost) } : {}) });
  }
  const usernames = new Map<string, bigint | null>();
  for (const expression of [/@([a-zA-Z0-9_]{4,})/g, /(?:t\.me\/|telegram\.me\/)([a-zA-Z0-9_]{4,})/g]) {
    for (const match of (text || '').matchAll(expression)) {
      const username = match[1].toLowerCase();
      if (username !== sourceUsername?.toLowerCase() && (expression.source.startsWith('@') || username !== 'joinchat')) {
        if (!usernames.has(username)) usernames.set(username, null);
      }
    }
  }
  for (const match of (text || '').matchAll(/(?:t\.me\/|telegram\.me\/)([a-zA-Z0-9_]{4,})\/(\d+)/g)) {
    const username = match[1].toLowerCase();
    const messageId = Number(match[2]);
    if (usernames.has(username) && Number.isSafeInteger(messageId) && messageId > 0) {
      usernames.set(username, BigInt(messageId));
    }
  }
  for (const [targetUsername, targetMessageId] of usernames) mentions.push({ type: 'mention', targetUsername,
    ...(targetMessageId === null ? {} : { targetMessageId }) });
  return mentions;
}
