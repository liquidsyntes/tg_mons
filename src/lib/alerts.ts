import { Prisma, type AlertRule, type AlertRuleFire } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';
import { calculateViralBaseline } from './metrics/viral';
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
  keyword: { label: 'Упоминание ключевого слова', unit: 'фраза' },
  viralPostMultiplier: { label: 'Виральный пост (множитель к медиане охвата)', unit: 'x' },
} as const;

export type AlertMetric = keyof typeof ALERT_METRICS;
export type NumericAlertMetric = Exclude<AlertMetric, 'keyword' | 'viralPostMultiplier'>;
export type AlertOperator = 'gt' | 'lt';
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const VIRAL_BASELINE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_VIRAL_ALERT_VIEWS = 100;
export const MAX_KEYWORD_QUERY_LENGTH = 100;
export const MAX_KEYWORD_SNIPPET_LENGTH = 200;

type RuleForEvaluation = Pick<AlertRule, 'id' | 'channelId' | 'metric' | 'operator' | 'threshold' | 'enabled'> & {
  keywordQuery?: string | null;
};
export type AlertSender = (message: string) => Promise<boolean>;

export function isAlertMetric(value: unknown): value is AlertMetric {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ALERT_METRICS, value);
}

export function isNumericAlertMetric(value: unknown): value is NumericAlertMetric {
  return isAlertMetric(value) && value !== 'keyword' && value !== 'viralPostMultiplier';
}

export function isAlertOperator(value: unknown): value is AlertOperator {
  return value === 'gt' || value === 'lt';
}

export function normalizeKeywordQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_KEYWORD_QUERY_LENGTH) return null;

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of trimmed.split(',')) {
    const normalized = part.trim().replace(/\s+/g, ' ');
    if (!normalized) continue;
    const lower = normalized.toLocaleLowerCase('ru-RU');
    if (seen.has(lower)) continue;
    seen.add(lower);
    terms.push(normalized);
  }
  if (terms.length === 0) return null;
  const joined = terms.join(', ');
  return joined.length <= MAX_KEYWORD_QUERY_LENGTH ? joined : null;
}

export function parseKeywordTerms(keywordQuery: string | null | undefined): string[] {
  const normalized = normalizeKeywordQuery(keywordQuery);
  if (!normalized) return [];
  return normalized.split(', ').filter(Boolean);
}

export function matchKeywordRule(
  text: string | null | undefined,
  keywordQuery: string | null | undefined,
): string | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const terms = parseKeywordTerms(keywordQuery);
  if (terms.length === 0) return null;

  const haystack = text.toLocaleLowerCase('ru-RU');
  for (const term of terms) {
    if (haystack.includes(term.toLocaleLowerCase('ru-RU'))) {
      return term;
    }
  }
  return null;
}

export function getAlertMetricValue(metrics: ChannelMetrics, metric: AlertMetric): number | null {
  if (metric === 'keyword' || metric === 'viralPostMultiplier') return null;
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
      !isNumericAlertMetric(rule.metric) || !isAlertOperator(rule.operator) || !Number.isFinite(rule.threshold)) {
    return null;
  }
  const value = getAlertMetricValue(metrics, rule.metric);
  if (value === null) return null;
  return rule.operator === 'gt'
    ? value > rule.threshold ? value : null
    : value < rule.threshold ? value : null;
}

function formatAlert(rule: RuleForEvaluation, metrics: ChannelMetrics, value: number): string {
  if (!isNumericAlertMetric(rule.metric) || !isAlertOperator(rule.operator)) throw new Error('Unsupported alert rule');
  const { label, unit } = ALERT_METRICS[rule.metric];
  const comparison = rule.operator === 'gt' ? 'больше' : 'меньше';
  const username = metrics.username ? ` (@${metrics.username.replace(/^@/, '')})` : '';
  const scope = rule.channelId === null ? 'для всех каналов' : 'для канала';
  return `TgMon: сработало правило ${scope}\nКанал: ${metrics.title}${username}\n${label}: ${value} ${unit}\nУсловие: ${comparison} ${rule.threshold} ${unit}`;
}

export function formatKeywordAlert(
  rule: Pick<AlertRule, 'channelId'>,
  channel: Pick<ChannelMetrics, 'title' | 'username'>,
  post: { messageId: bigint | number; text: string },
  matchedKeyword: string,
): string {
  const cleanUsername = channel.username ? channel.username.replace(/^@/, '') : null;
  const usernameSuffix = cleanUsername ? ` (@${cleanUsername})` : '';
  const scope = rule.channelId === null ? 'для всех каналов' : 'для канала';
  const normalizedText = post.text.replace(/\s+/g, ' ').trim();
  const snippet = normalizedText.length > MAX_KEYWORD_SNIPPET_LENGTH
    ? `${normalizedText.slice(0, MAX_KEYWORD_SNIPPET_LENGTH).trimEnd()}…`
    : normalizedText;
  const messageIdStr = String(post.messageId);
  const link = cleanUsername && messageIdStr && messageIdStr !== '0'
    ? `https://t.me/${cleanUsername}/${messageIdStr}`
    : null;

  const lines = [
    `TgMon: упоминание ключевого слова ${scope}`,
    `Канал: ${channel.title}${usernameSuffix}`,
    `Ключевое слово: «${matchedKeyword}»`,
    `Текст: ${snippet}`,
  ];
  if (link) lines.push(`Ссылка: ${link}`);
  return lines.join('\n');
}

