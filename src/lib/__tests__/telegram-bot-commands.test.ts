import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channel as fixtureChannel } from './fixtures/channel-metrics';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  syncJobFindFirst: vi.fn(),
  userChannelCount: vi.fn(),
  userChannelFindFirst: vi.fn(),
  userChannelFindUnique: vi.fn(),
  userChannelFindMany: vi.fn(),
  userChannelUpsert: vi.fn(),
  channelCount: vi.fn(),
  channelFindFirst: vi.fn(),
  channelUpdate: vi.fn(),
  postFindMany: vi.fn(),
  channelMetricDailyFindMany: vi.fn(),
  fraudSignalFindMany: vi.fn(),
  fraudSignalCount: vi.fn(),
  calculateChannelMetrics: vi.fn(),
  runFraudAudit: vi.fn(),
  buildDailyDigest: vi.fn(),
  formatDailyDigest: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    syncJob: { findFirst: mocks.syncJobFindFirst },
    userChannel: {
      count: mocks.userChannelCount,
      findFirst: mocks.userChannelFindFirst,
      findUnique: mocks.userChannelFindUnique,
      findMany: mocks.userChannelFindMany,
      upsert: mocks.userChannelUpsert,
    },
    channel: {
      count: mocks.channelCount,
      findFirst: mocks.channelFindFirst,
      update: mocks.channelUpdate,
    },
    post: { findMany: mocks.postFindMany },
    channelMetricDaily: { findMany: mocks.channelMetricDailyFindMany },
    fraudSignal: {
      findMany: mocks.fraudSignalFindMany,
      count: mocks.fraudSignalCount,
    },
  },
}));

vi.mock('../metrics', () => ({
  calculateChannelMetrics: mocks.calculateChannelMetrics,
  getOverviewStats: vi.fn(),
}));

vi.mock('../fraudDetector', () => ({
  runFraudAudit: mocks.runFraudAudit,
}));

vi.mock('../digest', async () => {
  const actual = await vi.importActual<typeof import('../digest')>('../digest');
  return {
    ...actual,
    buildDailyDigest: mocks.buildDailyDigest,
    formatDailyDigest: mocks.formatDailyDigest,
  };
});

import {
  handleTelegramBotCommand,
  normalizeChannelTarget,
  parseTelegramBotUpdate,
  type TelegramBotCommandDeps,
} from '../telegram-bot-commands';

const fixedNow = new Date('2026-11-15T18:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TELEGRAM_CHAT_ID', '');
  vi.stubEnv('APP_PUBLIC_URL', 'https://tgmon.example.com');
  vi.stubEnv('APP_TIMEZONE', 'UTC');

  mocks.userFindFirst.mockResolvedValue(null);
  mocks.syncJobFindFirst.mockResolvedValue(null);
  mocks.userChannelCount.mockResolvedValue(0);
  mocks.userChannelFindFirst.mockResolvedValue(null);
  mocks.userChannelFindUnique.mockResolvedValue(null);
  mocks.userChannelFindMany.mockResolvedValue([]);
  mocks.userChannelUpsert.mockResolvedValue({});
  mocks.channelCount.mockResolvedValue(0);
  mocks.channelFindFirst.mockResolvedValue(null);
  mocks.channelUpdate.mockResolvedValue({});
  mocks.postFindMany.mockResolvedValue([]);
  mocks.channelMetricDailyFindMany.mockResolvedValue([]);
  mocks.fraudSignalFindMany.mockResolvedValue([]);
  mocks.fraudSignalCount.mockResolvedValue(0);
  mocks.runFraudAudit.mockReturnValue({ fraudScore: 25, signals: [], details: {} });
  mocks.buildDailyDigest.mockResolvedValue({
    activeChannels: 2,
    totalAudience: 15000,
    channelsWithoutAudience: 0,
    myChannel: null,
    topGainers: [],
    topLosers: [],
    recentFraudSignals: 1,
    problemChannels: 0,
  });
  mocks.formatDailyDigest.mockReturnValue('TgMon: ежедневный дайджест за 24 часа');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeChannelTarget', () => {
  it('normalizes usernames, bare handles, and t.me links', () => {
    expect(normalizeChannelTarget('@Durov')).toBe('@durov');
    expect(normalizeChannelTarget('durov_news')).toBe('@durov_news');
    expect(normalizeChannelTarget('https://t.me/durov/123?single')).toBe('@durov');
    expect(normalizeChannelTarget('https://t.me/s/TeSt_ChAnNeL/45')).toBe('@test_channel');
    expect(normalizeChannelTarget('t.me/my_chan')).toBe('@my_chan');
  });

  it('rejects invalid targets, commands, and invite or private c/ links', () => {
    expect(normalizeChannelTarget('')).toBeNull();
    expect(normalizeChannelTarget('/status')).toBeNull();
    expect(normalizeChannelTarget('https://t.me/+AbCdEfGh123')).toBeNull();
    expect(normalizeChannelTarget('https://t.me/joinchat/AbCdEfGh')).toBeNull();
    expect(normalizeChannelTarget('https://t.me/c/12345678/90')).toBeNull();
    expect(normalizeChannelTarget('https://example.com/test')).toBeNull();
  });
});

