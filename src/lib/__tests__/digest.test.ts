import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channel } from './fixtures/channel-metrics';

const mocks = vi.hoisted(() => ({
  findSettings: vi.fn(),
  updateSettings: vi.fn(),
  findUsers: vi.fn(),
  updateUsers: vi.fn(),
  countSignals: vi.fn(),
  getOverview: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../prisma', () => ({ prisma: {
  systemSetting: { findUnique: mocks.findSettings, updateMany: mocks.updateSettings },
  user: { findMany: mocks.findUsers, updateMany: mocks.updateUsers },
  fraudSignal: { count: mocks.countSignals },
} }));
vi.mock('../metrics', () => ({ getOverviewStats: mocks.getOverview }));
vi.mock('../logger', () => ({ logger: { warn: mocks.warn, error: mocks.error } }));
vi.mock('../../worker/retry-policy', () => ({ sendTelegramRuleAlert: vi.fn() }));

import { buildDailyDigest, formatDailyDigest, normalizeTelegramChatId, runDailyDigestIfDue } from '../digest';

const now = new Date('2026-10-23T09:05:00.000Z');
const settings = { id: 'global', digestEnabled: true, digestHour: 9, lastDigestAt: null };
const mine = { ...channel, id: 1, title: 'Мой канал', isMine: true, currentMembers: 1000,
  delta24h: { abs: 20, percent: 2 }, posts24h: 2, er7d: 3, err7d: null };
const falling = { ...channel, id: 2, title: 'Падение', isMine: false, currentMembers: 500,
  delta24h: { abs: -10, percent: -2 }, consecutiveErrors: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSettings.mockResolvedValue(settings);
  mocks.updateSettings.mockResolvedValue({ count: 1 });
  mocks.findUsers.mockResolvedValue([]);
  mocks.updateUsers.mockResolvedValue({ count: 1 });
  mocks.countSignals.mockResolvedValue(2);
  mocks.getOverview.mockResolvedValue({ channels: [mine, falling] });
});

describe('daily digest data and text', () => {
  it('uses only active channels and signals from the last 24 hours', async () => {
    mocks.getOverview.mockResolvedValue({ channels: [mine, falling, { ...channel, id: 3, isActive: false }] });
    const summary = await buildDailyDigest(now);
    expect(summary).toMatchObject({ activeChannels: 2, totalAudience: 1500, recentFraudSignals: 2,
      problemChannels: 1, myChannel: { title: 'Мой канал', posts24h: 2 } });
    expect(summary.topGainers.map(item => item.title)).toEqual(['Мой канал']);
    expect(summary.topLosers.map(item => item.title)).toEqual(['Падение']);
    expect(mocks.countSignals).toHaveBeenCalledWith({ where: {
      channel: { isActive: true },
      detectedAt: { gte: new Date('2026-10-22T09:05:00.000Z'), lte: now },
    } });
    expect(formatDailyDigest(summary, now)).toContain('ERR 7 дней: нет данных');
  });

  it('formats an empty digest without a my channel', async () => {
    mocks.getOverview.mockResolvedValue({ channels: [] });
    mocks.countSignals.mockResolvedValue(0);
    const text = formatDailyDigest(await buildDailyDigest(now), now);
    expect(text).toContain('Активных каналов: 0');
    expect(text).toContain('Нет каналов с изменением подписчиков');
    expect(text).not.toContain('Мой канал:');
  });
});

describe('daily digest schedule', () => {
  it('skips disabled, wrong-hour, and already delivered digests', async () => {
    const send = vi.fn();
    for (const value of [
      { ...settings, digestEnabled: false },
      { ...settings, digestHour: 10 },
      { ...settings, lastDigestAt: new Date('2026-10-23T00:00:00.000Z') },
    ]) {
      mocks.findSettings.mockResolvedValueOnce(value);
      expect(await runDailyDigestIfDue(now, send)).toBe(false);
    }
    expect(mocks.getOverview).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('claims the UTC day and sends once', async () => {
    const send = vi.fn().mockResolvedValue(true);
    expect(await runDailyDigestIfDue(now, send)).toBe(true);
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      where: { id: 'global', digestEnabled: true, digestHour: 9,
        OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date('2026-10-23T00:00:00.000Z') } }] },
      data: { lastDigestAt: now },
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toContain('Мой канал');
  });

  it('does not send when another process claimed the same day', async () => {
    mocks.updateSettings.mockResolvedValue({ count: 0 });
    const send = vi.fn();
    expect(await runDailyDigestIfDue(now, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['returned false', 'threw'])('restores the prior delivery time when sender %s', async failure => {
    const previous = new Date('2026-10-22T09:00:00.000Z');
    mocks.findSettings.mockResolvedValue({ ...settings, lastDigestAt: previous });
    const send = failure === 'threw' ? vi.fn().mockRejectedValue(new Error('Telegram unavailable'))
      : vi.fn().mockResolvedValue(false);
    expect(await runDailyDigestIfDue(now, send)).toBe(false);
    expect(mocks.updateSettings).toHaveBeenLastCalledWith({
      where: { id: 'global', lastDigestAt: now }, data: { lastDigestAt: previous },
    });
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('validates Telegram chat IDs and scopes per-user digest and fraud signals to user channels', async () => {
    expect(normalizeTelegramChatId(' 123456789 ')).toBe('123456789');
    expect(normalizeTelegramChatId('-100987654321')).toBe('-100987654321');
    expect(normalizeTelegramChatId('@my_digest_chan')).toBe('@my_digest_chan');
    expect(normalizeTelegramChatId('invalid chat id')).toBeNull();

    const summary = await buildDailyDigest(now, 42);
    expect(mocks.getOverview).toHaveBeenCalledWith(42);
    expect(mocks.countSignals).toHaveBeenCalledWith({
      where: {
        channelId: { in: [1, 2] },
        detectedAt: { gte: new Date('2026-10-22T09:05:00.000Z'), lte: now },
      },
    });
    expect(summary.activeChannels).toBe(2);
  });

  it('delivers per-user digests independently and restores only the failed user timestamp', async () => {
    mocks.findSettings.mockResolvedValue({ ...settings, digestEnabled: false });
    const previous = new Date('2026-10-22T09:00:00.000Z');
    mocks.findUsers.mockResolvedValue([
      { id: 11, telegramChatId: '111111', lastDigestAt: null },
      { id: 12, telegramChatId: '222222', lastDigestAt: previous },
    ]);
    const send = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    expect(await runDailyDigestIfDue(now, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]).toBe('111111');
    expect(send.mock.calls[1][1]).toBe('222222');
    expect(mocks.updateUsers).toHaveBeenLastCalledWith({
      where: { id: 12, lastDigestAt: now },
      data: { lastDigestAt: previous },
    });
  });
});