export function evaluateViralPostRule(
  rule: RuleForEvaluation,
  post: { views?: number | null },
  medianViews: number,
): number | null {
  if (!rule.enabled || rule.metric !== 'viralPostMultiplier' || rule.operator !== 'gt' ||
      !Number.isFinite(rule.threshold) || rule.threshold <= 0 ||
      !Number.isFinite(medianViews) || medianViews <= 0) {
    return null;
  }
  if (typeof post.views !== 'number' || !Number.isFinite(post.views) || post.views < MIN_VIRAL_ALERT_VIEWS) {
    return null;
  }
  if (post.views < rule.threshold * medianViews) {
    return null;
  }
  return Number((post.views / medianViews).toFixed(1));
}

export function formatViralPostAlert(
  rule: Pick<AlertRule, 'channelId' | 'threshold'>,
  channel: Pick<ChannelMetrics, 'title' | 'username'>,
  post: { messageId: bigint | number; text?: string | null; views: number; forwards?: number | null },
  medianViews: number,
  multiplier: number,
): string {
  const cleanUsername = channel.username ? channel.username.replace(/^@/, '') : null;
  const usernameSuffix = cleanUsername ? ` (@${cleanUsername})` : '';
  const scope = rule.channelId === null ? 'для всех каналов' : 'для канала';
  const messageIdStr = String(post.messageId);
  const link = cleanUsername && messageIdStr && messageIdStr !== '0'
    ? `https://t.me/${cleanUsername}/${messageIdStr}`
    : null;

  const lines = [
    `TgMon: виральный пост ${scope}`,
    `Канал: ${channel.title}${usernameSuffix}`,
    `Охват: ${post.views} просмотров (${multiplier}x от медианы ${Math.round(medianViews)})`,
    `Условие: больше ${rule.threshold} x`,
  ];
  if (typeof post.forwards === 'number' && Number.isFinite(post.forwards)) {
    lines.push(`Пересылки: ${post.forwards}`);
  }
  if (typeof post.text === 'string' && post.text.trim()) {
    const normalizedText = post.text.replace(/\s+/g, ' ').trim();
    const snippet = normalizedText.length > MAX_KEYWORD_SNIPPET_LENGTH
      ? `${normalizedText.slice(0, MAX_KEYWORD_SNIPPET_LENGTH).trimEnd()}…`
      : normalizedText;
    lines.push(`Текст: ${snippet}`);
  }
  if (link) lines.push(`Ссылка: ${link}`);
  return lines.join('\n');
}

type PreviousFire = Pick<AlertRuleFire, 'id' | 'lastFiredAt' | 'lastValue'>;
type FireClaim = { id: number; previous: PreviousFire | null };
type PostFireClaim = { id: number };
interface AlertPostRow {
  id: number;
  messageId: bigint;
  text: string | null;
  publishedAt: Date;
  views?: number | null;
  forwards?: number | null;
  reactions?: number | null;
  comments?: number | null;
}

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

