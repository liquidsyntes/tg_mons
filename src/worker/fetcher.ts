import { Api, TelegramClient } from 'telegram';
import { logger } from '../lib/logger';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function getFloodWaitSeconds(error: unknown): number | null {
  if (error === null || typeof error !== 'object') return null;
  const message = 'errorMessage' in error && typeof error.errorMessage === 'string' ? error.errorMessage : null;
  const floodMatch = message?.match(/FLOOD_WAIT_(\d+)/);
  const seconds = 'seconds' in error && typeof error.seconds === 'number' ? error.seconds : null;
  return seconds || (floodMatch ? Number.parseInt(floodMatch[1], 10) : null);
}

export class TelegramTimeoutError extends Error {
  code: string;
  constructor(operation: string, context?: string) {
    const ctxMsg = context ? ` for ${context}` : '';
    super(`Telegram operation '${operation}' timed out${ctxMsg}`);
    this.name = 'TelegramTimeoutError';
    this.code = 'TELEGRAM_TIMEOUT';
  }
}

export function withTimeout<T>(
  promiseFn: () => Promise<T>,
  operation: string,
  context?: string
): Promise<T> {
  const timeoutMs = parseInt(process.env.TELEGRAM_REQUEST_TIMEOUT_MS || '30000', 10);
  
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TelegramTimeoutError(operation, context));
    }, timeoutMs);

    promiseFn()
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function withRateLimitAndRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sleep(1000 + Math.floor(Math.random() * 300));
      return await fn();
    } catch (err: unknown) {
      const floodSeconds = getFloodWaitSeconds(err);

      if (floodSeconds && attempt < maxRetries - 1) {
        const waitTime = (floodSeconds + 2) * 1000 + Math.floor(Math.random() * 1500);
        logger.warn('FLOOD_WAIT detected', { waitTime, attempt: attempt + 1, maxRetries });
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

export async function resolveChannelEntity(client: TelegramClient, input: string): Promise<Api.TypeEntityLike> {
  const parsed = parseChannelIdentifier(input);

  if (parsed.type === 'invite') {
    // Check invite hash
    const inviteRes = await withRateLimitAndRetry(() =>
      withTimeout(() => client.invoke(new Api.messages.CheckChatInvite({ hash: parsed.value })), 'CheckChatInvite', parsed.value)
    );

    if (inviteRes.className === 'ChatInviteAlready') {
      return inviteRes.chat;
    } else if (inviteRes.className === 'ChatInvite') {
      throw new Error(
        'Аккаунт сборщика еще не вступил в этот приватный канал. Вступите в него перед добавлением.'
      );
    }
    throw new Error('Не удалось получить информацию о приватном канале');
  }

  // Resolve by username or ID
  const entity = await withRateLimitAndRetry(() => 
    withTimeout(() => client.getEntity(parsed.value), 'getEntity', parsed.value)
  );
  return entity;
}

export async function fetchFullChannel(
  client: TelegramClient, entity: Api.TypeEntityLike, identifier: string,
): Promise<Api.messages.ChatFull> {
  return withRateLimitAndRetry(() =>
    withTimeout(() => client.invoke(new Api.channels.GetFullChannel({ channel: entity })), 'GetFullChannel', identifier)
  );
}

export async function fetchChannelMessages(
  client: TelegramClient,
  entity: Api.TypeEntityLike,
  options: Parameters<TelegramClient['getMessages']>[1],
  identifier: string,
): ReturnType<TelegramClient['getMessages']> {
  return withRateLimitAndRetry(() => 
    withTimeout(() => client.getMessages(entity, options), 'getMessages', identifier)
  );
}
