import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { channel } from './fixtures/channel-metrics';

const mocks = vi.hoisted(() => ({
  ruleFindMany: vi.fn(), ruleUpdateMany: vi.fn(),
  fireFindUnique: vi.fn(), fireCreate: vi.fn(), fireUpdateMany: vi.fn(), fireDeleteMany: vi.fn(),
  postFireFindUnique: vi.fn(), postFireCreate: vi.fn(), postFireDeleteMany: vi.fn(),
  postFindMany: vi.fn(),
  subscriptions: vi.fn(), transaction: vi.fn(), activeRule: vi.fn(), warn: vi.fn(),
}));
vi.mock('../prisma', () => ({ prisma: {
  alertRule: { findMany: mocks.ruleFindMany, updateMany: mocks.ruleUpdateMany },
  alertRuleFire: { findUnique: mocks.fireFindUnique, create: mocks.fireCreate,
    updateMany: mocks.fireUpdateMany, deleteMany: mocks.fireDeleteMany },
  alertRulePostFire: { findUnique: mocks.postFireFindUnique, create: mocks.postFireCreate,
    deleteMany: mocks.postFireDeleteMany },
  post: { findMany: mocks.postFindMany },
  userChannel: { findMany: mocks.subscriptions },
  $transaction: mocks.transaction,
} }));
vi.mock('../logger', () => ({ logger: { warn: mocks.warn } }));

import {
  ALERT_COOLDOWN_MS,
  checkChannelAlertRules,
  evaluateAlertRule,
  evaluateViralPostRule,
  getAlertMetricValue,
  matchKeywordRule,
  normalizeKeywordQuery,
} from '../alerts';

const now = new Date('2026-10-17T12:00:00.000Z');
const metrics = {
  ...channel,
  id: 5,
  username: 'channel_five',
  currentMembers: 1000,
  delta24h: { abs: -15, percent: -1.5 },
  delta7d: { abs: 40, percent: 4 },
  er7d: 2.5,
  err7d: 3.5,
  vr7d: 42,
  avgViews7d: 420,
  posts7d: 8,
  contentScore: 75,
};

function rule(overrides: Partial<{
  id: number; userId: number | null; channelId: number | null; metric: string; operator: string;
  threshold: number; keywordQuery: string | null; enabled: boolean; lastFiredAt: Date | null;
}> = {}) {
  return {
    id: 1, userId: null, channelId: 5, metric: 'followers', operator: 'gt', threshold: 900,
    keywordQuery: null, enabled: true, lastFiredAt: null, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ruleFindMany.mockResolvedValue([]);
  mocks.subscriptions.mockResolvedValue([]);
  mocks.fireFindUnique.mockResolvedValue(null);
  mocks.fireCreate.mockResolvedValue({ id: 10 });
  mocks.fireUpdateMany.mockResolvedValue({ count: 1 });
  mocks.fireDeleteMany.mockResolvedValue({ count: 1 });
  mocks.postFireFindUnique.mockResolvedValue(null);
  mocks.postFireCreate.mockResolvedValue({ id: 20 });
  mocks.postFireDeleteMany.mockResolvedValue({ count: 1 });
  mocks.postFindMany.mockResolvedValue([]);
  mocks.ruleUpdateMany.mockResolvedValue({ count: 1 });
  mocks.activeRule.mockResolvedValue([{ id: 1 }]);
  mocks.transaction.mockImplementation(async callback => callback({
    $queryRaw: mocks.activeRule,
    alertRuleFire: { findUnique: mocks.fireFindUnique, create: mocks.fireCreate, updateMany: mocks.fireUpdateMany },
    alertRulePostFire: { findUnique: mocks.postFireFindUnique, create: mocks.postFireCreate },
  }));
});

