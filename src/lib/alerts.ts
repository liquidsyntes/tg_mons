import type { AlertRule } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';
import type { ChannelMetrics } from './types';

export const ALERT_METRICS = {
  followers: { label: 'Подписчики', unit: 'подписчиков' },
  delta24h: { label: 'Изменение за 24 часа', unit: 'подписчиков' },
  delta7d: { label: 'Изменение за 7 дней', unit: 'подписчиков' },
  er7d: { label: 'ER за 7 дней', unit: '%' },
  err7d: { label: 'ERR за 7 дней', unit: '%' },
  vr7d: { label: 'VR за 7 дней', unit: '%' },
  avgViews7d: { label: 'Средние просмотры за 7 дней', unit: 'просмотров' },
  posts7d: { label: 'Посты за 7 дней', unit: 'постов' },
  contentScore: { label: 'Content Score', unit: 'баллов' },
} as const;

export type AlertMetric = keyof typeof ALERT_METRICS;
export type AlertOperator = 'gt' | 'lt';
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type RuleForEvaluation = Pick<AlertRule, 'id' | 'channelId' | 'metric' | 'operator' | 'threshold' | 'enabled' | 'lastFiredAt'>;
export type AlertSender = (message: string) => Promise<boolean>;

export function isAlertMetric(value: unknown): value is AlertMetric {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ALERT_METRICS, value);
}

export function isAlertOperator(value: unknown): value is AlertOperator {
  return value === 'gt' || value === 'lt';
}

export function getAlertMetricValue(metrics: ChannelMetrics, metric: AlertMetric): number | null {
  const value = {
    followers: metrics.currentMembers,
    delta24h: metrics.delta24h.abs,
    delta7d: metrics.delta7d.abs,
    er7d: metrics.er7d,
    err7d: metrics.err7d,
    vr7d: metrics.vr7d,
    avgViews7d: metrics.avgViews7d,
    posts7d: metrics.posts7d,
    contentScore: metrics.contentScore,
  }[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Returns the measured value only when a rule matches and its cooldown has elapsed. */
export function evaluateAlertRule(rule: RuleForEvaluation, metrics: ChannelMetrics, now: Date = new Date()): number | null {
  if (!rule.enabled || (rule.channelId !== null && rule.channelId !== metrics.id) ||
      !isAlertMetric(rule.metric) || !isAlertOperator(rule.operator) || !Number.isFinite(rule.threshold)) {
    return null;
  }
  if (rule.lastFiredAt && now.getTime() - rule.lastFiredAt.getTime() < ALERT_COOLDOWN_MS) return null;
  const value = getAlertMetricValue(metrics, rule.metric);
  if (value === null) return null;
  return rule.operator === 'gt'
    ? value > rule.threshold ? value : null
    : value < rule.threshold ? value : null;
}

function formatAlert(rule: RuleForEvaluation, metrics: ChannelMetrics, value: number): string {
  if (!isAlertMetric(rule.metric) || !isAlertOperator(rule.operator)) throw new Error('Unsupported alert rule');
  const { label, unit } = ALERT_METRICS[rule.metric];
  const comparison = rule.operator === 'gt' ? 'больше' : 'меньше';
  return `TgMon: сработало правило\nКанал: ${metrics.title}\n${label}: ${value} ${unit}\nУсловие: ${comparison} ${rule.threshold} ${unit}`;
}

/** Claims each matching rule before sending, then releases the claim if delivery fails. */
export async function checkChannelAlertRules(
  channelId: number,
  loadMetrics: () => Promise<ChannelMetrics | null>,
  send: AlertSender,
  now: Date = new Date(),
): Promise<number> {
  const rules = await prisma.alertRule.findMany({
    where: { enabled: true, OR: [{ channelId: null }, { channelId }] },
    orderBy: { id: 'asc' },
  });
  if (rules.length === 0) return 0;
  const metrics = await loadMetrics();
  if (!metrics || metrics.id !== channelId) return 0;
  const cooldownBefore = new Date(now.getTime() - ALERT_COOLDOWN_MS);
  let sent = 0;
  for (const rule of rules) {
    const value = evaluateAlertRule(rule, metrics, now);
    if (value === null) continue;
    const claim = await prisma.alertRule.updateMany({
      where: {
        id: rule.id,
        enabled: true,
        OR: [{ lastFiredAt: null }, { lastFiredAt: { lte: cooldownBefore } }],
      },
      data: { lastFiredAt: now },
    });
    if (claim.count === 0) continue;

    let delivered = false;
    try {
      delivered = await send(formatAlert(rule, metrics, value));
    } catch {
      logger.warn('Rule alert delivery failed', { ruleId: rule.id, channelId: metrics.id });
    }
    if (delivered) {
      sent++;
    } else {
      await prisma.alertRule.updateMany({
        where: { id: rule.id, lastFiredAt: now },
        data: { lastFiredAt: rule.lastFiredAt },
      });
    }
  }
  return sent;
}
