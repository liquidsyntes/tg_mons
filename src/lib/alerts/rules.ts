import type { AlertRule } from '@prisma/client';
import type { ChannelMetrics } from '../types';
import { ALERT_METRICS, MAX_KEYWORD_QUERY_LENGTH, MAX_KEYWORD_SNIPPET_LENGTH, MIN_VIRAL_ALERT_VIEWS, type AlertMetric, type NumericAlertMetric, type AlertOperator, type RuleForEvaluation } from './types';

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

export function formatAlert(rule: RuleForEvaluation, metrics: ChannelMetrics, value: number): string {
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
