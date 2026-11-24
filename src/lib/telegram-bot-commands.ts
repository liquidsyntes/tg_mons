import type { Prisma, SyncStatus } from '@prisma/client';
import { prisma } from './prisma';
import { buildDailyDigest, formatDailyDigest, normalizeTelegramChatId } from './digest';
import {
  buildGoogleCalendarUrl,
  filterEvents,
  getTelegramPostUrl,
  isFreeEvent,
  type CalendarEventInput,
  type EventFilterOptions,
} from './events/calendar';
import { isClearlyEventDigest } from './events/digest';
import { isSameEvent } from './events/matching';
import { calculateChannelMetrics } from './metrics';
import { runFraudAudit } from './fraudDetector';
import { formatDurationMs } from './ops';
import { getAppTimezone } from './timezone';
import { formatLocalePercent, formatNumber as formatRuNumber } from './utils';
import type { DailyDigestSummary } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;
const MAX_BOT_EVENTS_LIST = 10;
const numberFormat = new Intl.NumberFormat('ru-RU');

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

export type TelegramBotCommandType =
  | 'start'
  | 'help'
  | 'status'
  | 'digest'
  | 'channel'
  | 'add'
  | 'events'
  | 'event'
  | 'dismiss'
  | 'unknown';

export interface TelegramChatRef {
  id?: number | string;
  username?: string;
  title?: string;
  type?: string;
}

export interface TelegramForwardOrigin {
  type?: string;
  chat?: TelegramChatRef;
  sender_chat?: TelegramChatRef;
}

export interface TelegramBotMessage {
  message_id?: number;
  chat?: TelegramChatRef;
  text?: string;
  caption?: string;
  forward_from_chat?: TelegramChatRef;
  forward_origin?: TelegramForwardOrigin;
}

export interface TelegramBotUpdate {
  update_id: number;
  message?: TelegramBotMessage;
}

export interface ParsedBotCommand {
  type: TelegramBotCommandType;
  chatId: string;
  target: string | null;
  rawCommand: string | null;
  forwardedTitle?: string | null;
}

export interface AuthorizedBotAccess {
  authorized: boolean;
  userId: number | null;
  userName: string | null;
  isSystemAdmin: boolean;
}

export interface BotLatestSyncJob {
  status: SyncStatus;
  startedAt: Date;
  endedAt: Date | null;
  channelsTotal: number;
  channelsSucceeded: number;
  channelsFailed: number;
  postsAdded: number;
  durationMs: number | null;
}

export interface BotUserStatusSummary {
  activeChannels: number;
  myChannel: {
    title: string;
    username: string | null;
    currentMembers: number | null;
  } | null;
}

export interface BotDigestExtras {
  bestPost: {
    channelTitle: string;
    messageId: string;
    err: number | null;
    views: number | null;
    snippet: string | null;
  } | null;
  recentFraudSignals24h: number;
}

export interface BotChannelCardData {
  id: number;
  title: string;
  username: string | null;
  isTrackedByUser: boolean;
  currentMembers: number | null;
  delta7dAbs: number | null;
  delta7dPercent: number | null;
  delta30dAbs: number | null;
  delta30dPercent: number | null;
  er7d: number | null;
  err7d: number | null;
  adShare30dPercent: number | null;
  fraudScore: number;
}

export interface AddChannelCommandResult {
  added: boolean;
  alreadyExists?: boolean;
  channelId?: number;
  title?: string;
  username?: string | null;
  message?: string;
}

export interface BotEventMention {
  id: number;
  postId: number;
  post: {
    messageId: string;
    channel: {
      title: string;
      username: string | null;
      tgId: string | null;
    } | null;
  };
}

export interface BotEventItem {
  id: number;
  title: string;
  date: Date;
  timeStr: string | null;
  organizer: string | null;
  prices: string[];
  mentions: BotEventMention[];
}

export interface DismissEventCommandResult {
  status: 'dismissed' | 'not_found' | 'invalid_id';
  eventId?: number;
  title?: string;
}

