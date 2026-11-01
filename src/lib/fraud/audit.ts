import type { FraudAuditResult, FraudSignal, UniformReactionRatioInput } from './types';
import {
  checkViewsToSubsRatio,
  checkGrowthSmoothness,
  checkUncorrelatedSpikes,
  checkUniformReactionRatio,
} from './heuristics';
import {
  isRecord,
  extractChannelId,
  resolveViewsToSubsCheck,
  resolveGrowthSmoothnessCheck,
  resolveUncorrelatedSpikesCheck,
  resolveUniformErrCheck,
} from './normalizers';

/**
 * Консолидированный аудит накруток: агрегирует 4 основные проверки (`runFraudAudit`)
 * (views/subs ratio, smooth growth, uncorrelated spikes, uniform ERR).
 *
 * Consolidates four foundational fraud detection heuristics into an interpretable metric:
 * 1. `views_to_subs_ratio` (Соотношение просмотров к подписчикам): Ratio < 0.05 or > 1.50 (+25 pts).
 * 2. `growth_smoothness` (Гладкость роста): Daily subscriber delta CV < 0.1 over >= 14 days (+25 pts).
 * 3. `uncorrelated_spikes` (Нескоррелированные скачки): >= 1 subscriber spike without post or mention (+25 pts).
 * 4. `uniform_err` (Равномерность ERR): Post-to-post ERR CV < 0.1 over 10-20 posts (+25 pts).
 *
 * Mathematical Formula:
 * `fraudScore = sum(flag_j * 25) = 25 * K` where `K in {0, 1, 2, 3, 4}`.
 *
 * Discretized Risk Tiers:
 * - `0`: Чистый канал / Низкий риск (Clean, 0 аномалий).
 * - `25`: Низкий риск (Low Risk, 1 аномалия).
 * - `50`: Умеренный риск (Moderate Risk, 2 аномалии).
 * - `75`: Высокий риск (High Risk, 3 аномалии).
 * - `100`: Критический риск (Critical Risk, все 4 аномалии).
 *
 * Flexibility & Overrides:
 * - Accepts raw channel data (with posts, metrics, mentions) to run live calculations.
 * - Accepts precomputed `fraudSignals` arrays from database persistence.
 * - Accepts boolean flags/overrides or `triggers` sets for synthetic simulation and testing.
 *
 * @param channel Данные канала, симулированные флаги или объект канала из БД с relations
 * @returns {FraudAuditResult} Итоговый результат аудита с комбинированным fraudScore (0-100), сигналами и детализацией проверок
 */
export function runFraudAudit(channel: UniformReactionRatioInput): FraudAuditResult {
  if (!channel || typeof channel !== 'object') {
    return {
      fraudScore: 0,
      signals: [],
      details: {
        viewsToSubsRatio: { flag: false, ratio: 0, reason: "Нет данных канала" },
        growthSmoothness: { flag: false, cv: 0, reason: "Нет данных канала" },
        uncorrelatedSpikes: { flag: false, spikesCount: 0, dates: [], reason: "Нет данных канала" },
        uniformReactionRatio: { flag: false, cv: 0, reason: "Нет данных канала" },
      },
    };
  }

  const channelRecord: Record<string, unknown> = isRecord(channel) ? channel : {};

  const ratioResult = resolveViewsToSubsCheck(channelRecord, channel, checkViewsToSubsRatio);
  const smoothnessResult = resolveGrowthSmoothnessCheck(channelRecord, checkGrowthSmoothness);
  const spikeResult = resolveUncorrelatedSpikesCheck(channelRecord, checkUncorrelatedSpikes);
  const uniformResult = resolveUniformErrCheck(channelRecord, channel, checkUniformReactionRatio);

  // Агрегируем сигналы и вычисляем fraudScore
  const signals: FraudSignal[] = [];
  const resolvedChannelId = extractChannelId(channelRecord);

  const checksToAggregate: Array<{
    flag: boolean;
    signalType: string;
    value: number;
    reason: string;
  }> = [
    {
      flag: ratioResult.flag,
      signalType: 'views_to_subs_ratio',
      value: ratioResult.ratio,
      reason: ratioResult.reason,
    },
    {
      flag: smoothnessResult.flag,
      signalType: 'growth_smoothness',
      value: smoothnessResult.cv,
      reason: smoothnessResult.reason,
    },
    {
      flag: spikeResult.flag,
      signalType: 'uncorrelated_spikes',
      value: spikeResult.spikesCount,
      reason: spikeResult.reason,
    },
    {
      flag: uniformResult.flag,
      signalType: 'uniform_err',
      value: uniformResult.cv,
      reason: uniformResult.reason,
    },
  ];

  for (const check of checksToAggregate) {
    if (check.flag) {
      signals.push({
        signalType: check.signalType,
        value: check.value,
        reason: check.reason,
        channelId: resolvedChannelId,
      });
    }
  }

  return {
    fraudScore: signals.length * 25,
    signals,
    details: {
      viewsToSubsRatio: ratioResult,
      growthSmoothness: smoothnessResult,
      uncorrelatedSpikes: spikeResult,
      uniformReactionRatio: uniformResult,
    },
  };
}
