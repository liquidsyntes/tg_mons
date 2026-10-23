import { Prisma, type AlertRule, type AlertRuleFire } from '@prisma/client';
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

type RuleForEvaluation = Pick<AlertRule, 'id' | 'channelId' | 'metric' | 'operator' | 'threshold' | 'enabled'>;
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

/** Returns the measured value when the rule matches. Cooldown is reserved per channel in the database. */
export function evaluateAlertRule(rule: RuleForEvaluation, metrics: ChannelMetrics): number | null {
  if (!rule.enabled || (rule.channelId !== null && rule.channelId !== metrics.id) ||
      !isAlertMetric(rule.metric) || !isAlertOperator(rule.operator) || !Number.isFinite(rule.threshold)) {
    return null;
  }
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
  const username = metrics.username ? ` (@${metrics.username.replace(/^@/, '')})` : '';
  const scope = rule.channelId === null ? 'для всех каналов' : 'для канала';
  return `TgMon: сработало правило ${scope}\nКанал: ${metrics.title}${username}\n${label}: ${value} ${unit}\nУсловие: ${comparison} ${rule.threshold} ${unit}`;
}

type PreviousFire = Pick<AlertRuleFire, 'id' | 'lastFiredAt' | 'lastValue'>;
type FireClaim = { id: number; previous: PreviousFire | null };

async function claimRuleFire(ruleId: number, channelId: number, value: number, now: Date): Promise<FireClaim | null> {
  try {
    return await prisma.$transaction(async tx => {
      const active = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "alert_rules" WHERE "id" = ${ruleId} AND "enabled" = true FOR UPDATE
      `;
      if (active.length === 0) return null;

      const existing = await tx.alertRuleFire.findUnique({
        where: { ruleId_channelId: { ruleId, channelId } },
        select: { id: true, lastFiredAt: true, lastValue: true },
      });
      if (existing) {
        const claimed = await tx.alertRuleFire.updateMany({
          where: { id: existing.id, lastFiredAt: { lte: new Date(now.getTime() - ALERT_COOLDOWN_MS) } },
          data: { lastFiredAt: now, lastValue: value },
        });
        return claimed.count ? { id: existing.id, previous: existing } : null;
      }

      const created = await tx.alertRuleFire.create({
        data: { ruleId, channelId, lastFiredAt: now, lastValue: value },
        select: { id: true },
      });
      return { id: created.id, previous: null };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  }
}

async function releaseRuleFire(claim: FireClaim, now: Date): Promise<void> {
  if (claim.previous) {
    await prisma.alertRuleFire.updateMany({
      where: { id: claim.id, lastFiredAt: now },
      data: { lastFiredAt: claim.previous.lastFiredAt, lastValue: claim.previous.lastValue },
    });
  } else {
    await prisma.alertRuleFire.deleteMany({ where: { id: claim.id, lastFiredAt: now } });
  }
}

/** Claims each matching rule for this channel before sending, then releases it if delivery fails. */
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
  const ownerIds = [...new Set(rules.flatMap(rule => rule.channelId === null && rule.userId !== null ? [rule.userId] : []))];
  const activeOwners = new Set(ownerIds.length
    ? (await prisma.userChannel.findMany({
      where: { channelId, isActive: true, userId: { in: ownerIds } },
      select: { userId: true },
    })).map(subscription => subscription.userId)
    : []);
  const eligibleRules = rules.filter(rule => rule.channelId !== null || rule.userId === null || activeOwners.has(rule.userId));
  if (eligibleRules.length === 0) return 0;
  const metrics = await loadMetrics();
  if (!metrics || metrics.id !== channelId || !metrics.isActive) return 0;
  let sent = 0;
  for (const rule of eligibleRules) {
    const value = evaluateAlertRule(rule, metrics);
    if (value === null) continue;
    const claim = await claimRuleFire(rule.id, channelId, value, now);
    if (!claim) continue;

    let delivered = false;
    try {
      delivered = await send(formatAlert(rule, metrics, value));
    } catch {
      logger.warn('Rule alert delivery failed', { ruleId: rule.id, channelId: metrics.id });
    }
    if (delivered) {
      sent++;
      try {
        await prisma.alertRule.updateMany({
          where: { id: rule.id, OR: [{ lastFiredAt: null }, { lastFiredAt: { lt: now } }] },
          data: { lastFiredAt: now },
        });
      } catch {
        logger.warn('Rule alert timestamp update failed', { ruleId: rule.id, channelId: metrics.id });
      }
    } else {
      logger.warn('Rule alert was not delivered', { ruleId: rule.id, channelId: metrics.id });
      await releaseRuleFire(claim, now);
    }
  }
  return sent;
}
