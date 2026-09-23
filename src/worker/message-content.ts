import { Api, Rich } from 'telegram';
import { logger } from '../lib/logger';
import { withRateLimitAndRetry, withTimeout } from './fetcher';

type ContentMessage = Pick<Api.Message, 'message' | 'media' | 'richMessage'>;

export interface MessageContent {
  text: string | null;
  available: boolean;
}

/** Partial articles must never replace the complete text already stored. */
export async function readMessageContent(
  message: ContentMessage,
  loadFull: () => Promise<ContentMessage | undefined>,
  context: { channelId: number; messageId: number },
): Promise<MessageContent> {
  if (!message.richMessage) {
    const text = message.message?.trim() ? message.message : null;
    const unsupported = message.media?.className === 'MessageMediaUnsupported';
    if (unsupported) logger.warn('Unsupported Telegram message content', context);
    return { text, available: !unsupported };
  }

  try {
    let richMessage = message.richMessage;
    if (richMessage.part) {
      const full = await withRateLimitAndRetry(() => withTimeout(loadFull, 'getRichMessage'));
      if (!full?.richMessage || full.richMessage.part) {
        throw new Error('Incomplete rich message');
      }
      richMessage = full.richMessage;
    }
    const text = Rich.toPlainText(richMessage).trim();
    return { text: text || null, available: true };
  } catch {
    // Error objects can include Telegram payloads; log identifiers only.
    logger.warn('Could not read complete Telegram article', context);
    return { text: null, available: false };
  }
}
