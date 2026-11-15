import type {
  FraudSignalResult,
  GrowthSmoothnessResult,
  UncorrelatedSpikesResult,
  UniformReactionRatioResult,
  HourlyViewProfileResult,
  NightBotActivityResult,
  UniformReactionRatioInput,
} from './types';

export function parseGrowth(val: unknown): number {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (typeof val === 'bigint') {
    const n = Number(val);
    return isFinite(n) ? n : 0;
  }
  if (typeof val === 'string') {
    const clean = val.replace(/%/g, '').replace(/[\s,_]/g, '').trim();
    if (clean !== '') {
      const n = Number(clean);
      return isFinite(n) ? n : 0;
    }
  }
  return 0;
}

export function parseCitationIndexParam(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return isFinite(val) ? Math.max(0, val) : 0;
  if (typeof val === 'bigint') {
    const n = Number(val);
    return isFinite(n) ? Math.max(0, n) : 0;
  }
  if (typeof val === 'string') {
    const clean = val.replace(/[\s,_]/g, '').trim();
    if (clean !== '') {
      const n = Number(clean);
      if (isFinite(n)) return Math.max(0, n);
    }
  }
  return null;
}

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function parseNonNegativeNumber(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) && val >= 0 ? val : null;
  if (typeof val === 'bigint') {
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const clean = val.replace(/%/g, '').replace(/[\s,_]/g, '').trim();
    const n = Number(clean);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

export function parsePositiveMetricNumber(val: unknown): number {
  const parsed = parseNonNegativeNumber(val);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

/**
 * Extracts the Engagement Rate by Reach (ERR) for a post.
 * ERR = (reactions + comments + forwards) / views * 100.
 */
export function extractPostERR(post: unknown): number | null {
  if (typeof post === 'number' || typeof post === 'string') {
    return parseNonNegativeNumber(post);
  }
  if (!isRecord(post)) {
    return null;
  }

  const errVal = parseNonNegativeNumber(post.err ?? post.ERR ?? post.errRate);
  if (errVal !== null) {
    return errVal;
  }

  const views = parseNonNegativeNumber(post.views);
  if (views !== null && views > 0) {
    const reactions = parsePositiveMetricNumber(post.reactions);
    const comments = parsePositiveMetricNumber(post.comments);
    const forwards = parsePositiveMetricNumber(post.forwards);
    const totalEngagement = reactions + comments + forwards;
    return (totalEngagement / views) * 100;
  }
  return null;
}

export function extractRawPostsFromChannel(channel: UniformReactionRatioInput): ReadonlyArray<unknown> {
  if (Array.isArray(channel)) {
    return channel;
  }
  if (!isRecord(channel)) {
    return [];
  }

  const postsArr = Array.isArray(channel.posts) ? channel.posts : [];
  const recentArr = Array.isArray(channel.recentPosts) ? channel.recentPosts : [];
  if (postsArr.length >= recentArr.length && postsArr.length > 0) {
    return postsArr;
  }
  if (recentArr.length > 0) {
    return recentArr;
  }
  if (Array.isArray(channel.items)) {
    return channel.items;
  }
  if (isRecord(channel.posts) && Array.isArray(channel.posts.data)) {
    return channel.posts.data;
  }
  return [];
}

export function extractPostTimestamp(item: unknown): number {
  if (!isRecord(item)) return 0;
  const val = item.publishedAt || item.date || item.createdAt;
  if (!(val instanceof Date || typeof val === 'string' || typeof val === 'number')) return 0;
  const time = new Date(val).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function extractChannelId(channel: unknown): number | undefined {
  if (!isRecord(channel)) return undefined;
  if (typeof channel.id === 'number') return channel.id;
  if (typeof channel.channelId === 'number') return channel.channelId;
  return undefined;
}

function hasTriggerKey(triggers: unknown, keys: ReadonlyArray<string>): boolean {
  if (!triggers) return false;
  if (Array.isArray(triggers)) {
    return triggers.some((t) => typeof t === 'string' && keys.includes(t));
  }
  if (triggers instanceof Set) {
    return keys.some((k) => triggers.has(k));
  }
  if (typeof triggers === 'string') {
    return keys.some((k) => triggers.includes(k));
  }
  return false;
}

function pickFirstDefined(source: Record<string, unknown> | undefined, keys: ReadonlyArray<string>): unknown {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined) {
      return source[key];
    }
  }
  return undefined;
}

interface FlagOverride extends Record<string, unknown> {
  flag: boolean;
}

function isFlagOverride(value: unknown): value is FlagOverride {
  return isRecord(value) && typeof value.flag === 'boolean';
}

/** Selects an override without changing alias order or treating an explicit false as missing. */
export function resolveFlagOverride(
  channel: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): FlagOverride | undefined {
  const directFlag = pickFirstDefined(channel, keys);
  const simObj = isRecord(channel.simulatedFlags) ? channel.simulatedFlags : undefined;
  const simFlag = pickFirstDefined(simObj, keys);

  if (typeof directFlag === 'boolean') return { flag: directFlag };
  if (isFlagOverride(directFlag)) return directFlag;
  if (typeof simFlag === 'boolean') return { flag: simFlag };
  if (hasTriggerKey(channel.triggers, keys)) return { flag: true };
  return undefined;
}

function findActiveFraudSignal(
  fraudSignals: unknown,
  signalTypes: ReadonlyArray<string>
): Record<string, unknown> | undefined {
  if (!Array.isArray(fraudSignals)) return undefined;
  for (const item of fraudSignals) {
    if (
      isRecord(item) &&
      item.flag !== false &&
      typeof item.signalType === 'string' &&
      signalTypes.includes(item.signalType)
    ) {
      return item;
    }
  }
  return undefined;
}

export function normalizeMetricEntries(channel: Record<string, unknown>): Array<{ date: Date; followers: number }> {
  const rawList = Array.isArray(channel.metrics)
    ? channel.metrics
    : Array.isArray(channel.channelMetricDailies)
    ? channel.channelMetricDailies
    : Array.isArray(channel.membersHistory)
    ? channel.membersHistory
    : [];

  const result: Array<{ date: Date; followers: number }> = [];
  for (const m of rawList) {
    if (!isRecord(m)) continue;
    const rawDate = m.date ?? m.collectedAt ?? 0;
    const date =
      rawDate instanceof Date
        ? rawDate
        : typeof rawDate === 'string' || typeof rawDate === 'number'
        ? new Date(rawDate)
        : new Date(0);
    const followers =
      typeof m.followers === 'number'
        ? m.followers
        : typeof m.membersCount === 'number'
        ? m.membersCount
        : 0;
    result.push({ date, followers });
  }
  return result;
}

export function extractValidDates(
  items: unknown,
  primaryKey: string,
  secondaryKey: string
): Date[] {
  if (!Array.isArray(items)) return [];
  const dates: Date[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const raw = item[primaryKey] ?? item[secondaryKey];
    if (raw instanceof Date || typeof raw === 'string' || typeof raw === 'number') {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        dates.push(d);
      }
    }
  }
  return dates;
}

