import type { Api } from 'telegram';

export interface PostMention {
  type: string;
  targetUsername?: string;
  targetTgId?: bigint;
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
    mentions.push({ type: 'forward', targetTgId: BigInt(from.channelId.toString()) });
  }
  const usernames = new Set<string>();
  for (const expression of [/@([a-zA-Z0-9_]{4,})/g, /(?:t\.me\/|telegram\.me\/)([a-zA-Z0-9_]{4,})/g]) {
    for (const match of (text || '').matchAll(expression)) {
      const username = match[1].toLowerCase();
      if (username !== sourceUsername?.toLowerCase() && (expression.source.startsWith('@') || username !== 'joinchat')) {
        usernames.add(username);
      }
    }
  }
  for (const targetUsername of usernames) mentions.push({ type: 'mention', targetUsername });
  return mentions;
}
