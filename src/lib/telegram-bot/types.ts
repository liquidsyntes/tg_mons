import type { SyncStatus } from '@prisma/client';
import type { DailyDigestSummary } from '../types';

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