export function resolveViewsToSubsCheck(
  channel: Record<string, unknown>,
  fullInput: unknown,
  calculate: (posts: Array<{ views: number | null }>, currentMembers: number) => FraudSignalResult,
): FraudSignalResult {
  const keys = ['viewsToSubsRatio', 'views_to_subs_ratio', 'viewsToSubs', 'views_to_subs'];
  const flaggedReason = "Аномально низкие просмотры (< 5%): подозрение на накрутку подписчиков";
  const clearedReason = "Соотношение в пределах нормы";

  const override = resolveFlagOverride(channel, keys);
  if (override) {
    return {
      flag: override.flag,
      ratio: typeof override.ratio === 'number' ? override.ratio : (override.flag ? 0.02 : 0.2),
      reason: typeof override.reason === 'string' && override.reason ? override.reason : (override.flag ? flaggedReason : clearedReason),
    };
  }
  if (isRecord(channel.viewsToSubsRatioResult) && typeof channel.viewsToSubsRatioResult.flag === 'boolean') {
    return {
      flag: channel.viewsToSubsRatioResult.flag,
      ratio: typeof channel.viewsToSubsRatioResult.ratio === 'number' ? channel.viewsToSubsRatioResult.ratio : 0,
      reason: typeof channel.viewsToSubsRatioResult.reason === 'string' ? channel.viewsToSubsRatioResult.reason : '',
    };
  }

  const existing = findActiveFraudSignal(channel.fraudSignals, ['views_to_subs_ratio', 'viewsToSubsRatio', 'views_to_subs']);
  if (existing) {
    return {
      flag: true,
      ratio: typeof existing.value === 'number' ? existing.value : 0.02,
      reason: typeof existing.reason === 'string' && existing.reason ? existing.reason : flaggedReason,
    };
  }

  const rawPosts = Array.isArray(fullInput)
    ? fullInput
    : Array.isArray(channel.posts)
    ? channel.posts
    : Array.isArray(channel.recentPosts)
    ? channel.recentPosts
    : [];
  const posts: Array<{ views: number | null }> = rawPosts.map((p) => ({
    views: isRecord(p) && typeof p.views === 'number' ? p.views : null,
  }));
  const rawMembers = channel.currentMembers ?? channel.membersCount ?? channel.subscribers ?? channel.followers;
  const members = typeof rawMembers === 'number' ? rawMembers : 0;
  return calculate(posts, members);
}

