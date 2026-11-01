import { prisma } from '../prisma';
import { calculateViralBaseline } from '../metrics/viral';
import type { ChannelMetrics } from '../types';
import { ALERT_COOLDOWN_MS, VIRAL_BASELINE_WINDOW_MS, type AlertPostRow, type AlertSender } from './types';
import { normalizeKeywordQuery } from './rules';
import { sendKeywordAlerts, sendViralAlerts, sendNumericAlert } from './delivery';

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
      sent += await sendKeywordAlerts(rule, metrics, recentPosts, send, now);
    } else if (rule.metric === 'viralPostMultiplier') {
      if (viralBaseline) sent += await sendViralAlerts(rule, metrics, recentPosts, viralBaseline.medianViews, send, now);
    } else {
      sent += await sendNumericAlert(rule, metrics, send, now);
    }
  }
  return sent;
}