describe('parseTelegramBotUpdate', () => {
  it('parses slash commands including bot mention suffixes and arguments', () => {
    expect(parseTelegramBotUpdate({
      update_id: 1,
      message: { chat: { id: 111222 }, text: '/start' },
    })).toEqual({
      type: 'start',
      chatId: '111222',
      target: null,
      rawCommand: '/start',
    });

    expect(parseTelegramBotUpdate({
      update_id: 2,
      message: { chat: { id: -100998877 }, text: '/status@tgmon_helper_bot' },
    })).toEqual({
      type: 'status',
      chatId: '-100998877',
      target: null,
      rawCommand: '/status',
    });

    expect(parseTelegramBotUpdate({
      update_id: 3,
      message: { chat: { id: 111222 }, text: '/digest' },
    })).toEqual({
      type: 'digest',
      chatId: '111222',
      target: null,
      rawCommand: '/digest',
    });

    expect(parseTelegramBotUpdate({
      update_id: 4,
      message: { chat: { id: 111222 }, text: '/channel https://t.me/BreakingNews/55' },
    })).toEqual({
      type: 'channel',
      chatId: '111222',
      target: '@breakingnews',
      rawCommand: '/channel',
    });

    expect(parseTelegramBotUpdate({
      update_id: 5,
      message: { chat: { id: 111222 }, text: '/add @AlphaFeed' },
    })).toEqual({
      type: 'add',
      chatId: '111222',
      target: '@alphafeed',
      rawCommand: '/add',
    });

    expect(parseTelegramBotUpdate({
      update_id: 6,
      message: { chat: { id: 111222 }, text: '/unknowncmd' },
    })).toEqual({
      type: 'unknown',
      chatId: '111222',
      target: null,
      rawCommand: '/unknowncmd',
    });
  });

  it('recognizes forwarded posts via forward_from_chat and forward_origin', () => {
    expect(parseTelegramBotUpdate({
      update_id: 10,
      message: {
        chat: { id: 777 },
        text: 'Forwarded content',
        forward_from_chat: { id: -1001, username: 'LegacyChannel', title: 'Legacy Title', type: 'channel' },
      },
    })).toEqual({
      type: 'channel',
      chatId: '777',
      target: '@legacychannel',
      rawCommand: 'forward',
      forwardedTitle: 'Legacy Title',
    });

    expect(parseTelegramBotUpdate({
      update_id: 11,
      message: {
        chat: { id: 777 },
        caption: 'Photo caption',
        forward_origin: {
          type: 'channel',
          chat: { id: -1002, username: 'ModernOrigin', title: 'Modern Title', type: 'channel' },
        },
      },
    })).toEqual({
      type: 'channel',
      chatId: '777',
      target: '@modernorigin',
      rawCommand: 'forward',
      forwardedTitle: 'Modern Title',
    });

    expect(parseTelegramBotUpdate({
      update_id: 12,
      message: {
        chat: { id: 777 },
        text: 'Forwarded private post mentioning @other_channel',
        forward_origin: {
          type: 'channel',
          chat: { id: -1003, title: 'Private Group', type: 'channel' },
        },
      },
    })).toEqual({
      type: 'channel',
      chatId: '777',
      target: null,
      rawCommand: 'forward',
      forwardedTitle: 'Private Group',
    });
  });

  it('detects direct t.me links in messages and ignores plain chat text', () => {
    expect(parseTelegramBotUpdate({
      update_id: 20,
      message: { chat: { id: 777 }, text: 'Посмотри канал https://t.me/s/TechStream/99 пожалуйста' },
    })).toEqual({
      type: 'channel',
      chatId: '777',
      target: '@techstream',
      rawCommand: null,
    });

    expect(parseTelegramBotUpdate({
      update_id: 21,
      message: { chat: { id: 777 }, text: 'Привет, как дела?' },
    })).toBeNull();

    expect(parseTelegramBotUpdate({ update_id: 22 })).toBeNull();
  });
});

