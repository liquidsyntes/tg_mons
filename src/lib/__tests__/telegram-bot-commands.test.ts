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
  eventFindMany: vi.fn(),
  eventFindUnique: vi.fn(),
  eventUpdate: vi.fn(),
  userDismissedEventUpsert: vi.fn(),
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
    event: {
      findMany: mocks.eventFindMany,
      findUnique: mocks.eventFindUnique,
      update: mocks.eventUpdate,
    },
    userDismissedEvent: {
      upsert: mocks.userDismissedEventUpsert,
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
  parseEventsCommandFilter,
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
  mocks.eventFindMany.mockResolvedValue([]);
  mocks.eventFindUnique.mockResolvedValue(null);
  mocks.eventUpdate.mockResolvedValue({});
  mocks.userDismissedEventUpsert.mockResolvedValue({});
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

  it('parses /events, /afisha, /event, and /dismiss commands cleanly', () => {
    expect(parseTelegramBotUpdate({
      update_id: 30,
      message: { chat: { id: 111222 }, text: '/events' },
    })).toEqual({ type: 'events', chatId: '111222', target: null, rawCommand: '/events' });

    expect(parseTelegramBotUpdate({
      update_id: 31,
      message: { chat: { id: 111222 }, text: '/afisha выходные' },
    })).toEqual({ type: 'events', chatId: '111222', target: 'выходные', rawCommand: '/afisha' });

    expect(parseTelegramBotUpdate({
      update_id: 32,
      message: { chat: { id: 111222 }, text: '/events живой джаз' },
    })).toEqual({ type: 'events', chatId: '111222', target: 'живой джаз', rawCommand: '/events' });

    expect(parseTelegramBotUpdate({
      update_id: 33,
      message: { chat: { id: 111222 }, text: '/event #42' },
    })).toEqual({ type: 'event', chatId: '111222', target: '42', rawCommand: '/event' });

    expect(parseTelegramBotUpdate({
      update_id: 34,
      message: { chat: { id: 111222 }, text: '/event invalid_id' },
    })).toEqual({ type: 'event', chatId: '111222', target: null, rawCommand: '/event' });

    expect(parseTelegramBotUpdate({
      update_id: 35,
      message: { chat: { id: 111222 }, text: '/dismiss 77' },
    })).toEqual({ type: 'dismiss', chatId: '111222', target: '77', rawCommand: '/dismiss' });

    expect(parseTelegramBotUpdate({
      update_id: 36,
      message: { chat: { id: 111222 }, text: '/hide #78' },
    })).toEqual({ type: 'dismiss', chatId: '111222', target: '78', rawCommand: '/hide' });
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
    expect(userReply).toContain('/events');
    expect(userReply).toContain('/event <id>');
    expect(userReply).toContain('/dismiss <id>');

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

  it('lists, filters, deduplicates and caps events for /events command', async () => {
    const wednesdayNow = new Date('2026-11-18T12:00:00.000Z');
    mocks.userFindFirst.mockResolvedValue({
      id: 7,
      username: 'tester',
      telegramName: 'Tester',
      telegramUsername: null,
      role: 'USER',
    });
    mocks.userChannelFindMany.mockResolvedValue([{ channelId: 10 }, { channelId: 11 }]);

    const dbEvents = [
      {
        id: 101,
        title: 'Джаз на крыше',
        date: new Date('2026-11-18T00:00:00.000Z'),
        timeStr: '19:30',
        organizer: 'Roof Club',
        prices: ['Бесплатно', 'Донат'],
        mentions: [
          {
            id: 1,
            postId: 501,
            post: {
              id: 501,
              messageId: 8001n,
              channelId: 10,
              text: 'Приглашаем на концерт живого джаза!',
              channel: { title: 'Афиша Города', username: 'afisha_city', tgId: -10010n },
            },
          },
          {
            id: 2,
            postId: 502,
            post: {
              id: 502,
              messageId: 9001n,
              channelId: 99,
              text: 'Пост из чужого канала',
              channel: { title: 'Чужой канал', username: 'alien', tgId: -10099n },
            },
          },
        ],
      },
      {
        // Duplicate of #101 from another channel -> merged into #101 via isSameEvent
        id: 102,
        title: 'Джаз на крыше',
        date: new Date('2026-11-18T00:00:00.000Z'),
        timeStr: '19:30',
        organizer: 'Roof Club',
        prices: ['Бесплатно'],
        mentions: [
          {
            id: 3,
            postId: 503,
            post: {
              id: 503,
              messageId: 8002n,
              channelId: 11,
              text: 'Живой джаз уже сегодня вечером',
              channel: { title: 'Куда пойти', username: 'kuda_go', tgId: -10011n },
            },
          },
        ],
      },
      {
        // Digest post -> filtered out via isClearlyEventDigest
        id: 103,
        title: 'Подборка на неделю',
        date: new Date('2026-11-19T00:00:00.000Z'),
        timeStr: null,
        organizer: null,
        prices: [],
        mentions: [
          {
            id: 4,
            postId: 504,
            post: {
              id: 504,
              messageId: 8003n,
              channelId: 10,
              text: 'Подборка: лучшие события недели https://t.me/a/1',
              channel: { title: 'Афиша Города', username: 'afisha_city', tgId: -10010n },
            },
          },
        ],
      },
      {
        id: 104,
        title: 'Симфония в зале',
        date: new Date('2026-11-21T00:00:00.000Z'),
        timeStr: '20:00',
        organizer: 'Филармония',
        prices: ['500 грн'],
        mentions: [
          {
            id: 5,
            postId: 505,
            post: {
              id: 505,
              messageId: 8004n,
              channelId: 10,
              text: 'Большой концерт в субботу',
              channel: { title: 'Афиша Города', username: 'afisha_city', tgId: -10010n },
            },
          },
        ],
      },
    ];
    mocks.eventFindMany.mockResolvedValue(dbEvents);

    const todayReply = await handleTelegramBotCommand(
      { type: 'events', chatId: '777', target: 'сегодня', rawCommand: '/events' },
      { now: () => wednesdayNow },
    );
    expect(todayReply).toContain('Афиша мероприятий (сегодня и завтра): найдено 1');
    expect(todayReply).toContain('[#101] 18.11.2026, 19:30 – Джаз на крыше');
    expect(todayReply).toContain('https://t.me/afisha_city/8001');
    expect(todayReply).not.toContain('[#102]');
    expect(todayReply).not.toContain('Подборка на неделю');
    expect(todayReply).not.toContain('Симфония в зале');

    const weekendReply = await handleTelegramBotCommand(
      { type: 'events', chatId: '777', target: 'weekend', rawCommand: '/events' },
      { now: () => wednesdayNow },
    );
    expect(weekendReply).toContain('[#104] 21.11.2026, 20:00 – Симфония в зале');
    expect(weekendReply).toContain('500 грн');

    const freeReply = await handleTelegramBotCommand(
      { type: 'events', chatId: '777', target: 'free', rawCommand: '/events' },
      { now: () => wednesdayNow },
    );
    expect(freeReply).toContain('Джаз на крыше');
    expect(freeReply).not.toContain('Симфония в зале');

    const searchEmptyReply = await handleTelegramBotCommand(
      { type: 'events', chatId: '777', target: 'несуществующий_тег', rawCommand: '/events' },
      { now: () => wednesdayNow },
    );
    expect(searchEmptyReply).toContain('сейчас нет подходящих мероприятий');

    // Verify 10-item cap with listUserEvents override
    const manyEvents = Array.from({ length: 12 }, (_, idx) => ({
      id: idx + 1,
      title: `Событие ${idx + 1}`,
      date: new Date('2026-11-20T00:00:00.000Z'),
      timeStr: null,
      organizer: null,
      prices: [],
      mentions: [],
    }));
    const cappedReply = await handleTelegramBotCommand(
      { type: 'events', chatId: '777', target: null, rawCommand: '/events' },
      {
        now: () => wednesdayNow,
        resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
        listUserEvents: async () => manyEvents,
      },
    );
    expect(cappedReply).toContain('найдено 12');
    expect(cappedReply).toContain('Показаны первые 10 из 12');
    expect(cappedReply).not.toContain('[#11]');
  });

  it('formats detailed /event card with Google Calendar URL and enforces auth', async () => {
    const unauthorizedReply = await handleTelegramBotCommand({
      type: 'events',
      chatId: '999000',
      target: null,
      rawCommand: '/events',
    });
    expect(unauthorizedReply).toContain('Чат не привязан к аккаунту TgMon');

    const detailReply = await handleTelegramBotCommand(
      { type: 'event', chatId: '777', target: '101', rawCommand: '/event' },
      {
        resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
        appBaseUrl: 'https://tgmon.example.com',
        listUserEvents: async () => [{
          id: 101,
          title: 'Джаз на крыше',
          date: new Date('2026-11-18T00:00:00.000Z'),
          timeStr: '19:30 - 22:00',
          organizer: 'Roof Club',
          prices: ['Бесплатно'],
          mentions: [
            {
              id: 1,
              postId: 501,
              post: {
                messageId: '8001',
                channel: { title: 'Афиша Города', username: 'afisha_city', tgId: '-10010' },
              },
            },
            {
              id: 2,
              postId: 503,
              post: {
                messageId: '8002',
                channel: { title: 'Куда пойти', username: 'kuda_go', tgId: '-10011' },
              },
            },
          ],
        }],
      },
    );

    expect(detailReply).toContain('🎫 [#101] Джаз на крыше');
    expect(detailReply).toContain('18.11.2026 (19:30 - 22:00)');
    expect(detailReply).toContain('Roof Club');
    expect(detailReply).toContain('Бесплатно (бесплатно)');
    expect(detailReply).toContain('Афиша Города: https://t.me/afisha_city/8001');
    expect(detailReply).toContain('Куда пойти: https://t.me/kuda_go/8002');
    expect(detailReply).toContain('https://calendar.google.com/calendar/render?');
    expect(detailReply).toContain('/dismiss 101');

    const missingReply = await handleTelegramBotCommand(
      { type: 'event', chatId: '777', target: '999', rawCommand: '/event' },
      {
        resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
        listUserEvents: async () => [],
      },
    );
    expect(missingReply).toContain('Мероприятие #999 не найдено');
  });

  it('dismisses event via /dismiss for user and system admin modes', async () => {
    mocks.userFindFirst.mockResolvedValueOnce({
      id: 7,
      username: 'tester',
      telegramName: 'Tester',
      telegramUsername: null,
      role: 'USER',
    });
    mocks.eventFindUnique.mockResolvedValueOnce({
      id: 101,
      title: 'Джаз на крыше',
      dismissedAt: null,
    });

    const userDismissReply = await handleTelegramBotCommand({
      type: 'dismiss',
      chatId: '777',
      target: '101',
      rawCommand: '/dismiss',
    });
    expect(mocks.userDismissedEventUpsert).toHaveBeenCalledWith({
      where: { userId_eventId: { userId: 7, eventId: 101 } },
      create: { userId: 7, eventId: 101 },
      update: {},
    });
    expect(userDismissReply).toContain('Мероприятие #101 («Джаз на крыше») скрыто');

    vi.stubEnv('TELEGRAM_CHAT_ID', '888000');
    mocks.eventFindUnique.mockResolvedValueOnce({
      id: 104,
      title: 'Симфония в зале',
      dismissedAt: null,
    });
    const adminDismissReply = await handleTelegramBotCommand({
      type: 'dismiss',
      chatId: '888000',
      target: '104',
      rawCommand: '/dismiss',
    });
    expect(mocks.eventUpdate).toHaveBeenCalledWith({
      where: { id: 104 },
      data: { dismissedAt: expect.any(Date) },
    });
    expect(adminDismissReply).toContain('Мероприятие #104 («Симфония в зале») скрыто');

    mocks.eventFindUnique.mockResolvedValueOnce(null);
    const notFoundReply = await handleTelegramBotCommand(
      { type: 'dismiss', chatId: '888000', target: '404', rawCommand: '/dismiss' },
    );
    expect(notFoundReply).toContain('Мероприятие #404 не найдено');
  });

  it('formats /start and /help greeting cleanly when userName is null', async () => {
    const reply = await handleTelegramBotCommand(
      { type: 'start', chatId: '777', target: null, rawCommand: '/start' },
      {
        resolveAccess: async () => ({
          authorized: true,
          userId: null,
          userName: null,
          isSystemAdmin: false,
        }),
      },
    );

    expect(reply).toContain('TgMon Бот подключен (Chat ID: 777)');
    expect(reply).toContain('/help – показать эту справку');
  });

  it('renders Trust Score label boundaries and respects appBaseUrl precedence', async () => {
    const baseCard = {
      id: 15,
      title: 'Radar',
      username: 'radar_ch',
      isTrackedByUser: true,
      currentMembers: 10_000,
      delta7dAbs: 100,
      delta7dPercent: 1,
      delta30dAbs: 200,
      delta30dPercent: 2,
      er7d: 3,
      err7d: 15,
      adShare30dPercent: 5,
    };

    const normReply = await handleTelegramBotCommand(
      { type: 'channel', chatId: '777', target: '@radar_ch', rawCommand: '/channel' },
      {
        resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
        appBaseUrl: 'https://override.tgmon.local///',
        findChannelCardData: async () => ({ ...baseCard, fraudScore: 0 }),
      },
    );
    expect(normReply).toContain('Индекс доверия (Trust Score): 100/100 (норма)');
    expect(normReply).toContain('Подробнее: https://override.tgmon.local/channel/15');

    const suspiciousReply = await handleTelegramBotCommand(
      { type: 'channel', chatId: '777', target: '@radar_ch', rawCommand: '/channel' },
      {
        resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
        findChannelCardData: async () => ({ ...baseCard, fraudScore: 25 }),
      },
    );
    expect(suspiciousReply).toContain('Индекс доверия (Trust Score): 75/100 (подозрительный)');
    expect(suspiciousReply).toContain('Подробнее: https://tgmon.example.com/channel/15');

    vi.stubEnv('APP_PUBLIC_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('TELEGRAM_LOGIN_REDIRECT_URI', 'https://auth.tgmon.org/api/auth/telegram/callback');
    const redirectOriginReply = await handleTelegramBotCommand(
      { type: 'channel', chatId: '777', target: '@radar_ch', rawCommand: '/channel' },
      {
        resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
        findChannelCardData: async () => ({ ...baseCard, fraudScore: 50 }),
      },
    );
    expect(redirectOriginReply).toContain('Индекс доверия (Trust Score): 50/100 (высокий риск)');
    expect(redirectOriginReply).toContain('Подробнее: https://auth.tgmon.org/channel/15');

    vi.stubEnv('TELEGRAM_LOGIN_REDIRECT_URI', '');
    vi.stubEnv('WEB_INTERNAL_URL', 'http://web:4000');
    const fallbackReply = await handleTelegramBotCommand(
      { type: 'channel', chatId: '777', target: '@radar_ch', rawCommand: '/channel' },
      {
        resolveAccess: async () => ({ authorized: true, userId: 7, userName: 'Tester', isSystemAdmin: false }),
        findChannelCardData: async () => ({ ...baseCard, fraudScore: 50 }),
      },
    );
    expect(fallbackReply).toContain('Подробнее: http://localhost:4000/channel/15');
  });
});

describe('parseEventsCommandFilter', () => {
  it('maps empty values, presets, Russian aliases, and free-text search', () => {
    expect(parseEventsCommandFilter(null)).toEqual({
      filterOptions: { datePreset: 'all' },
      label: 'все предстоящие',
    });
    expect(parseEventsCommandFilter('   ')).toEqual({
      filterOptions: { datePreset: 'all' },
      label: 'все предстоящие',
    });
    expect(parseEventsCommandFilter('сегодня')).toEqual({
      filterOptions: { datePreset: 'today_tomorrow' },
      label: 'сегодня и завтра',
    });
    expect(parseEventsCommandFilter('weekend')).toEqual({
      filterOptions: { datePreset: 'weekend' },
      label: 'на выходные',
    });
    expect(parseEventsCommandFilter('неделя')).toEqual({
      filterOptions: { datePreset: 'week' },
      label: 'на эту неделю',
    });
    expect(parseEventsCommandFilter('месяц')).toEqual({
      filterOptions: { datePreset: 'month' },
      label: 'в этом месяце',
    });
    expect(parseEventsCommandFilter('бесплатно')).toEqual({
      filterOptions: { datePreset: 'all', freeOnly: true },
      label: 'бесплатные (предстоящие)',
    });
    expect(parseEventsCommandFilter('  Джаз  ')).toEqual({
      filterOptions: { datePreset: 'all', query: 'Джаз' },
      label: 'поиск «Джаз»',
    });
  });
});
