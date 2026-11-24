import { buildDailyDigest, formatDailyDigest } from '../digest';
import { filterEvents } from '../events/calendar';
import { formatNumber as formatRuNumber } from '../utils';
import type {
  BotEventItem,
  ParsedBotCommand,
  TelegramBotCommandDeps,
} from './types';
import { parseEventsCommandFilter } from './parser';
import {
  buildHelpMessage,
  buildUnauthorizedMessage,
  formatChannelCardReply,
  formatEventDetailReply,
  formatEventsListReply,
  formatStatusReply,
  resolveAppBaseUrl,
  toCalendarEventInput,
} from './formatters';
import {
  defaultAddChannel,
  defaultDismissEvent,
  defaultFindChannelCardData,
  defaultGetDigestExtras,
  defaultGetLatestSyncJob,
  defaultGetUserStatusSummary,
  defaultListUserEvents,
  defaultResolveAccess,
} from './queries';

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