describe('handleTelegramBotCommand', () => {
  it('blocks unauthorized chat IDs without leaking system metrics', async () => {
    const getStatus = vi.fn();
    const reply = await handleTelegramBotCommand(
      { type: 'status', chatId: '999888777', target: null, rawCommand: '/status' },
      { getLatestSyncJob: getStatus },
    );

    expect(reply).toContain('Чат не привязан к аккаунту TgMon');
    expect(reply).toContain('999888777');
    expect(reply).toContain('Настройки');
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('authorizes active DB users and system TELEGRAM_CHAT_ID fallback', async () => {
    mocks.userFindFirst.mockResolvedValueOnce({
      id: 42,
      username: 'oleg',
      telegramName: 'Олег',
      telegramUsername: 'oleg_tg',
      role: 'USER',
    });

    const userReply = await handleTelegramBotCommand(
      { type: 'help', chatId: '555111', target: null, rawCommand: '/help' },
    );
    expect(mocks.userFindFirst).toHaveBeenCalledWith({
      where: { telegramChatId: '555111', accessStatus: 'ACTIVE' },
      select: expect.any(Object),
    });
    expect(userReply).toContain('Олег');
    expect(userReply).toContain('/status');
    expect(userReply).toContain('/digest');
    expect(userReply).toContain('/channel @username');
    expect(userReply).toContain('/add @username');

    vi.stubEnv('TELEGRAM_CHAT_ID', '888000');
    const adminReply = await handleTelegramBotCommand(
      { type: 'start', chatId: '888000', target: null, rawCommand: '/start' },
    );
    expect(adminReply).toContain('Chat ID: 888000');
  });

  it('formats /status and /digest responses with best post and user status summary', async () => {
    const deps: TelegramBotCommandDeps = {
      now: () => fixedNow,
      resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
      getLatestSyncJob: async () => ({
        status: 'COMPLETED',
        startedAt: new Date('2026-11-15T17:00:00.000Z'),
        endedAt: new Date('2026-11-15T17:02:15.000Z'),
        channelsTotal: 12,
        channelsSucceeded: 12,
        channelsFailed: 0,
        postsAdded: 34,
        durationMs: 135_000,
      }),
      getUserStatusSummary: async () => ({
        activeChannels: 8,
        myChannel: { title: 'Главный канал', username: 'main_ch', currentMembers: 25400 },
      }),
      buildDigest: async () => ({
        activeChannels: 8,
        totalAudience: 120_000,
        channelsWithoutAudience: 0,
        myChannel: {
          title: 'Главный канал',
          currentMembers: 25400,
          delta24h: 120,
          er7d: 3.5,
          err7d: 18.2,
          posts24h: 4,
        },
        topGainers: [{ title: 'Главный канал', currentMembers: 25400, delta24h: 120, er7d: 3.5, err7d: 18.2, posts24h: 4 }],
        topLosers: [],
        recentFraudSignals: 1,
        problemChannels: 0,
      }),
      formatDigest: () => 'TgMon: ежедневный дайджест за 24 часа (2026-11-15 UTC)',
      getDigestExtras: async () => ({
        bestPost: {
          channelTitle: 'Главный канал',
          messageId: '450',
          err: 24.5,
          views: 18000,
          snippet: 'Срочный разбор рынка сегодня вечером',
        },
        recentFraudSignals24h: 1,
      }),
    };

    const statusReply = await handleTelegramBotCommand(
      { type: 'status', chatId: '777', target: null, rawCommand: '/status' },
      deps,
    );
    expect(statusReply).toContain('завершен успешно');
    expect(statusReply).toContain('12/12');
    expect(statusReply).toContain('Новых постов за цикл: 34');
    expect(statusReply).toContain('Активных каналов на мониторинге: 8');
    expect(statusReply).toContain('Главный канал (@main_ch)');

    const digestReply = await handleTelegramBotCommand(
      { type: 'digest', chatId: '777', target: null, rawCommand: '/digest' },
      deps,
    );
    expect(digestReply).toContain('TgMon: ежедневный дайджест за 24 часа');
    expect(digestReply).toContain('Лучший пост за 24ч: Главный канал (ERR 24.50%)');
    expect(digestReply).toContain('Срочный разбор рынка сегодня вечером');
  });

  it('formats /channel metrics card from DB and suggests /add when channel is unknown', async () => {
    mocks.userFindFirst.mockResolvedValue({
      id: 7,
      username: 'tester',
      telegramName: 'Tester',
      telegramUsername: null,
      role: 'USER',
    });

    // 1. Unknown channel
    mocks.channelFindFirst.mockResolvedValueOnce(null);
    const missingReply = await handleTelegramBotCommand({
      type: 'channel',
      chatId: '777',
      target: '@missing_ch',
      rawCommand: '/channel',
    });
    expect(missingReply).toContain('@missing_ch еще не отслеживается');
    expect(missingReply).toContain('/add @missing_ch');

    // 2. Known channel in DB but not yet tracked by this user
    mocks.channelFindFirst.mockResolvedValueOnce({ id: 15, title: 'Tech Radar', username: 'techradar' });
    mocks.userChannelFindUnique.mockResolvedValueOnce(null);
    mocks.calculateChannelMetrics.mockResolvedValueOnce({
      ...fixtureChannel,
      id: 15,
      title: 'Tech Radar',
      username: 'techradar',
      currentMembers: 42_500,
      delta7d: { abs: 1200, percent: 2.9 },
      delta30d: { abs: -350, percent: -0.8 },
      er7d: 4.15,
      err7d: 19.4,
      adShare30d: { percent: 12.5, level: 'medium' },
    });
    mocks.runFraudAudit.mockReturnValueOnce({ fraudScore: 25, signals: [], details: {} });

    const cardReply = await handleTelegramBotCommand({
      type: 'channel',
      chatId: '777',
      target: '@techradar',
      rawCommand: 'forward',
    });
    expect(cardReply).toContain('Tech Radar (@techradar)');
    expect(cardReply).toContain('42');
    expect(cardReply).toContain('+1');
    expect(cardReply).toContain('ER 4,15% | ERR 19,4%');
    expect(cardReply).toContain('Доля рекламы (30д): 12,5%');
    expect(cardReply).toContain('Trust Score): 75/100 (подозрительный)');
    expect(cardReply).toContain('https://tgmon.example.com/channel/15');
    expect(cardReply).toContain('/add @techradar');
  });

  it('handles /add command via worker callback and DB fallback', async () => {
    const onAddChannel = vi.fn().mockResolvedValue({
      added: true,
      alreadyExists: false,
      channelId: 21,
      title: 'New Alpha',
      username: 'newalpha',
    });

    const addedReply = await handleTelegramBotCommand(
      { type: 'add', chatId: '777', target: '@newalpha', rawCommand: '/add' },
      {
        resolveAccess: async () => ({ authorized: true, userId: 3, userName: 'Tester', isSystemAdmin: false }),
        appBaseUrl: 'https://tgmon.example.com',
        onAddChannel,
      },
    );
    expect(onAddChannel).toHaveBeenCalledWith('@newalpha', 3);
    expect(addedReply).toContain('«New Alpha» (@newalpha) добавлен в мониторинг');
    expect(addedReply).toContain('https://tgmon.example.com/channel/21');

    const emptyAddReply = await handleTelegramBotCommand(
      { type: 'add', chatId: '777', target: null, rawCommand: '/add' },
      { resolveAccess: async () => ({ authorized: true, userId: 3, userName: 'Tester', isSystemAdmin: false }) },
    );
    expect(emptyAddReply).toContain('Укажите канал для добавления');
  });
});
