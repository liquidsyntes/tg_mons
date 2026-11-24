import type { SyncStatus } from '@prisma/client';
import {
  buildGoogleCalendarUrl,
  getTelegramPostUrl,
  isFreeEvent,
  type CalendarEventInput,
} from '../events/calendar';
import { formatDurationMs } from '../ops';
import { getAppTimezone } from '../timezone';
import { formatLocalePercent, formatNumber as formatRuNumber } from '../utils';
import type {
  BotChannelCardData,
  BotEventItem,
  BotLatestSyncJob,
  BotUserStatusSummary,
} from './types';

const MAX_BOT_EVENTS_LIST = 10;
const numberFormat = new Intl.NumberFormat('ru-RU');

export function resolveAppBaseUrl(override?: string): string {
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

export function buildUnauthorizedMessage(chatId: string): string {
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

export function buildHelpMessage(chatId: string, userName: string | null): string {
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

export function toCalendarEventInput(event: BotEventItem): CalendarEventInput {
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

export function formatEventsListReply(
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

export function formatEventDetailReply(event: BotEventItem, appBaseUrl: string): string {
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

export function formatStatusReply(job: BotLatestSyncJob | null, summary: BotUserStatusSummary): string {
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

export function formatChannelCardReply(data: BotChannelCardData, appBaseUrl: string): string {
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