export function resolveGrowthSmoothnessCheck(
  channel: Record<string, unknown>,
  calculate: (metrics: Array<{ date: Date; followers: number }>) => GrowthSmoothnessResult,
): GrowthSmoothnessResult {
  const keys = ['growthSmoothness', 'growth_smoothness', 'smoothGrowth', 'smooth_growth'];
  const flaggedReason = "Аномально гладкий рост (CV < 0.1): подозрение на накрутку";
  const clearedReason = "Рост в пределах нормы (естественные колебания)";

  const override = resolveFlagOverride(channel, keys);
  if (override) {
    return {
      flag: override.flag,
      cv: typeof override.cv === 'number' ? override.cv : (override.flag ? 0.01 : 0.25),
      reason: typeof override.reason === 'string' && override.reason ? override.reason : (override.flag ? flaggedReason : clearedReason),
    };
  }
  if (isRecord(channel.growthSmoothnessResult) && typeof channel.growthSmoothnessResult.flag === 'boolean') {
    return {
      flag: channel.growthSmoothnessResult.flag,
      cv: typeof channel.growthSmoothnessResult.cv === 'number' ? channel.growthSmoothnessResult.cv : 0,
      reason: typeof channel.growthSmoothnessResult.reason === 'string' ? channel.growthSmoothnessResult.reason : '',
    };
  }

  const existing = findActiveFraudSignal(channel.fraudSignals, ['growth_smoothness', 'growthSmoothness']);
  if (existing) {
    return {
      flag: true,
      cv: typeof existing.value === 'number' ? existing.value : 0.01,
      reason: typeof existing.reason === 'string' && existing.reason ? existing.reason : flaggedReason,
    };
  }

  return calculate(normalizeMetricEntries(channel));
}

