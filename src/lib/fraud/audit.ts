import type { FraudAuditResult, FraudSignal, UniformReactionRatioInput } from './types';
import {
  checkViewsToSubsRatio,
  checkGrowthSmoothness,
  checkUncorrelatedSpikes,
  checkUniformReactionRatio,
  checkHourlyViewProfile,
  checkNightBotActivity,
} from './heuristics';
import {
  isRecord,
  extractChannelId,
  resolveViewsToSubsCheck,
  resolveGrowthSmoothnessCheck,
  resolveUncorrelatedSpikesCheck,
  resolveUniformErrCheck,
  resolveHourlyViewProfileCheck,
  resolveNightBotActivityCheck,
} from './normalizers';

/**
 * Консолидированный аудит накруток: агрегирует 6 эвристических проверок (`runFraudAudit`)
 * (views/subs ratio, smooth growth, uncorrelated spikes, uniform ERR, hourly view profile, night bot activity).
 *
 * Consolidates anti-fraud detection heuristics into a unified risk score:
 * 1. `views_to_subs_ratio` (Соотношение просмотров к подписчикам): Ratio < 0.05 or > 1.50 (+25 pts).
 * 2. `growth_smoothness` (Гладкость роста): Daily subscriber delta CV < 0.1 over >= 14 days (+25 pts).
 * 3. `uncorrelated_spikes` (Нескоррелированные скачки): >= 1 subscriber spike without post or mention (+25 pts).
 * 4. `uniform_err` (Равномерность ERR): Post-to-post ERR CV < 0.1 over 10-20 posts (+25 pts).
 * 5. `unnatural_view_decay` (Профиль набора просмотров): Late post-24h surge or linear step drip-feed without mentions (+25 pts).
 * 6. `night_bot_activity` (Ночная активность ботов): High share of view increments in 02:00-05:59 with zero reactions/forwards (+25 pts).
 *
 * Mathematical Formula:
 * `fraudScore = min(100, sum(flag_j * 25))` where `fraudScore in {0, 25, 50, 75, 100}`.
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
        unnaturalViewDecay: {
          flag: false,
          insufficientData: true,
          evaluatedPostsCount: 0,
          anomalousPostsCount: 0,
          lateViewsShare: 0,
          stepUniformityCv: 0,
          value: 0,
          reason: "Нет данных канала",
        },
        nightBotActivity: {
          flag: false,
          insufficientData: true,
          evaluatedPostsCount: 0,
          nightIntervalsCount: 0,
          nightViewsShare: 0,
          zeroEngagementRatio: 0,
          value: 0,
          reason: "Нет данных канала",
        },
      },
    };
  }

  const channelRecord: Record<string, unknown> = isRecord(channel) ? channel : {};

  const ratioResult = resolveViewsToSubsCheck(channelRecord, channel, checkViewsToSubsRatio);
  const smoothnessResult = resolveGrowthSmoothnessCheck(channelRecord, checkGrowthSmoothness);
  const spikeResult = resolveUncorrelatedSpikesCheck(channelRecord, checkUncorrelatedSpikes);
  const uniformResult = resolveUniformErrCheck(channelRecord, channel, checkUniformReactionRatio);
  const hourlyViewResult = resolveHourlyViewProfileCheck(channelRecord, channel, checkHourlyViewProfile);
  const nightActivityResult = resolveNightBotActivityCheck(channelRecord, channel, checkNightBotActivity);

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
    {
      flag: hourlyViewResult.flag,
      signalType: 'unnatural_view_decay',
      value: hourlyViewResult.value ?? hourlyViewResult.lateViewsShare,
      reason: hourlyViewResult.reason,
    },
    {
      flag: nightActivityResult.flag,
      signalType: 'night_bot_activity',
      value: nightActivityResult.value ?? nightActivityResult.nightViewsShare,
      reason: nightActivityResult.reason,
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
    fraudScore: Math.min(100, signals.length * 25),
    signals,
    details: {
      viewsToSubsRatio: ratioResult,
      growthSmoothness: smoothnessResult,
      uncorrelatedSpikes: spikeResult,
      uniformReactionRatio: uniformResult,
      unnaturalViewDecay: hourlyViewResult,
      nightBotActivity: nightActivityResult,
    },
  };
}
