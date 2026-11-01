import { logger } from '../logger';
import type { ChannelMetrics } from '../types';
import type { AlertPostRow, AlertSender, RuleForEvaluation } from './types';
import { evaluateAlertRule, evaluateViralPostRule, formatAlert, formatKeywordAlert, formatViralPostAlert, matchKeywordRule, normalizeKeywordQuery } from './rules';
import { claimRuleFire, claimKeywordPostFire, releaseRuleFire, releaseKeywordPostFire, recordRuleFiredAt } from './reservations';

interface DeliveryContext {
  ruleId: number;
  channelId: number;
  postId?: number;
}

async function deliverReservedAlert(
  context: DeliveryContext,
  sendMessage: () => Promise<boolean>,
  release: () => Promise<void>,
  failureEvent: string,
  undeliveredEvent: string,
  now: Date,
): Promise<number> {
  let delivered = false;
  try {
    delivered = await sendMessage();
  } catch {
    logger.warn(failureEvent, { ...context });
  }
  if (delivered) {
    await recordRuleFiredAt(context.ruleId, context.channelId, now);
    return 1;
  }
  logger.warn(undeliveredEvent, { ...context });
  await release();
  return 0;
}

export async function sendKeywordAlerts(
  rule: RuleForEvaluation, metrics: ChannelMetrics, posts: AlertPostRow[], send: AlertSender, now: Date,
): Promise<number> {
  if (!rule.enabled || normalizeKeywordQuery(rule.keywordQuery) === null) return 0;
  let sent = 0;
  for (const post of posts) {
    const text = post.text;
    if (!text) continue;
    const matchedKeyword = matchKeywordRule(text, rule.keywordQuery);
    if (!matchedKeyword) continue;
    const claim = await claimKeywordPostFire(rule.id, post.id, now);
    if (!claim) continue;
    sent += await deliverReservedAlert(
      { ruleId: rule.id, channelId: metrics.id, postId: post.id },
      () => send(formatKeywordAlert(rule, metrics, { messageId: post.messageId, text }, matchedKeyword)),
      () => releaseKeywordPostFire(claim, now),
      'Keyword alert delivery failed', 'Keyword alert was not delivered', now,
    );
  }
  return sent;
}

export async function sendViralAlerts(
  rule: RuleForEvaluation, metrics: ChannelMetrics, posts: AlertPostRow[], medianViews: number,
  send: AlertSender, now: Date,
): Promise<number> {
  let sent = 0;
  for (const post of posts) {
    const views = post.views ?? null;
    const multiplier = evaluateViralPostRule(rule, { views }, medianViews);
    if (multiplier === null || typeof views !== 'number') continue;
    const claim = await claimKeywordPostFire(rule.id, post.id, now);
    if (!claim) continue;
    sent += await deliverReservedAlert(
      { ruleId: rule.id, channelId: metrics.id, postId: post.id },
      () => send(formatViralPostAlert(rule, metrics, {
        messageId: post.messageId, text: post.text, views, forwards: post.forwards ?? null,
      }, medianViews, multiplier)),
      () => releaseKeywordPostFire(claim, now),
      'Viral post alert delivery failed', 'Viral post alert was not delivered', now,
    );
  }
  return sent;
}

export async function sendNumericAlert(
  rule: RuleForEvaluation, metrics: ChannelMetrics, send: AlertSender, now: Date,
): Promise<number> {
  const value = evaluateAlertRule(rule, metrics);
  if (value === null) return 0;
  const claim = await claimRuleFire(rule.id, metrics.id, value, now);
  if (!claim) return 0;
  return deliverReservedAlert(
    { ruleId: rule.id, channelId: metrics.id },
    () => send(formatAlert(rule, metrics, value)),
    () => releaseRuleFire(claim, now),
    'Rule alert delivery failed', 'Rule alert was not delivered', now,
  );
}
