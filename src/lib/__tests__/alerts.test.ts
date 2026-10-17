import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channel } from './fixtures/channel-metrics';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), warn: vi.fn() }));
vi.mock('../prisma', () => ({ prisma: { alertRule: { findMany: mocks.findMany, updateMany: mocks.updateMany } } }));
vi.mock('../logger', () => ({ logger: { warn: mocks.warn } }));

import { ALERT_COOLDOWN_MS, checkChannelAlertRules, evaluateAlertRule, getAlertMetricValue } from '../alerts';

const now = new Date('2026-10-17T12:00:00.000Z');
const metrics = {
  ...channel,
  id: 5,
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
  id: number; channelId: number | null; metric: string; operator: string;
  threshold: number; enabled: boolean; lastFiredAt: Date | null;
}> = {}) {
  return {
    id: 1, channelId: 5, metric: 'followers', operator: 'gt', threshold: 900,
    enabled: true, lastFiredAt: null, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
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
    expect(evaluateAlertRule(rule({ threshold: 1000 }), metrics, now)).toBeNull();
    expect(evaluateAlertRule(rule({ operator: 'lt', threshold: 1001 }), metrics, now)).toBe(1000);
    expect(evaluateAlertRule(rule({ metric: 'delta24h', operator: 'lt', threshold: -10 }), metrics, now)).toBe(-15);
    expect(evaluateAlertRule(rule({ metric: 'contentScore' }), { ...metrics, contentScore: undefined }, now)).toBeNull();
    expect(evaluateAlertRule(rule({ threshold: Number.NaN }), metrics, now)).toBeNull();
  });

  it('enforces channel scope, enabled state, and the 24-hour cooldown', () => {
    expect(evaluateAlertRule(rule({ channelId: null }), metrics, now)).toBe(1000);
    expect(evaluateAlertRule(rule({ channelId: 9 }), metrics, now)).toBeNull();
    expect(evaluateAlertRule(rule({ enabled: false }), metrics, now)).toBeNull();
    expect(evaluateAlertRule(rule({ lastFiredAt: new Date(now.getTime() - ALERT_COOLDOWN_MS + 1) }), metrics, now)).toBeNull();
    expect(evaluateAlertRule(rule({ lastFiredAt: new Date(now.getTime() - ALERT_COOLDOWN_MS) }), metrics, now)).toBe(1000);
  });

  it('claims matching global and channel rules before sending', async () => {
    mocks.findMany.mockResolvedValue([
      rule({ id: 1, channelId: null }),
      rule({ id: 2, metric: 'posts7d', threshold: 7 }),
    ]);
    const send = vi.fn().mockResolvedValue(true);

    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(2);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true, OR: [{ channelId: null }, { channelId: 5 }] },
    }));
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 1, OR: [
        { lastFiredAt: null }, { lastFiredAt: { lte: new Date(now.getTime() - ALERT_COOLDOWN_MS) } },
      ] }),
      data: { lastFiredAt: now },
    }));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toContain('Подписчики: 1000');
  });

  it('does not send if another process already claimed the rule', async () => {
    mocks.findMany.mockResolvedValue([rule()]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const send = vi.fn();

    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('releases the cooldown claim when Telegram delivery fails', async () => {
    const previous = new Date('2026-10-15T00:00:00.000Z');
    mocks.findMany.mockResolvedValue([rule({ lastFiredAt: previous })]);
    const send = vi.fn().mockResolvedValue(false);

    expect(await checkChannelAlertRules(5, async () => metrics, send, now)).toBe(0);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, lastFiredAt: now },
      data: { lastFiredAt: previous },
    });
  });
});