export interface TelegramBotCommandDeps {
  now?: () => Date;
  appBaseUrl?: string;
  resolveAccess?: (chatId: string) => Promise<AuthorizedBotAccess>;
  getLatestSyncJob?: () => Promise<BotLatestSyncJob | null>;
  getUserStatusSummary?: (userId: number | null) => Promise<BotUserStatusSummary>;
  buildDigest?: (now: Date, userId?: number | null) => Promise<DailyDigestSummary>;
  formatDigest?: (summary: DailyDigestSummary, now: Date) => string;
  getDigestExtras?: (now: Date, userId: number | null) => Promise<BotDigestExtras>;
  findChannelCardData?: (target: string, userId: number | null) => Promise<BotChannelCardData | null>;
  onAddChannel?: (target: string, userId: number | null) => Promise<AddChannelCommandResult>;
  listUserEvents?: (userId: number | null) => Promise<BotEventItem[]>;
  onDismissEvent?: (eventId: number, userId: number | null) => Promise<DismissEventCommandResult>;
}

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

function resolveAppBaseUrl(override?: string): string {
  if (override && override.trim()) {
    return override.trim().replace(/\/+$/, '');
  }
  const publicUrl = process.env.APP_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicUrl) {
    return publicUrl.replace(/\/+$/, '');
  }
  const redirectUri = process.env.TELEGRAM_LOGIN_REDIRECT_URI?.trim();
  if (redirectUri) {
    try {
      const parsed = new URL(redirectUri);
      if (!parsed.hostname.endsWith('example.com')) {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed redirect URI
    }
  }
  const internalUrl = process.env.WEB_INTERNAL_URL?.trim();
  if (internalUrl && !internalUrl.includes('://web:')) {
    return internalUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:4000';
}

function formatSignedDelta(abs: number | null, percent: number | null): string {
  if (abs === null) return 'нет данных';
  const signedAbs = `${abs > 0 ? '+' : ''}${numberFormat.format(abs)}`;
  if (percent === null) return signedAbs;
  const signedPct = `${percent > 0 ? '+' : ''}${numberFormat.format(percent)}%`;
  return `${signedAbs} (${signedPct})`;
}

function formatTimestamp(date: Date | null): string {
  if (!date) return 'не завершен';
  const timeZone = getAppTimezone();
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function translateSyncStatus(status: SyncStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'завершен успешно';
    case 'PARTIAL':
      return 'завершен с ошибками';
    case 'FAILED':
      return 'сбой цикла';
    case 'RUNNING':
      return 'выполняется';
    default:
      return String(status);
  }
}

function formatTrustStatus(fraudScore: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(fraudScore)));
  if (clamped >= 50) return 'высокий риск';
  if (clamped > 0) return 'подозрительный';
  return 'норма';
}

function buildUnauthorizedMessage(chatId: string): string {
  return [
    '🔒 Чат не привязан к аккаунту TgMon.',
    '',
    `Ваш Telegram Chat ID: ${chatId}`,
    '',
    'Как подключить бота:',
    '1. Откройте веб-интерфейс TgMon и перейдите в раздел «Настройки».',
    `2. Укажите ${chatId} в поле «Telegram Chat ID» и сохраните настройки.`,
    '3. Убедитесь, что статус вашей учетной записи активен (ACTIVE).',
  ].join('\n');
}

function buildHelpMessage(chatId: string, userName: string | null): string {
  const greeting = userName ? `TgMon Бот подключен (${userName}, Chat ID: ${chatId})` : `TgMon Бот подключен (Chat ID: ${chatId})`;
  return [
    `🤖 ${greeting}`,
    '',
    'Доступные команды:',
    '/status – статус последнего цикла сбора и сводка по каналам',
    '/digest – экспресс-дайджест аудитории и лучших постов за 24 часа',
    '/channel @username – быстрая карточка метрик канала и индекс доверия',
    '/add @username – добавить канал в мониторинг',
    '/events [today|weekend|week|free|поиск] – афиша предстоящих мероприятий',
    '/event <id> – карточка мероприятия, источники и ссылка в Google Календарь',
    '/dismiss <id> – скрыть мероприятие из афиши',
    '/help – показать эту справку',
    '',
    'Также можно просто переслать пост из публичного канала или отправить ссылку вида https://t.me/channel.',
  ].join('\n');
}