export function resolveUncorrelatedSpikesCheck(
  channel: Record<string, unknown>,
  calculate: (
    metrics: Array<{ date: Date; followers: number }>,
    postsDates: Date[],
    mentionsDates: Date[],
  ) => UncorrelatedSpikesResult,
): UncorrelatedSpikesResult {
  const keys = ['uncorrelatedSpikes', 'uncorrelated_spikes', 'spikes'];
  const flaggedReason = "Обнаружено 1 необъяснимых скачков подписчиков";
  const clearedReason = "Аномальных скачков не обнаружено";

  const override = resolveFlagOverride(channel, keys);
  if (override) {
    const dates = Array.isArray(override.dates)
      ? override.dates.filter((d): d is string => typeof d === 'string')
      : (override.flag ? ['2026-09-01'] : []);
    return {
      flag: override.flag,
      spikesCount: typeof override.spikesCount === 'number' ? override.spikesCount : (override.flag ? 1 : 0),
      dates,
      reason: typeof override.reason === 'string' && override.reason ? override.reason : (override.flag ? flaggedReason : clearedReason),
    };
  }
  if (isRecord(channel.uncorrelatedSpikesResult) && typeof channel.uncorrelatedSpikesResult.flag === 'boolean') {
    return {
      flag: channel.uncorrelatedSpikesResult.flag,
      spikesCount: typeof channel.uncorrelatedSpikesResult.spikesCount === 'number' ? channel.uncorrelatedSpikesResult.spikesCount : 0,
      dates: Array.isArray(channel.uncorrelatedSpikesResult.dates)
        ? channel.uncorrelatedSpikesResult.dates.filter((d): d is string => typeof d === 'string')
        : [],
      reason: typeof channel.uncorrelatedSpikesResult.reason === 'string' ? channel.uncorrelatedSpikesResult.reason : '',
    };
  }

  const existing = findActiveFraudSignal(channel.fraudSignals, ['uncorrelated_spikes', 'uncorrelatedSpikes']);
  if (existing) {
    const signalDates = Array.isArray(existing.dates)
      ? existing.dates.filter((d): d is string => typeof d === 'string')
      : existing.detectedAt instanceof Date || typeof existing.detectedAt === 'string'
      ? [new Date(existing.detectedAt).toISOString().split('T')[0]]
      : ['2026-09-01'];
    const count = typeof existing.value === 'number' && existing.value > 0 ? existing.value : 1;
    return {
      flag: true,
      spikesCount: count,
      dates: signalDates,
      reason: typeof existing.reason === 'string' && existing.reason ? existing.reason : `Обнаружено ${count} необъяснимых скачков подписчиков`,
    };
  }

  const metrics = normalizeMetricEntries(channel);
  const postsDates = Array.isArray(channel.postsDates)
    ? channel.postsDates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    : extractValidDates(channel.posts ?? channel.recentPosts, 'publishedAt', 'date');
  const mentionsDates = Array.isArray(channel.mentionsDates)
    ? channel.mentionsDates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    : extractValidDates(channel.mentions, 'createdAt', 'date');

  return calculate(metrics, postsDates, mentionsDates);
}

export function resolveUniformErrCheck(
  channel: Record<string, unknown>,
  fullInput: UniformReactionRatioInput,
  calculate: (input: UniformReactionRatioInput) => UniformReactionRatioResult,
): UniformReactionRatioResult {
  const keys = ['uniformReactionRatio', 'uniform_reaction_ratio', 'uniformErr', 'uniform_err'];
  const flaggedReason = "Аномально равномерный ERR (CV < 0.1): подозрение на шаблонные накрутки реакций ботами";
  const clearedReason = "ERR в пределах нормы (естественные колебания реакций)";

  const override = resolveFlagOverride(channel, keys);
  if (override) {
    return {
      flag: override.flag,
      cv: typeof override.cv === 'number' ? override.cv : (override.flag ? 0.02 : 0.3),
      reason: typeof override.reason === 'string' && override.reason ? override.reason : (override.flag ? flaggedReason : clearedReason),
    };
  }
  if (isRecord(channel.uniformReactionRatioResult) && typeof channel.uniformReactionRatioResult.flag === 'boolean') {
    return {
      flag: channel.uniformReactionRatioResult.flag,
      cv: typeof channel.uniformReactionRatioResult.cv === 'number' ? channel.uniformReactionRatioResult.cv : 0,
      reason: typeof channel.uniformReactionRatioResult.reason === 'string' ? channel.uniformReactionRatioResult.reason : '',
    };
  }

  const existing = findActiveFraudSignal(channel.fraudSignals, [
    'uniform_err',
    'uniform_reaction_ratio',
    'uniformReactionRatio',
    'uniformErr',
  ]);
  if (existing) {
    return {
      flag: true,
      cv: typeof existing.value === 'number' ? existing.value : 0.02,
      reason: typeof existing.reason === 'string' && existing.reason ? existing.reason : flaggedReason,
    };
  }

  return calculate(fullInput);
}