async function claimKeywordPostFire(ruleId: number, postId: number, now: Date): Promise<PostFireClaim | null> {
  try {
    return await prisma.$transaction(async tx => {
      const active = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "alert_rules" WHERE "id" = ${ruleId} AND "enabled" = true FOR UPDATE
      `;
      if (active.length === 0) return null;

      const existing = await tx.alertRulePostFire.findUnique({
        where: { ruleId_postId: { ruleId, postId } },
        select: { id: true },
      });
      if (existing) return null;

      const created = await tx.alertRulePostFire.create({
        data: { ruleId, postId, firedAt: now },
        select: { id: true },
      });
      return { id: created.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  }
}

async function releaseKeywordPostFire(claim: PostFireClaim, now: Date): Promise<void> {
  await prisma.alertRulePostFire.deleteMany({ where: { id: claim.id, firedAt: now } });
}

async function recordRuleFiredAt(ruleId: number, channelId: number, now: Date): Promise<void> {
  try {
    await prisma.alertRule.updateMany({
      where: { id: ruleId, OR: [{ lastFiredAt: null }, { lastFiredAt: { lt: now } }] },
      data: { lastFiredAt: now },
    });
  } catch {
    logger.warn('Rule alert timestamp update failed', { ruleId, channelId });
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
  const ownerIds = [...new Set(rules.flatMap(rule =>
    (rule.channelId === null || rule.metric === 'keyword' || rule.metric === 'viralPostMultiplier') && rule.userId !== null
      ? [rule.userId]
      : []
  ))];
  const activeOwners = new Set(ownerIds.length
    ? (await prisma.userChannel.findMany({
      where: { channelId, isActive: true, userId: { in: ownerIds } },
      select: { userId: true },
    })).map(subscription => subscription.userId)
    : []);
  const eligibleRules = rules.filter(rule => {
    if (rule.channelId !== null && rule.channelId !== channelId) return false;
    if ((rule.channelId === null || rule.metric === 'keyword' || rule.metric === 'viralPostMultiplier') && rule.userId !== null) {
      return activeOwners.has(rule.userId);
    }
    return true;
  });
  if (eligibleRules.length === 0) return 0;
  const metrics = await loadMetrics();
  if (!metrics || metrics.id !== channelId || !metrics.isActive) return 0;

  const hasKeywordRules = eligibleRules.some(
    rule => rule.metric === 'keyword' && normalizeKeywordQuery(rule.keywordQuery) !== null,
  );
  const hasViralRules = eligibleRules.some(
    rule => rule.metric === 'viralPostMultiplier' && rule.operator === 'gt' &&
      Number.isFinite(rule.threshold) && rule.threshold > 0,
  );
  const recentWindowStart = new Date(now.getTime() - ALERT_COOLDOWN_MS);

  const loadedPosts: AlertPostRow[] = hasViralRules
    ? await prisma.post.findMany({
      where: {
        channelId,
        publishedAt: { gte: new Date(now.getTime() - VIRAL_BASELINE_WINDOW_MS) },
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        messageId: true,
        text: true,
        views: true,
        forwards: true,
        reactions: true,
        comments: true,
        publishedAt: true,
      },
    })
    : hasKeywordRules
      ? await prisma.post.findMany({
        where: {
          channelId,
          publishedAt: { gte: recentWindowStart },
          text: { not: null },
        },
        orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
        select: { id: true, messageId: true, text: true, publishedAt: true },
      })
      : [];

  const viralBaseline = hasViralRules ? calculateViralBaseline(loadedPosts) : null;
  const recentPosts = hasViralRules
    ? loadedPosts.filter(post => post.publishedAt >= recentWindowStart)
    : loadedPosts;

  let sent = 0;
  for (const rule of eligibleRules) {
    if (rule.metric === 'keyword') {
      if (!rule.enabled || normalizeKeywordQuery(rule.keywordQuery) === null) continue;
      for (const post of recentPosts) {
        if (!post.text) continue;
        const matchedKeyword = matchKeywordRule(post.text, rule.keywordQuery);
        if (!matchedKeyword) continue;

        const claim = await claimKeywordPostFire(rule.id, post.id, now);
        if (!claim) continue;

        let delivered = false;
        try {
          delivered = await send(
            formatKeywordAlert(rule, metrics, { messageId: post.messageId, text: post.text }, matchedKeyword),
          );
        } catch {
          logger.warn('Keyword alert delivery failed', { ruleId: rule.id, channelId: metrics.id, postId: post.id });
        }
        if (delivered) {
          sent++;
          await recordRuleFiredAt(rule.id, metrics.id, now);
        } else {
          logger.warn('Keyword alert was not delivered', { ruleId: rule.id, channelId: metrics.id, postId: post.id });
          await releaseKeywordPostFire(claim, now);
        }
      }
      continue;
    }

    if (rule.metric === 'viralPostMultiplier') {
      if (!viralBaseline) continue;
      for (const post of recentPosts) {
        const postViews = post.views ?? null;
        const multiplier = evaluateViralPostRule(rule, { views: postViews }, viralBaseline.medianViews);
        if (multiplier === null || typeof postViews !== 'number') continue;

        const claim = await claimKeywordPostFire(rule.id, post.id, now);
        if (!claim) continue;

        let delivered = false;
        try {
          delivered = await send(
            formatViralPostAlert(
              rule,
              metrics,
              {
                messageId: post.messageId,
                text: post.text,
                views: postViews,
                forwards: post.forwards ?? null,
              },
              viralBaseline.medianViews,
              multiplier,
            ),
          );
        } catch {
          logger.warn('Viral post alert delivery failed', { ruleId: rule.id, channelId: metrics.id, postId: post.id });
        }
        if (delivered) {
          sent++;
          await recordRuleFiredAt(rule.id, metrics.id, now);
        } else {
          logger.warn('Viral post alert was not delivered', { ruleId: rule.id, channelId: metrics.id, postId: post.id });
          await releaseKeywordPostFire(claim, now);
        }
      }
      continue;
    }

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
      await recordRuleFiredAt(rule.id, metrics.id, now);
    } else {
      logger.warn('Rule alert was not delivered', { ruleId: rule.id, channelId: metrics.id });
      await releaseRuleFire(claim, now);
    }
  }
  return sent;
}