async function defaultResolveAccess(chatId: string): Promise<AuthorizedBotAccess> {
  const normalized = normalizeTelegramChatId(chatId);
  if (!normalized) {
    return { authorized: false, userId: null, userName: null, isSystemAdmin: false };
  }

  const user = await prisma.user.findFirst({
    where: {
      telegramChatId: normalized,
      accessStatus: 'ACTIVE',
    },
    select: {
      id: true,
      username: true,
      telegramName: true,
      telegramUsername: true,
      role: true,
    },
  });

  if (user) {
    return {
      authorized: true,
      userId: user.id,
      userName: user.telegramName || user.telegramUsername || user.username,
      isSystemAdmin: user.role === 'ADMIN',
    };
  }

  const systemChatId = normalizeTelegramChatId(process.env.TELEGRAM_CHAT_ID);
  if (systemChatId && systemChatId === normalized) {
    return {
      authorized: true,
      userId: null,
      userName: 'admin',
      isSystemAdmin: true,
    };
  }

  return { authorized: false, userId: null, userName: null, isSystemAdmin: false };
}

async function defaultGetLatestSyncJob(): Promise<BotLatestSyncJob | null> {
  return await prisma.syncJob.findFirst({
    orderBy: { startedAt: 'desc' },
    select: {
      status: true,
      startedAt: true,
      endedAt: true,
      channelsTotal: true,
      channelsSucceeded: true,
      channelsFailed: true,
      postsAdded: true,
      durationMs: true,
    },
  });
}