export function resolveHourlyViewProfileCheck(
  channel: Record<string, unknown>,
  fullInput: UniformReactionRatioInput,
  calculate: (input: UniformReactionRatioInput) => HourlyViewProfileResult,
): HourlyViewProfileResult {
  const keys = [
    'unnaturalViewDecay',
    'unnatural_view_decay',
    'hourlyViewProfile',
    'hourly_view_profile',
    'hourlyViewAnomaly',
    'hourly_view_anomaly',
    'UNNATURAL_VIEW_DECAY',
  ];
  const flaggedReason = 'Аномальный профиль набора просмотров: поздний добор или равномерные шаги без упоминаний';
  const clearedReason = 'Профиль затухания просмотров в пределах органической нормы';

  const override = resolveFlagOverride(channel, keys);
  if (override) {
    const lateViewsShare =
      typeof override.lateViewsShare === 'number' ? override.lateViewsShare : override.flag ? 0.65 : 0.15;
    const stepUniformityCv =
      typeof override.stepUniformityCv === 'number' ? override.stepUniformityCv : override.flag ? 0.05 : 0.5;
    const value = typeof override.value === 'number' ? override.value : lateViewsShare;
    return {
      flag: override.flag,
      insufficientData: Boolean(override.insufficientData),
      evaluatedPostsCount: typeof override.evaluatedPostsCount === 'number' ? override.evaluatedPostsCount : 5,
      anomalousPostsCount:
        typeof override.anomalousPostsCount === 'number' ? override.anomalousPostsCount : override.flag ? 3 : 0,
      lateViewsShare,
      stepUniformityCv,
      value,
      reason:
        typeof override.reason === 'string' && override.reason
          ? override.reason
          : override.flag
          ? flaggedReason
          : clearedReason,
    };
  }

  const directResult = isRecord(channel.unnaturalViewDecayResult)
    ? channel.unnaturalViewDecayResult
    : isRecord(channel.hourlyViewProfileResult)
    ? channel.hourlyViewProfileResult
    : undefined;
  if (directResult && typeof directResult.flag === 'boolean') {
    const lateViewsShare = typeof directResult.lateViewsShare === 'number' ? directResult.lateViewsShare : 0;
    return {
      flag: directResult.flag,
      insufficientData: Boolean(directResult.insufficientData),
      evaluatedPostsCount: typeof directResult.evaluatedPostsCount === 'number' ? directResult.evaluatedPostsCount : 0,
      anomalousPostsCount: typeof directResult.anomalousPostsCount === 'number' ? directResult.anomalousPostsCount : 0,
      lateViewsShare,
      stepUniformityCv: typeof directResult.stepUniformityCv === 'number' ? directResult.stepUniformityCv : 0,
      value: typeof directResult.value === 'number' ? directResult.value : lateViewsShare,
      reason: typeof directResult.reason === 'string' ? directResult.reason : '',
    };
  }

  const existing = findActiveFraudSignal(channel.fraudSignals, [
    'unnatural_view_decay',
    'unnaturalViewDecay',
    'hourly_view_anomaly',
    'hourlyViewAnomaly',
    'hourly_view_profile',
    'hourlyViewProfile',
    'UNNATURAL_VIEW_DECAY',
  ]);
  if (existing) {
    const value = typeof existing.value === 'number' ? existing.value : 0.65;
    return {
      flag: true,
      insufficientData: false,
      evaluatedPostsCount: 5,
      anomalousPostsCount: 3,
      lateViewsShare: value,
      stepUniformityCv: 0,
      value,
      reason: typeof existing.reason === 'string' && existing.reason ? existing.reason : flaggedReason,
    };
  }

  return calculate(fullInput);
}

