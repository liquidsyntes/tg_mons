import { normalizeTelegramChatId } from '../digest';
import type { EventFilterOptions } from '../events/calendar';
import type {
  ParsedBotCommand,
  TelegramBotMessage,
  TelegramBotUpdate,
  TelegramChatRef,
} from './types';

const RESERVED_TME_SEGMENTS = new Set([
  'c',
  'joinchat',
  'addlist',
  'share',
  'iv',
  'proxy',
  'socks',
  'login',
  'bot',
]);

/** Normalizes a `@username`, `t.me/<slug>` URL, or bare slug to `@lowercase_slug`. */
export function normalizeChannelTarget(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([^\s?#]+)(?:[?#].*)?$/i);
  if (urlMatch) {
    const path = urlMatch[1];
    if (path.startsWith('+')) return null;
    const slug = path.split('/')[0]?.trim() ?? '';
    if (!slug || RESERVED_TME_SEGMENTS.has(slug.toLowerCase())) return null;
    if (!/^[a-zA-Z0-9_]{3,64}$/.test(slug)) return null;
    return `@${slug.toLowerCase()}`;
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('+') || trimmed.includes('/') || trimmed.includes('.')) {
    return null;
  }

  const clean = trimmed.replace(/^@+/, '');
  if (!/^[a-zA-Z0-9_]{3,64}$/.test(clean)) return null;
  return `@${clean.toLowerCase()}`;
}

function extractForwardedChat(message: TelegramBotMessage): TelegramChatRef | null {
  return message.forward_origin?.chat
    ?? message.forward_origin?.sender_chat
    ?? message.forward_from_chat
    ?? null;
}

function extractTargetFromFreeText(text: string): string | null {
  const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?[^\s?#)]+/i);
  if (urlMatch) {
    const normalized = normalizeChannelTarget(urlMatch[0]);
    if (normalized) return normalized;
  }

  const mentionMatch = text.match(/(?:^|\s)(@[a-zA-Z0-9_]{3,64})\b/);
  if (mentionMatch) {
    return normalizeChannelTarget(mentionMatch[1]);
  }

  return null;
}

/** Parses an incoming Telegram Bot API update into a structured command or channel lookup request. */
export function parseTelegramBotUpdate(update: TelegramBotUpdate): ParsedBotCommand | null {
  const message = update?.message;
  if (!message || message.chat?.id === undefined || message.chat?.id === null) {
    return null;
  }

  const chatId = normalizeTelegramChatId(String(message.chat.id));
  if (!chatId) {
    return null;
  }

  const forwardedChat = extractForwardedChat(message);
  if (forwardedChat) {
    const forwardedUsername = typeof forwardedChat.username === 'string'
      ? normalizeChannelTarget(forwardedChat.username)
      : null;
    return {
      type: 'channel',
      chatId,
      target: forwardedUsername,
      rawCommand: 'forward',
      forwardedTitle: forwardedChat.title ?? null,
    };
  }

  const rawText = (message.text ?? message.caption ?? '').trim();
  if (!rawText) {
    return null;
  }

  if (rawText.startsWith('/')) {
    const cmdMatch = rawText.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
    if (!cmdMatch) {
      return {
        type: 'unknown',
        chatId,
        target: null,
        rawCommand: rawText.split(/\s+/)[0] ?? null,
      };
    }

    const command = cmdMatch[1].toLowerCase();
    const rawArg = (cmdMatch[2] ?? '').trim();
    const firstArg = rawArg.split(/\s+/)[0] ?? '';

    switch (command) {
      case 'start':
        return { type: 'start', chatId, target: null, rawCommand: '/start' };
      case 'help':
        return { type: 'help', chatId, target: null, rawCommand: '/help' };
      case 'status':
        return { type: 'status', chatId, target: null, rawCommand: '/status' };
      case 'digest':
        return { type: 'digest', chatId, target: null, rawCommand: '/digest' };
      case 'channel':
      case 'check':
      case 'info':
        return {
          type: 'channel',
          chatId,
          target: normalizeChannelTarget(firstArg),
          rawCommand: `/${command}`,
        };
      case 'add':
      case 'watch':
        return {
          type: 'add',
          chatId,
          target: normalizeChannelTarget(firstArg),
          rawCommand: `/${command}`,
        };
      case 'events':
      case 'afisha':
        return {
          type: 'events',
          chatId,
          target: rawArg || null,
          rawCommand: `/${command}`,
        };
      case 'event': {
        const cleanId = firstArg.replace(/^#/, '');
        return {
          type: 'event',
          chatId,
          target: /^[1-9]\d*$/.test(cleanId) ? cleanId : null,
          rawCommand: '/event',
        };
      }
      case 'dismiss':
      case 'hide': {
        const cleanId = firstArg.replace(/^#/, '');
        return {
          type: 'dismiss',
          chatId,
          target: /^[1-9]\d*$/.test(cleanId) ? cleanId : null,
          rawCommand: `/${command}`,
        };
      }
      default:
        return {
          type: 'unknown',
          chatId,
          target: null,
          rawCommand: `/${command}`,
        };
    }
  }

  const freeTextTarget = extractTargetFromFreeText(rawText);
  if (freeTextTarget) {
    return {
      type: 'channel',
      chatId,
      target: freeTextTarget,
      rawCommand: null,
    };
  }

  return null;
}

export const parseBotCommand = parseTelegramBotUpdate;

export function parseEventsCommandFilter(rawArg: string | null): {
  filterOptions: EventFilterOptions;
  label: string;
} {
  const trimmed = rawArg?.trim() ?? '';
  if (!trimmed) {
    return {
      filterOptions: { datePreset: 'all' },
      label: 'все предстоящие',
    };
  }

  const normalized = trimmed.toLocaleLowerCase('ru-RU');
  switch (normalized) {
    case 'today':
    case 'сегодня':
    case 'завтра':
    case 'today_tomorrow':
      return {
        filterOptions: { datePreset: 'today_tomorrow' },
        label: 'сегодня и завтра',
      };
    case 'weekend':
    case 'выходные':
      return {
        filterOptions: { datePreset: 'weekend' },
        label: 'на выходные',
      };
    case 'week':
    case 'неделя':
      return {
        filterOptions: { datePreset: 'week' },
        label: 'на эту неделю',
      };
    case 'month':
    case 'месяц':
      return {
        filterOptions: { datePreset: 'month' },
        label: 'в этом месяце',
      };
    case 'free':
    case 'бесплатно':
      return {
        filterOptions: { datePreset: 'all', freeOnly: true },
        label: 'бесплатные (предстоящие)',
      };
    default:
      return {
        filterOptions: { datePreset: 'all', query: trimmed },
        label: `поиск «${trimmed}»`,
      };
  }
}