async function defaultGetUserStatusSummary(userId: number | null): Promise<BotUserStatusSummary> {
  if (userId != null) {
    const [activeChannels, mySub] = await Promise.all([
      prisma.userChannel.count({
        where: { userId, isActive: true, channel: { isActive: true } },
      }),
      prisma.userChannel.findFirst({
        where: { userId, isMine: true },
        include: {
          channel: {
            select: {
              title: true,
              username: true,
              snapshots: {
                orderBy: { collectedAt: 'desc' },
                take: 1,
                select: { membersCount: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      activeChannels,
      myChannel: mySub
        ? {
            title: mySub.channel.title,
            username: mySub.channel.username,
            currentMembers: mySub.channel.snapshots[0]?.membersCount ?? null,
          }
        : null,
    };
  }

  const [activeChannels, myChannel] = await Promise.all([
    prisma.channel.count({ where: { isActive: true } }),
    prisma.channel.findFirst({
      where: { isMine: true },
      select: {
        title: true,
        username: true,
        snapshots: {
          orderBy: { collectedAt: 'desc' },
          take: 1,
          select: { membersCount: true },
        },
      },
    }),
  ]);

  return {
    activeChannels,
    myChannel: myChannel
      ? {
          title: myChannel.title,
          username: myChannel.username,
          currentMembers: myChannel.snapshots[0]?.membersCount ?? null,
        }
      : null,
  };
}

async function defaultGetDigestExtras(now: Date, userId: number | null): Promise<BotDigestExtras> {
  const since = new Date(now.getTime() - DAY_MS);

  let channelIds: number[] | null = null;
  if (userId != null) {
    const subs = await prisma.userChannel.findMany({
      where: { userId, isActive: true, channel: { isActive: true } },
      select: { channelId: true },
    });
    channelIds = subs.map((item) => item.channelId);
    if (channelIds.length === 0) {
      return { bestPost: null, recentFraudSignals24h: 0 };
    }
  }

  const postWhere = {
    publishedAt: { gte: since, lte: now },
    deletedAt: null,
    ...(channelIds !== null
      ? { channelId: { in: channelIds } }
      : { channel: { isActive: true } }),
  };

  const signalWhere = {
    detectedAt: { gte: since, lte: now },
    ...(channelIds !== null
      ? { channelId: { in: channelIds } }
      : { channel: { isActive: true } }),
  };

  const [posts, recentFraudSignals24h] = await Promise.all([
    prisma.post.findMany({
      where: postWhere,
      select: {
        messageId: true,
        views: true,
        reactions: true,
        comments: true,
        forwards: true,
        text: true,
        channel: { select: { title: true } },
      },
      orderBy: { views: 'desc' },
      take: 100,
    }),
    prisma.fraudSignal.count({ where: signalWhere }),
  ]);

  let bestPost: BotDigestExtras['bestPost'] = null;
  let bestScore = -1;

  for (const post of posts) {
    const views = post.views ?? 0;
    const engagement = (post.reactions ?? 0) + (post.comments ?? 0) + (post.forwards ?? 0);
    const err = views > 0 ? Number(((engagement / views) * 100).toFixed(2)) : null;
    const score = err !== null ? err : views / 1_000_000;
    if (score > bestScore) {
      bestScore = score;
      const cleanText = post.text ? post.text.replace(/\s+/g, ' ').trim() : null;
      const snippet = cleanText && cleanText.length > 72 ? `${cleanText.slice(0, 69)}...` : cleanText;
      bestPost = {
        channelTitle: post.channel.title,
        messageId: post.messageId.toString(),
        err,
        views: post.views,
        snippet,
      };
    }
  }

  return { bestPost, recentFraudSignals24h };
}

async function defaultFindChannelCardData(
  target: string,
  userId: number | null,
): Promise<BotChannelCardData | null> {
  const cleanUsername = target.replace(/^@+/, '').toLowerCase();
  if (!cleanUsername) return null;

  const channel = await prisma.channel.findFirst({
    where: {
      username: { equals: cleanUsername, mode: 'insensitive' },
    },
    select: {
      id: true,
      title: true,
      username: true,
    },
  });

  if (!channel) return null;

  let isTrackedByUser = true;
  if (userId != null) {
    const sub = await prisma.userChannel.findUnique({
      where: { userId_channelId: { userId, channelId: channel.id } },
      select: { isActive: true },
    });
    isTrackedByUser = Boolean(sub && sub.isActive);
  }

  const now = new Date();
  const date30dAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const scopedUserId = isTrackedByUser ? userId : undefined;

  const [metrics, recentPosts, dailyMetrics, fraudSignals] = await Promise.all([
    calculateChannelMetrics(channel.id, now, scopedUserId),
    prisma.post.findMany({
      where: { channelId: channel.id, publishedAt: { gte: date30dAgo } },
      select: {
        publishedAt: true,
        views: true,
        reactions: true,
        comments: true,
        forwards: true,
        subscribersAtPublish: true,
      },
    }),
    prisma.channelMetricDaily.findMany({
      where: { channelId: channel.id, date: { gte: date30dAgo } },
      orderBy: { date: 'desc' },
      select: { date: true, followers: true },
    }),
    prisma.fraudSignal.findMany({
      where: { channelId: channel.id, detectedAt: { gte: date30dAgo } },
      orderBy: { detectedAt: 'desc' },
    }),
  ]);

  if (!metrics) return null;

  const audit = runFraudAudit({
    id: channel.id,
    posts: recentPosts,
    metrics: dailyMetrics,
    currentMembers: metrics.currentMembers,
    fraudSignals,
  });

  return {
    id: channel.id,
    title: metrics.title,
    username: metrics.username,
    isTrackedByUser,
    currentMembers: metrics.currentMembers,
    delta7dAbs: metrics.delta7d.abs,
    delta7dPercent: metrics.delta7d.percent,
    delta30dAbs: metrics.delta30d.abs,
    delta30dPercent: metrics.delta30d.percent,
    er7d: metrics.er7d,
    err7d: metrics.err7d,
    adShare30dPercent: metrics.adShare30d?.percent ?? null,
    fraudScore: audit.fraudScore,
  };
}

async function defaultAddChannel(target: string, userId: number | null): Promise<AddChannelCommandResult> {
  const cleanUsername = target.replace(/^@+/, '').toLowerCase();
  const existing = await prisma.channel.findFirst({
    where: { username: { equals: cleanUsername, mode: 'insensitive' } },
    select: { id: true, title: true, username: true, isActive: true },
  });

  if (existing) {
    if (!existing.isActive) {
      await prisma.channel.update({
        where: { id: existing.id },
        data: { isActive: true, consecutiveErrors: 0, lastError: null },
      });
    }
    if (userId != null) {
      await prisma.userChannel.upsert({
        where: { userId_channelId: { userId, channelId: existing.id } },
        update: { isActive: true },
        create: { userId, channelId: existing.id, isActive: true },
      });
    }
    return {
      added: true,
      alreadyExists: true,
      channelId: existing.id,
      title: existing.title,
      username: existing.username,
    };
  }

  return {
    added: false,
    message: `Не удалось автоматически добавить ${target}: обработчик воркера для новых каналов не подключен.`,
  };
}

function parseJsonPrices(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) result.push(trimmed);
    } else if (typeof item === 'number' && Number.isFinite(item)) {
      result.push(String(item));
    }
  }
  return result;
}

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

async function defaultListUserEvents(userId: number | null): Promise<BotEventItem[]> {
  let userChannelIds: Set<number> | null = null;
  if (userId != null && typeof prisma.userChannel?.findMany === 'function') {
    const subs = await prisma.userChannel.findMany({
      where: { userId, isActive: true },
      select: { channelId: true },
    });
    userChannelIds = new Set(subs.map((item) => item.channelId));
    if (userChannelIds.size === 0) {
      return [];
    }
  }

  const events = await prisma.event.findMany({
    where: userId != null
      ? {
          dismissedAt: null,
          dismissedByUsers: { none: { userId } },
        }
      : { dismissedAt: null },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: {
      mentions: {
        include: {
          post: {
            select: {
              id: true,
              messageId: true,
              channelId: true,
              text: true,
              channel: {
                select: {
                  title: true,
                  username: true,
                  tgId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const filteredEvents: BotEventItem[] = [];
  for (const event of events) {
    const validMentions: BotEventMention[] = [];
    for (const mention of event.mentions) {
      if (isClearlyEventDigest(mention.post.text)) continue;
      if (userChannelIds && !userChannelIds.has(mention.post.channelId)) continue;
      validMentions.push({
        id: mention.id,
        postId: mention.postId,
        post: {
          messageId: mention.post.messageId.toString(),
          channel: mention.post.channel
            ? {
                title: mention.post.channel.title,
                username: mention.post.channel.username,
                tgId: mention.post.channel.tgId ? mention.post.channel.tgId.toString() : null,
              }
            : null,
        },
      });
    }

    if (userChannelIds && validMentions.length === 0) continue;
    if (event.mentions.length > 0 && validMentions.length === 0) continue;

    const item: BotEventItem = {
      id: event.id,
      title: event.title,
      date: event.date instanceof Date ? event.date : new Date(event.date),
      timeStr: event.timeStr ?? null,
      organizer: event.organizer ?? null,
      prices: parseJsonPrices(event.prices),
      mentions: validMentions,
    };

    const existing = filteredEvents.find((candidate) => isSameEvent(candidate, item));
    if (!existing) {
      filteredEvents.push(item);
      continue;
    }

    const linkedPostIds = new Set(existing.mentions.map((mention) => mention.postId));
    for (const mention of item.mentions) {
      if (!linkedPostIds.has(mention.postId)) {
        existing.mentions.push(mention);
      }
    }
  }

  return filteredEvents;
}

async function defaultDismissEvent(
  eventId: number,
  userId: number | null,
): Promise<DismissEventCommandResult> {
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return { status: 'invalid_id' };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, dismissedAt: true },
  });
  if (!event) {
    return { status: 'not_found', eventId };
  }

  if (userId != null && typeof prisma.userDismissedEvent?.upsert === 'function') {
    await prisma.userDismissedEvent.upsert({
      where: {
        userId_eventId: {
          userId,
          eventId,
        },
      },
      create: { userId, eventId },
      update: {},
    });
    return { status: 'dismissed', eventId: event.id, title: event.title };
  }

  if (!event.dismissedAt) {
    await prisma.event.update({
      where: { id: eventId },
      data: { dismissedAt: new Date() },
    });
  }

  return { status: 'dismissed', eventId: event.id, title: event.title };
}

function toCalendarEventInput(event: BotEventItem): CalendarEventInput {
  return {
    id: event.id,
    title: event.title,
    date: event.date.toISOString(),
    timeStr: event.timeStr,
    organizer: event.organizer,
    prices: event.prices,
    mentions: event.mentions,
  };
}

function formatEventDate(date: Date): string {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: isUtcMidnight ? 'UTC' : getAppTimezone(),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatEventsListReply(
  events: BotEventItem[],
  label: string,
  appBaseUrl: string,
): string {
  if (events.length === 0) {
    return [
      `📅 В афише (${label}) сейчас нет подходящих мероприятий.`,
      'Попробуйте /events для просмотра всех предстоящих событий или фильтр /events free.',
      `Веб-афиша: ${appBaseUrl}/events`,
    ].join('\n');
  }

  const visible = events.slice(0, MAX_BOT_EVENTS_LIST);
  const lines: string[] = [
    `📅 Афиша мероприятий (${label}): найдено ${numberFormat.format(events.length)}`,
  ];

  visible.forEach((event, index) => {
    const when = `${formatEventDate(event.date)}${event.timeStr ? `, ${event.timeStr}` : ''}`;
    lines.push('', `${index + 1}. [#${event.id}] ${when} – ${event.title}`);

    const metaParts: string[] = [];
    if (event.organizer) metaParts.push(`📍 ${event.organizer}`);
    if (event.prices.length > 0) {
      metaParts.push(`💰 ${event.prices.join(', ')}`);
    } else if (isFreeEvent(event.prices)) {
      metaParts.push('💰 Бесплатно');
    }
    if (metaParts.length > 0) {
      lines.push(metaParts.join(' | '));
    }

    const firstSourceUrl = event.mentions
      .map((mention) => getTelegramPostUrl(mention.post))
      .find((url): url is string => Boolean(url));
    if (firstSourceUrl) {
      lines.push(`Источник: ${firstSourceUrl}`);
    }
  });

  if (events.length > MAX_BOT_EVENTS_LIST) {
    lines.push('', `Показаны первые ${MAX_BOT_EVENTS_LIST} из ${numberFormat.format(events.length)} событий. Уточните запрос: /events today, /events weekend, /events free или /events <слово>.`);
  }

  lines.push('', `Подробнее: /event <id> | Скрыть: /dismiss <id> | Веб-афиша: ${appBaseUrl}/events`);
  return lines.join('\n');
}

function formatEventDetailReply(event: BotEventItem, appBaseUrl: string): string {
  const when = `${formatEventDate(event.date)}${event.timeStr ? ` (${event.timeStr})` : ''}`;
  const priceText = event.prices.length > 0
    ? `${event.prices.join(', ')}${isFreeEvent(event.prices) ? ' (бесплатно)' : ''}`
    : 'не указана';

  const lines: string[] = [
    `🎫 [#${event.id}] ${event.title}`,
    `Дата: ${when}`,
    `Организатор / место: ${event.organizer || 'не указано'}`,
    `Стоимость: ${priceText}`,
  ];

  const seenUrls = new Set<string>();
  const sourceLines: string[] = [];
  for (const mention of event.mentions) {
    const url = getTelegramPostUrl(mention.post);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const channelTitle = mention.post.channel?.title || 'Канал';
    sourceLines.push(`- ${channelTitle}: ${url}`);
  }

  if (sourceLines.length > 0) {
    lines.push('', 'Источники в Telegram:', ...sourceLines);
  }

  const calendarUrl = buildGoogleCalendarUrl(toCalendarEventInput(event));
  lines.push(
    '',
    `Google Календарь: ${calendarUrl}`,
    `Скрыть из афиши: /dismiss ${event.id}`,
    `Веб-афиша: ${appBaseUrl}/events`,
  );

  return lines.join('\n');
}

function formatStatusReply(job: BotLatestSyncJob | null, summary: BotUserStatusSummary): string {
  const lines = ['📡 Статус мониторинга TgMon'];
  if (!job) {
    lines.push('Последний сбор: еще не запускался');
  } else {
    const syncTime = formatTimestamp(job.endedAt ?? job.startedAt);
    lines.push(
      `Последний сбор: ${translateSyncStatus(job.status)} (${syncTime})`,
      `Обработано каналов: ${numberFormat.format(job.channelsSucceeded)}/${numberFormat.format(job.channelsTotal)} (ошибок: ${numberFormat.format(job.channelsFailed)})`,
      `Новых постов за цикл: ${numberFormat.format(job.postsAdded)}, время цикла: ${formatDurationMs(job.durationMs)}`,
    );
  }

  lines.push(`Активных каналов на мониторинге: ${numberFormat.format(summary.activeChannels)}`);
  if (summary.myChannel) {
    const handle = summary.myChannel.username ? ` (@${summary.myChannel.username})` : '';
    lines.push(
      `Мой канал: ${summary.myChannel.title}${handle} - ${formatRuNumber(summary.myChannel.currentMembers, 'нет данных')} подп.`,
    );
  }
  return lines.join('\n');
}

function formatChannelCardReply(data: BotChannelCardData, appBaseUrl: string): string {
  const handle = data.username ? ` (@${data.username})` : '';
  const trustScore = Math.max(0, Math.min(100, Math.round(100 - data.fraudScore)));
  const trustLabel = formatTrustStatus(data.fraudScore);
  const lines = [
    `📊 ${data.title}${handle}`,
    `Подписчики: ${formatRuNumber(data.currentMembers, 'нет данных')}`,
    `Динамика: 7д ${formatSignedDelta(data.delta7dAbs, data.delta7dPercent)} | 30д ${formatSignedDelta(data.delta30dAbs, data.delta30dPercent)}`,
    `Вовлеченность (7д): ER ${formatLocalePercent(data.er7d, 'нет данных')} | ERR ${formatLocalePercent(data.err7d, 'нет данных')}`,
    `Доля рекламы (30д): ${formatLocalePercent(data.adShare30dPercent, 'нет данных')}`,
    `Индекс доверия (Trust Score): ${trustScore}/100 (${trustLabel})`,
    `Подробнее: ${appBaseUrl}/channel/${data.id}`,
  ];

  if (!data.isTrackedByUser && data.username) {
    lines.push('', `💡 Канал пока не добавлен в ваш список. Отправьте /add @${data.username}, чтобы отслеживать его.`);
  }
  return lines.join('\n');
}

/** Handles a parsed Telegram bot command with authorization checks and returns the text reply. */
export async function handleTelegramBotCommand(
  command: ParsedBotCommand,
  deps: TelegramBotCommandDeps = {},
): Promise<string> {
  const resolveAccess = deps.resolveAccess ?? defaultResolveAccess;
  const access = await resolveAccess(command.chatId);

  if (!access.authorized) {
    return buildUnauthorizedMessage(command.chatId);
  }

  const now = (deps.now ?? (() => new Date()))();
  const appBaseUrl = resolveAppBaseUrl(deps.appBaseUrl);

  switch (command.type) {
    case 'start':
    case 'help':
      return buildHelpMessage(command.chatId, access.userName);

    case 'status': {
      const [job, summary] = await Promise.all([
        (deps.getLatestSyncJob ?? defaultGetLatestSyncJob)(),
        (deps.getUserStatusSummary ?? defaultGetUserStatusSummary)(access.userId),
      ]);
      return formatStatusReply(job, summary);
    }

    case 'digest': {
      const build = deps.buildDigest ?? buildDailyDigest;
      const format = deps.formatDigest ?? formatDailyDigest;
      const extrasLoader = deps.getDigestExtras ?? defaultGetDigestExtras;
      const [summary, extras] = await Promise.all([
        build(now, access.userId ?? undefined),
        extrasLoader(now, access.userId),
      ]);
      const baseText = format(summary, now);
      if (!extras.bestPost) {
        return baseText;
      }
      const postMetric = extras.bestPost.err !== null
        ? `ERR ${extras.bestPost.err.toFixed(2)}%`
        : `${formatRuNumber(extras.bestPost.views, 'нет данных')} просм.`;
      const snippet = extras.bestPost.snippet ? ` - "${extras.bestPost.snippet}"` : '';
      return `${baseText}\nЛучший пост за 24ч: ${extras.bestPost.channelTitle} (${postMetric})${snippet}`;
    }

    case 'channel': {
      if (!command.target) {
        if (command.rawCommand === 'forward') {
          const titleNote = command.forwardedTitle ? ` («${command.forwardedTitle}»)` : '';
          return `У пересланного канала${titleNote} нет публичного @username. Укажите его вручную: /channel @username`;
        }
        return 'Укажите канал для проверки: /channel @username или перешлите пост из публичного канала.';
      }

      const findCard = deps.findChannelCardData ?? defaultFindChannelCardData;
      const cardData = await findCard(command.target, access.userId);
      if (!cardData) {
        return [
          `Канал ${command.target} еще не отслеживается в TgMon.`,
          `Отправьте /add ${command.target}, чтобы добавить его в мониторинг.`,
        ].join('\n');
      }
      return formatChannelCardReply(cardData, appBaseUrl);
    }

    case 'add': {
      if (!command.target) {
        return 'Укажите канал для добавления: /add @username или ссылку https://t.me/username.';
      }

      const addChannel = deps.onAddChannel ?? defaultAddChannel;
      const result = await addChannel(command.target, access.userId);
      if (!result.added) {
        return result.message ?? `Не удалось добавить канал ${command.target}.`;
      }
      const label = result.title ? `«${result.title}»` : command.target;
      const handle = result.username ? ` (@${result.username})` : '';
      const linkLine = result.channelId ? `\nКарточка: ${appBaseUrl}/channel/${result.channelId}` : '';
      if (result.alreadyExists) {
        return `✅ Канал ${label}${handle} подключен к вашему списку мониторинга.${linkLine}`;
      }
      return `✅ Канал ${label}${handle} добавлен в мониторинг и поставлен на сбор метрик.${linkLine}`;
    }

    case 'events': {
      const listEvents = deps.listUserEvents ?? defaultListUserEvents;
      const allEvents = await listEvents(access.userId);
      const { filterOptions, label } = parseEventsCommandFilter(command.target);
      const calendarById = new Map<number, BotEventItem>();
      const calendarInputs = allEvents.map((ev) => {
        calendarById.set(ev.id, ev);
        return toCalendarEventInput(ev);
      });
      const filteredInputs = filterEvents(calendarInputs, filterOptions, now);
      const filteredEvents = filteredInputs
        .map((item) => calendarById.get(item.id))
        .filter((item): item is BotEventItem => Boolean(item));
      return formatEventsListReply(filteredEvents, label, appBaseUrl);
    }

    case 'event': {
      if (!command.target) {
        return 'Укажите ID мероприятия, например: /event 12 (список ID можно посмотреть командой /events).';
      }
      const eventId = Number(command.target);
      const listEvents = deps.listUserEvents ?? defaultListUserEvents;
      const allEvents = await listEvents(access.userId);
      const found = allEvents.find((item) => item.id === eventId);
      if (!found) {
        return `Мероприятие #${command.target} не найдено в актуальной афише. Проверьте список командой /events.`;
      }
      return formatEventDetailReply(found, appBaseUrl);
    }

    case 'dismiss': {
      if (!command.target) {
        return 'Укажите ID мероприятия для скрытия, например: /dismiss 12.';
      }
      const eventId = Number(command.target);
      const dismissEvent = deps.onDismissEvent ?? defaultDismissEvent;
      const result = await dismissEvent(eventId, access.userId);
      if (result.status === 'invalid_id') {
        return 'Некорректный ID мероприятия. Укажите положительное число, например: /dismiss 12.';
      }
      if (result.status === 'not_found') {
        return `Мероприятие #${command.target} не найдено.`;
      }
      const titlePart = result.title ? ` («${result.title}»)` : '';
      return `🗑 Мероприятие #${result.eventId}${titlePart} скрыто из вашей афиши.`;
    }

    case 'unknown':
    default:
      return [
        `Неизвестная команда${command.rawCommand ? `: ${command.rawCommand}` : ''}.`,
        'Отправьте /help, чтобы увидеть список поддерживаемых команд.',
      ].join('\n');
  }
}