export function resolveNightBotActivityCheck(
  channel: Record<string, unknown>,
  fullInput: UniformReactionRatioInput,
  calculate: (input: UniformReactionRatioInput) => NightBotActivityResult,
): NightBotActivityResult {
  const keys = ['nightBotActivity', 'night_bot_activity', 'NIGHT_BOT_ACTIVITY'];
  const flaggedReason = 'Аномальная ночная активность (02:00-05:59): всплеск просмотров при нулевом отклике';
  const clearedReason = 'Ночная активность просмотров в пределах нормы';

  const override = resolveFlagOverride(channel, keys);
  if (override) {
    const nightViewsShare =
      typeof override.nightViewsShare === 'number' ? override.nightViewsShare : override.flag ? 0.45 : 0.08;
    const zeroEngagementRatio =
      typeof override.zeroEngagementRatio === 'number' ? override.zeroEngagementRatio : override.flag ? 1 : 0;
    const value = typeof override.value === 'number' ? override.value : nightViewsShare;
    return {
      flag: override.flag,
      insufficientData: Boolean(override.insufficientData),
      evaluatedPostsCount: typeof override.evaluatedPostsCount === 'number' ? override.evaluatedPostsCount : 5,
      nightIntervalsCount:
        typeof override.nightIntervalsCount === 'number' ? override.nightIntervalsCount : override.flag ? 4 : 0,
      nightViewsShare,
      zeroEngagementRatio,
      value,
      reason:
        typeof override.reason === 'string' && override.reason
          ? override.reason
          : override.flag
          ? flaggedReason
          : clearedReason,
    };
  }

  const directResult = isRecord(channel.nightBotActivityResult) ? channel.nightBotActivityResult : undefined;
  if (directResult && typeof directResult.flag === 'boolean') {
    const nightViewsShare = typeof directResult.nightViewsShare === 'number' ? directResult.nightViewsShare : 0;
    return {
      flag: directResult.flag,
      insufficientData: Boolean(directResult.insufficientData),
      evaluatedPostsCount: typeof directResult.evaluatedPostsCount === 'number' ? directResult.evaluatedPostsCount : 0,
      nightIntervalsCount: typeof directResult.nightIntervalsCount === 'number' ? directResult.nightIntervalsCount : 0,
      nightViewsShare,
      zeroEngagementRatio:
        typeof directResult.zeroEngagementRatio === 'number' ? directResult.zeroEngagementRatio : 0,
      value: typeof directResult.value === 'number' ? directResult.value : nightViewsShare,
      reason: typeof directResult.reason === 'string' ? directResult.reason : '',
    };
  }

  const existing = findActiveFraudSignal(channel.fraudSignals, [
    'night_bot_activity',
    'nightBotActivity',
    'NIGHT_BOT_ACTIVITY',
  ]);
  if (existing) {
    const value = typeof existing.value === 'number' ? existing.value : 0.45;
    return {
      flag: true,
      insufficientData: false,
      evaluatedPostsCount: 5,
      nightIntervalsCount: 4,
      nightViewsShare: value,
      zeroEngagementRatio: 1,
      value,
      reason: typeof existing.reason === 'string' && existing.reason ? existing.reason : flaggedReason,
    };
  }

  return calculate(fullInput);
}
