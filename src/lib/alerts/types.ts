import type { AlertRule } from '@prisma/client';

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

export type RuleForEvaluation = Pick<AlertRule, 'id' | 'channelId' | 'metric' | 'operator' | 'threshold' | 'enabled'> & {
  keywordQuery?: string | null;
};
export type AlertSender = (message: string) => Promise<boolean>;

export interface AlertPostRow {
  id: number;
  messageId: bigint;
  text: string | null;
  publishedAt: Date;
  views?: number | null;
  forwards?: number | null;
  reactions?: number | null;
  comments?: number | null;
}
