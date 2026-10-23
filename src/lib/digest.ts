import { prisma } from './prisma';
import { getOverviewStats } from './metrics';
import { logger } from './logger';
import type { AlertSender } from './alerts';
import type { ChannelMetrics, DailyDigestSummary, DigestChannel } from './types';
import { sendTelegramRuleAlert } from '../worker/retry-policy';

const DAY_MS = 24 * 60 * 60 * 1000;
const numberFormat = new Intl.NumberFormat('ru-RU');

function toDigestChannel(channel: ChannelMetrics): DigestChannel {
  return {
    title: channel.title,
    currentMembers: channel.currentMembers,
    delta24h: channel.delta24h.abs,
    er7d: channel.er7d,
    err7d: channel.err7d,
    posts24h: channel.posts24h,
  };
}

export async function buildDailyDigest(now: Date = new Date()): Promise<DailyDigestSummary> {
  const overview = await getOverviewStats();
  const active = overview.channels.filter(channel => channel.isActive);
  const recentFraudSignals = await prisma.fraudSignal.count({
    where: {
      channel: { isActive: true },
      detectedAt: { gte: new Date(now.getTime() - DAY_MS), lte: now },
    },
  });
  const growth = active.filter(channel => channel.delta24h.abs !== null);
  const myChannel = active.find(channel => channel.isMine);
  return {
    activeChannels: active.length,
    totalAudience: active.reduce((sum, channel) => sum + (channel.currentMembers ?? 0), 0),
    channelsWithoutAudience: active.filter(channel => channel.currentMembers === null).length,
    myChannel: myChannel ? toDigestChannel(myChannel) : null,
    topGainers: growth.filter(channel => (channel.delta24h.abs ?? 0) > 0)
      .sort((a, b) => (b.delta24h.abs ?? 0) - (a.delta24h.abs ?? 0)).slice(0, 3).map(toDigestChannel),
    topLosers: growth.filter(channel => (channel.delta24h.abs ?? 0) < 0)
      .sort((a, b) => (a.delta24h.abs ?? 0) - (b.delta24h.abs ?? 0)).slice(0, 3).map(toDigestChannel),
    recentFraudSignals,
    problemChannels: active.filter(channel => channel.consecutiveErrors > 0).length,
  };
}

function formatNumber(value: number | null): string {
  return value === null ? 'нет данных' : numberFormat.format(value);
}

function formatDelta(value: number | null): string {
  return value === null ? 'нет данных' : `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? 'нет данных' : `${numberFormat.format(value)}%`;
}

export function formatDailyDigest(summary: DailyDigestSummary, now: Date): string {
  const lines = [
    `TgMon: ежедневный дайджест за 24 часа (${now.toISOString().slice(0, 10)} UTC)`,
    `Активных каналов: ${formatNumber(summary.activeChannels)}`,
    `Суммарная аудитория: ${formatNumber(summary.totalAudience)}${summary.channelsWithoutAudience ? ' (по доступным данным)' : ''}`,
  ];
  if (summary.myChannel) {
    const channel = summary.myChannel;
    lines.push('', `Мой канал: ${channel.title}`,
      `Подписчики: ${formatNumber(channel.currentMembers)}; за 24 часа: ${formatDelta(channel.delta24h)}`,
      `ER 7 дней: ${formatPercent(channel.er7d)}; ERR 7 дней: ${formatPercent(channel.err7d)}`,
      `Постов за 24 часа: ${formatNumber(channel.posts24h)}`);
  }
  const formatLeaders = (channels: DigestChannel[]) => channels.length
    ? channels.map((channel, index) => `${index + 1}. ${channel.title}: ${formatDelta(channel.delta24h)}`)
    : ['Нет каналов с изменением подписчиков'];
  lines.push('', 'Лидеры роста:', ...formatLeaders(summary.topGainers),
    '', 'Лидеры падения:', ...formatLeaders(summary.topLosers),
    '', `Антифрод-сигналов за 24 часа: ${formatNumber(summary.recentFraudSignals)}`,
    `Каналов с ошибками сейчас: ${formatNumber(summary.problemChannels)}`);
  return lines.join('\n');
}

export async function runDailyDigestIfDue(
  now: Date = new Date(),
  send: AlertSender = sendTelegramRuleAlert,
): Promise<boolean> {
  const settings = await prisma.systemSetting.findUnique({ where: { id: 'global' } });
  if (!settings?.digestEnabled || settings.digestHour !== now.getUTCHours()) return false;

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (settings.lastDigestAt && settings.lastDigestAt >= today) return false;

  const summary = await buildDailyDigest(now);
  const claim = await prisma.systemSetting.updateMany({
    where: {
      id: 'global', digestEnabled: true, digestHour: now.getUTCHours(),
      OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: today } }],
    },
    data: { lastDigestAt: now },
  });
  if (claim.count === 0) return false;

  let delivered = false;
  try {
    delivered = await send(formatDailyDigest(summary, now));
  } catch (error) {
    logger.error('Daily digest delivery failed', undefined, error);
  }
  if (delivered) return true;

  logger.warn('Daily digest was not delivered');
  await prisma.systemSetting.updateMany({
    where: { id: 'global', lastDigestAt: now },
    data: { lastDigestAt: settings.lastDigestAt },
  });
  return false;
}
