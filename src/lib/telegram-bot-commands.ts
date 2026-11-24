/**
 * Тонкий фасад публичного API Telegram-бота.
 * Реализация вынесена в ./telegram-bot/{types,parser,formatters,queries,handler}.
 */

export type {
  TelegramBotCommandType,
  TelegramChatRef,
  TelegramForwardOrigin,
  TelegramBotMessage,
  TelegramBotUpdate,
  ParsedBotCommand,
  AuthorizedBotAccess,
  BotLatestSyncJob,
  BotUserStatusSummary,
  BotDigestExtras,
  BotChannelCardData,
  AddChannelCommandResult,
  BotEventMention,
  BotEventItem,
  DismissEventCommandResult,
  TelegramBotCommandDeps,
} from './telegram-bot/types';

export {
  normalizeChannelTarget,
  parseTelegramBotUpdate,
  parseBotCommand,
  parseEventsCommandFilter,
} from './telegram-bot/parser';

export { handleTelegramBotCommand } from './telegram-bot/handler';
