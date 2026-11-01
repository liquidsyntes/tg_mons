export {
  ALERT_METRICS, ALERT_COOLDOWN_MS, VIRAL_BASELINE_WINDOW_MS,
  MIN_VIRAL_ALERT_VIEWS, MAX_KEYWORD_QUERY_LENGTH, MAX_KEYWORD_SNIPPET_LENGTH,
} from './alerts/types';
export type { AlertMetric, NumericAlertMetric, AlertOperator, AlertSender } from './alerts/types';
export {
  isAlertMetric, isNumericAlertMetric, isAlertOperator, normalizeKeywordQuery,
  parseKeywordTerms, matchKeywordRule, getAlertMetricValue, evaluateAlertRule,
  formatKeywordAlert, evaluateViralPostRule, formatViralPostAlert,
} from './alerts/rules';
export { checkChannelAlertRules } from './alerts/evaluate';
