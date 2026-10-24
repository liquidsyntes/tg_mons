import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { channel } from './fixtures/channel-metrics';

const mocks = vi.hoisted(() => ({
  ruleFindMany: vi.fn(), ruleUpdateMany: vi.fn(),
  fireFindUnique: vi.fn(), fireCreate: vi.fn(), fireUpdateMany: vi.fn(), fireDeleteMany: vi.fn(),
  subscriptions: vi.fn(), transaction: vi.fn(), activeRule: vi.fn(), warn: vi.fn(),
}));
vi.mock('../prisma', () => ({ prisma: {
  alertRule: { findMany: mocks.ruleFindMany, updateMany: mocks.ruleUpdateMany },
  alertRuleFire: { findUnique: mocks.fireFindUnique, create: mocks.fireCreate,
    updateMany: mocks.fireUpdateMany, deleteMany: mocks.fireDeleteMany },
  userChannel: { findMany: mocks.subscriptions },
  $transaction: mocks.transaction,
} }));
vi.mock('../logger', () => ({ logger: { warn: mocks.warn } }));

import { ALERT_COOLDOWN_MS, checkChannelAlertRules, evaluateAlertRule, getAlertMetricValue } from '../alerts';

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
  threshold: number; enabled: boolean; lastFiredAt: Date | null;
}> = {}) {
  return {
    id: 1, userId: null, channelId: 5, metric: 'followers', operator: 'gt', threshold: 900,
    enabled: true, lastFiredAt: null, ...overrides,
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
  mocks.ruleUpdateMany.mockResolvedValue({ count: 1 });
  mocks.activeRule.mockResolvedValue([{ id: 1 }]);
  mocks.transaction.mockImplementation(async callback => callback({
    $queryRaw: mocks.activeRule,
    alertRuleFire: { findUnique: mocks.fireFindUnique, create: mocks.fireCreate, updateMany: mocks.fireUpdateMany },
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
});