describe('alert rule evaluation', () => {
  it('does not calculate channel metrics when no rules are enabled', async () => {
    const loadMetrics = vi.fn();
    const send = vi.fn();
    expect(await checkChannelAlertRules(5, loadMetrics, send, now)).toBe(0);
    expect(loadMetrics).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['followers', 1000], ['delta24h', -15], ['delta7d', 40],
    ['er7d', 2.5], ['err7d', 3.5], ['vr7d', 42],
    ['avgViews7d', 420], ['posts7d', 8], ['contentScore', 75],
  ] as const)('reads %s from channel metrics', (metric, value) => {
    expect(getAlertMetricValue(metrics, metric)).toBe(value);
  });

  it('uses strict comparisons and skips missing or invalid values', () => {
    expect(evaluateAlertRule(rule({ threshold: 1000 }), metrics)).toBeNull();
    expect(evaluateAlertRule(rule({ operator: 'lt', threshold: 1001 }), metrics)).toBe(1000);
    expect(evaluateAlertRule(rule({ metric: 'delta24h', operator: 'lt', threshold: -10 }), metrics)).toBe(-15);
    expect(evaluateAlertRule(rule({ metric: 'contentScore' }), { ...metrics, contentScore: undefined })).toBeNull();
    expect(evaluateAlertRule(rule({ threshold: Number.NaN }), metrics)).toBeNull();
  });

  it('enforces channel scope and enabled state without using the rule-wide timestamp', () => {
    expect(evaluateAlertRule(rule({ channelId: null, lastFiredAt: now }), metrics)).toBe(1000);
    expect(evaluateAlertRule(rule({ channelId: 9 }), metrics)).toBeNull();
    expect(evaluateAlertRule(rule({ enabled: false }), metrics)).toBeNull();
  });

  it('fires one global rule independently for two channels', async () => {
    mocks.ruleFindMany.mockResolvedValue([rule({ channelId: null })]);
    const send = vi.fn().mockResolvedValue(true);
    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(1);
    expect(await checkChannelAlertRules(6, async () => ({ ...metrics, id: 6, username: null }), send, now)).toBe(1);
    expect(mocks.fireCreate.mock.calls.map(([argument]) => argument.data.channelId)).toEqual([5, 6]);
    expect(send.mock.calls[0][0]).toContain('правило для всех каналов');
    expect(send.mock.calls[0][0]).toContain('@channel_five');
    expect(send.mock.calls[1][0]).not.toContain('@channel_five');
    expect(mocks.ruleUpdateMany).toHaveBeenCalledWith({
      where: { id: 1, OR: [{ lastFiredAt: null }, { lastFiredAt: { lt: now } }] },
      data: { lastFiredAt: now },
    });
  });

  it('blocks the same channel during cooldown and allows it at the 24-hour boundary', async () => {
    mocks.ruleFindMany.mockResolvedValue([rule({ channelId: null })]);
    mocks.fireFindUnique.mockResolvedValue({ id: 10, lastFiredAt: now, lastValue: 1000 });
    mocks.fireUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const send = vi.fn().mockResolvedValue(true);
    expect(await checkChannelAlertRules(5, async () => metrics, send, new Date(now.getTime() + ALERT_COOLDOWN_MS - 1))).toBe(0);
    expect(await checkChannelAlertRules(5, async () => metrics, send, new Date(now.getTime() + ALERT_COOLDOWN_MS))).toBe(1);
    expect(mocks.fireUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 10, lastFiredAt: { lte: now } },
      data: { lastFiredAt: new Date(now.getTime() + ALERT_COOLDOWN_MS), lastValue: 1000 },
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it('filters user-owned global rules by active subscriptions', async () => {
    mocks.ruleFindMany.mockResolvedValue([
      rule({ id: 1, userId: 11, channelId: null }),
      rule({ id: 2, userId: 12, channelId: null }),
      rule({ id: 3, userId: null, channelId: null }),
    ]);
    mocks.subscriptions.mockResolvedValue([{ userId: 11 }]);
    const send = vi.fn().mockResolvedValue(true);
    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(2);
    expect(mocks.subscriptions).toHaveBeenCalledWith({
      where: { channelId: 5, isActive: true, userId: { in: [11, 12] } }, select: { userId: true },
    });
    expect(mocks.fireCreate.mock.calls.map(([argument]) => argument.data.ruleId)).toEqual([1, 3]);
  });

  it('does not send after a concurrent insert reserved the pair', async () => {
    mocks.ruleFindMany.mockResolvedValue([rule()]);
    mocks.fireCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique conflict', {
      code: 'P2002', clientVersion: '6.19.3',
    }));
    const send = vi.fn();
    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not claim a rule disabled while channel metrics were loading', async () => {
    mocks.ruleFindMany.mockResolvedValue([rule()]);
    mocks.activeRule.mockResolvedValue([]);
    const send = vi.fn();
    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(0);
    expect(mocks.fireCreate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('releases a new reservation when delivery returns false', async () => {
    mocks.ruleFindMany.mockResolvedValue([rule()]);
    expect(await checkChannelAlertRules(5, async () => metrics, vi.fn().mockResolvedValue(false), now)).toBe(0);
    expect(mocks.fireDeleteMany).toHaveBeenCalledWith({ where: { id: 10, lastFiredAt: now } });
    expect(mocks.ruleUpdateMany).not.toHaveBeenCalled();
  });

  it('restores an older reservation when the sender throws', async () => {
    const previous = new Date('2026-10-15T00:00:00.000Z');
    mocks.ruleFindMany.mockResolvedValue([rule()]);
    mocks.fireFindUnique.mockResolvedValue({ id: 10, lastFiredAt: previous, lastValue: 950 });
    const send = vi.fn().mockRejectedValue(new Error('Telegram unavailable'));
    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(0);
    expect(mocks.fireUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 10, lastFiredAt: now },
      data: { lastFiredAt: previous, lastValue: 950 },
    });
    expect(mocks.ruleUpdateMany).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('normalizes keyword queries and matches case-insensitively', () => {
    expect(normalizeKeywordQuery('  Биткоин ,  тон , БИТКОИН, , Павел   Дуров ')).toBe('Биткоин, тон, Павел Дуров');
    expect(normalizeKeywordQuery('   , , ')).toBeNull();
    expect(normalizeKeywordQuery('a'.repeat(101))).toBeNull();
    expect(matchKeywordRule('Сегодня обсуждаем Павел Дуров и Telegram', 'биткоин, Павел Дуров')).toBe('Павел Дуров');
    expect(matchKeywordRule(null, 'биткоин')).toBeNull();
    expect(matchKeywordRule('Обычный пост без совпадений', 'биткоин')).toBeNull();
  });

  it('fires keyword alerts once per matching post and includes snippet and Telegram link', async () => {
    mocks.ruleFindMany.mockResolvedValue([
      rule({ id: 7, userId: 11, channelId: null, metric: 'keyword', threshold: 0, keywordQuery: 'Биткоин, эфир' }),
    ]);
    mocks.subscriptions.mockResolvedValue([{ userId: 11 }]);
    mocks.postFindMany.mockResolvedValue([
      { id: 101, messageId: 501n, text: 'Курс эфир резко вырос за ночь!', publishedAt: now },
      { id: 102, messageId: 502n, text: 'Пост без ключевых слов', publishedAt: now },
      { id: 103, messageId: 503n, text: 'Новый рекорд: БИТКОИН выше ожиданий', publishedAt: now },
    ]);
    mocks.postFireFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 99 }); // post 103 already fired previously
    const send = vi.fn().mockResolvedValue(true);

    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(1);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toContain('TgMon: упоминание ключевого слова для всех каналов');
    expect(send.mock.calls[0][0]).toContain('Ключевое слово: «эфир»');
    expect(send.mock.calls[0][0]).toContain('https://t.me/channel_five/501');
    expect(mocks.postFireCreate).toHaveBeenCalledWith({
      data: { ruleId: 7, postId: 101, firedAt: now },
      select: { id: true },
    });
  });

  it('releases keyword post reservation when delivery fails', async () => {
    mocks.ruleFindMany.mockResolvedValue([
      rule({ id: 8, channelId: 5, metric: 'keyword', threshold: 0, keywordQuery: 'срочно' }),
    ]);
    mocks.postFindMany.mockResolvedValue([
      { id: 201, messageId: 777n, text: 'СРОЧНО: важное объявление', publishedAt: now },
    ]);
    const send = vi.fn().mockResolvedValue(false);

    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(0);
    expect(mocks.postFireDeleteMany).toHaveBeenCalledWith({ where: { id: 20, firedAt: now } });
    expect(mocks.ruleUpdateMany).not.toHaveBeenCalled();
  });

  it('evaluates viral post multiplier rules and requires minimum views and positive baseline', () => {
    const viralRule = rule({ metric: 'viralPostMultiplier', operator: 'gt', threshold: 2 });
    expect(evaluateViralPostRule(viralRule, { views: 2400 }, 1000)).toBe(2.4);
    expect(evaluateViralPostRule(viralRule, { views: 1999 }, 1000)).toBeNull();
    expect(evaluateViralPostRule(viralRule, { views: 80 }, 30)).toBeNull();
    expect(evaluateViralPostRule(viralRule, { views: 2400 }, 0)).toBeNull();
  });

  it('fires viral post alerts once per fresh outlier post when channel has >= 5 baseline posts', async () => {
    mocks.ruleFindMany.mockResolvedValue([
      rule({ id: 9, userId: 11, channelId: null, metric: 'viralPostMultiplier', operator: 'gt', threshold: 2 }),
    ]);
    mocks.subscriptions.mockResolvedValue([{ userId: 11 }]);
    const dayAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    mocks.postFindMany.mockResolvedValue([
      { id: 301, messageId: 801n, text: 'Базовый пост 1', views: 500, forwards: 5, reactions: 10, comments: 2, publishedAt: dayAgo },
      { id: 302, messageId: 802n, text: 'Базовый пост 2', views: 600, forwards: 6, reactions: 12, comments: 3, publishedAt: dayAgo },
      { id: 303, messageId: 803n, text: 'Базовый пост 3', views: 550, forwards: 5, reactions: 11, comments: 2, publishedAt: dayAgo },
      { id: 304, messageId: 804n, text: 'Базовый пост 4', views: 450, forwards: 4, reactions: 9, comments: 1, publishedAt: dayAgo },
      { id: 305, messageId: 805n, text: 'Виральный свежий пост!', views: 1650, forwards: 42, reactions: 90, comments: 15, publishedAt: now },
    ]);
    const send = vi.fn().mockResolvedValue(true);

    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(1);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toContain('TgMon: виральный пост для всех каналов');
    expect(send.mock.calls[0][0]).toContain('1650 просмотров (3x от медианы 550)');
    expect(send.mock.calls[0][0]).toContain('Пересылки: 42');
    expect(send.mock.calls[0][0]).toContain('https://t.me/channel_five/805');
    expect(mocks.postFireCreate).toHaveBeenCalledWith({
      data: { ruleId: 9, postId: 305, firedAt: now },
      select: { id: true },
    });
  });

  it('skips viral post alerts when channel has fewer than 5 historical posts with views', async () => {
    mocks.ruleFindMany.mockResolvedValue([
      rule({ id: 9, channelId: 5, metric: 'viralPostMultiplier', operator: 'gt', threshold: 2 }),
    ]);
    mocks.postFindMany.mockResolvedValue([
      { id: 401, messageId: 901n, text: 'Пост 1', views: 500, forwards: 5, reactions: 10, comments: 2, publishedAt: now },
      { id: 402, messageId: 902n, text: 'Пост 2', views: 2500, forwards: 50, reactions: 80, comments: 10, publishedAt: now },
    ]);
    const send = vi.fn();

    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
