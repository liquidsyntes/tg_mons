import { calculateCitationIndex, type CitationInput } from '../citationIndex';
import type {
  FraudSignalResult,
  GrowthSmoothnessResult,
  UncorrelatedSpikesResult,
  LowCitationGrowthResult,
  LowCitationChannelInput,
  UniformReactionRatioResult,
  UniformReactionRatioInput,
} from './types';
import {
  parseGrowth,
  parseCitationIndexParam,
  isRecord,
  extractRawPostsFromChannel,
  extractPostTimestamp,
  extractPostERR,
  extractChannelId,
} from './normalizers';

/**
 * Первая проверка на накрутку: аномальное соотношение просмотров к подписчикам (`checkViewsToSubsRatio`).
 *
 * Compares average post views over recent publications against the channel's total subscriber count.
 * Natural Telegram channels typically maintain a views-to-subscribers ratio between 5% and 150%.
 *
 * Mathematical Formula:
 * - Average views: `avgViews = sum(views_i) / N` for valid posts where `views_i > 0`.
 * - Ratio: `ratio = avgViews / currentMembers`.
 *
 * Threshold Rules:
 * - If `currentMembers <= 0`: Cleared (`flag: false`, insufficient members).
 * - If valid posts `< 5`: Cleared (`flag: false`, insufficient posts for statistical significance).
 * - If `ratio < 0.05` (5%): Flagged (`flag: true`, suspicious inflated subscriber count / inactive audience).
 * - If `ratio > 1.50` (150%): Flagged (`flag: true`, suspicious artificial view inflation / view bots).
 * - Otherwise: Cleared (`flag: false`, ratio within normal parameters).
 *
 * @param posts - Array of recent post objects containing view counts (`views`). Evaluates up to 20-30 posts.
 * @param currentMembers - Current total member/subscriber count of the channel.
 * @returns {FraudSignalResult} Результат проверки (flag: true означает подозрение на накрутку)
 */
export function checkViewsToSubsRatio(
  posts: Array<{ views: number | null }>,
  currentMembers: number
): FraudSignalResult {
  // Edge case: канал с 0 подписчиков (или отрицательным числом, что маловероятно)
  if (currentMembers <= 0) {
    return { flag: false, ratio: 0, reason: "Недостаточно подписчиков для анализа" };
  }

  // Edge case: нет публикаций или у публикаций нет данных о просмотрах
  const validPosts = posts.filter(p => p.views !== null && p.views > 0);
  if (validPosts.length === 0) {
    return { flag: false, ratio: 0, reason: "Нет постов с просмотрами для анализа" };
  }

  // Считаем среднее количество просмотров по валидным постам
  const totalViews = validPosts.reduce((sum, p) => sum + (p.views || 0), 0);
  const avgViews = totalViews / validPosts.length;

  const ratio = avgViews / currentMembers;

  // Если мало постов, то статистика может быть недостоверной
  if (validPosts.length < 5) {
    return { flag: false, ratio, reason: "Недостаточно постов для достоверного анализа" };
  }

  // Порог для накрученных подписчиков: < 5% (0.05)
  if (ratio < 0.05) {
     return { flag: true, ratio, reason: "Аномально низкие просмотры (< 5%): подозрение на накрутку подписчиков" };
  }

  // Порог для накрученных просмотров: > 150% (1.5)
  if (ratio > 1.5) {
     return { flag: true, ratio, reason: "Аномально высокие просмотры (> 150%): подозрение на накрутку просмотров" };
  }

  return { flag: false, ratio, reason: "Соотношение в пределах нормы" };
}

/**
 * Вторая проверка на накрутку: выявление неестественно гладкого графика роста подписчиков (`checkGrowthSmoothness`).
 *
 * Analyzes daily follower snapshots to detect linear, automated bot-addition scripts.
 * Natural organic growth exhibits high variance (peaks on active days, troughs on quiet days),
 * whereas bot farms often inject a rigid daily quota of subscribers, resulting in an unnaturally low
 * Coefficient of Variation (CV).
 *
 * Mathematical Formula:
 * - Daily deltas: `delta_i = followers_i - followers_{i-1}` for chronological pairs `i = 1 .. N-1`.
 * - Mean delta: `avgDelta = (1 / (N - 1)) * sum(delta_i)`.
 * - Population Variance: `variance = (1 / (N - 1)) * sum((delta_i - avgDelta)^2)`.
 * - Population Standard Deviation: `stdDev = sqrt(variance)`.
 * - Coefficient of Variation: `CV = stdDev / avgDelta`.
 *
 * Threshold Rules:
 * - Requires at least 14 daily metrics (`metrics.length >= 14`). If fewer, returns `flag: false`.
 * - If `avgDelta <= 0`: Cleared (`flag: false`, no positive monotonic growth).
 * - If `CV < 0.1` (relative variation < 10%): Flagged (`flag: true`, suspiciously uniform linear growth).
 * - Otherwise: Cleared (`flag: false`, normal organic growth fluctuations).
 *
 * @param metrics - Array of daily channel metrics containing snapshot dates and follower counts.
 * @returns {GrowthSmoothnessResult} Результат проверки с флагом, значением CV и диагностическим сообщением.
 */
export function checkGrowthSmoothness(
  metrics: Array<{ date: Date; followers: number }>
): GrowthSmoothnessResult {
  if (metrics.length < 14) {
    return { flag: false, cv: 0, reason: "Недостаточно данных для анализа (менее 14 дней)" };
  }

  // Обязательно отсортировать метрики по дате по возрастанию
  const sortedMetrics = [...metrics].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Вычислить дневные дельты (приросты)
  const deltas: number[] = [];
  for (let i = 1; i < sortedMetrics.length; i++) {
    deltas.push(sortedMetrics[i].followers - sortedMetrics[i - 1].followers);
  }

  // Вычислить средний прирост
  const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;

  if (avgDelta <= 0) {
    return { flag: false, cv: 0, reason: "Нет монотонного роста (средний прирост <= 0)" };
  }

  // Вычислить стандартное отклонение
  const sumOfSquaredDifferences = deltas.reduce((sum, d) => sum + Math.pow(d - avgDelta, 2), 0);
  const stdDev = Math.sqrt(sumOfSquaredDifferences / deltas.length);

  // Коэффициент вариации (CV = StdDev / AvgDelta)
  const cv = stdDev / avgDelta;

  // Если CV < 0.1 (отклонение менее 10%), вернуть flag: true (аномально гладкий рост)
  if (cv < 0.1) {
    return { flag: true, cv, reason: "Аномально гладкий рост (CV < 0.1): подозрение на накрутку" };
  }

  return { flag: false, cv, reason: "Рост в пределах нормы (естественные колебания)" };
}

/**
 * Третья проверка: выявление резких скачков подписчиков в дни без публикаций и упоминаний (`checkUncorrelatedSpikes`).
 *
 * Detects sudden influxes of subscribers that occur on days without channel publications
 * and without incoming external citations/mentions. Organic spikes in Telegram are almost
 * always driven by viral content (new posts) or external promotion (mentions in other channels).
 *
 * Mathematical Formula & Thresholds:
 * 1. Daily deltas: `delta_i = followers_i - followers_{i-1}` for positive increments (`delta_i > 0`).
 * 2. Dynamic Spike Threshold:
 *    `threshold = max(3 * avgDelta, 50, 0.005 * maxFollowers)`
 *    - `3 * avgDelta`: Spike must exceed 3x the average daily delta across the historical period.
 *    - `50`: Absolute noise floor preventing false flags on small channels from natural minor variations.
 *    - `0.005 * maxFollowers` (0.5%): Scales threshold for large channels to ignore routine daily flux.
 * 3. Event Correlation Window:
 *    Inspects a 2-day temporal window encompassing the day of the spike and the preceding day (`[t - 1, t]`).
 *    `hasEvent = hasPost(t, t-1) || hasMention(t, t-1)`.
 * 4. Anomaly Identification:
 *    A candidate spike is marked anomalous if neither a publication nor a mention occurred in the 2-day window.
 *
 * Threshold Rules:
 * - Requires at least 2 days of metrics. If fewer, returns `flag: false`.
 * - If any anomalous spikes exist (`anomalousSpikes.length >= 1`): Flagged (`flag: true`).
 * - Otherwise: Cleared (`flag: false`).
 *
 * @param metrics - Chronological or un-ordered array of daily channel metrics with date and follower count.
 * @param postsDates - Array of publication dates (`Date[]`) for posts on the channel.
 * @param mentionsDates - Array of dates (`Date[]`) when the channel was mentioned/reposted by other channels.
 * @returns {UncorrelatedSpikesResult} Результат проверки с флагом, числом скачков, датами и диагностикой.
 */
export function checkUncorrelatedSpikes(
  metrics: Array<{ date: Date; followers: number }>,
  postsDates: Date[],
  mentionsDates: Date[]
): UncorrelatedSpikesResult {
  if (metrics.length < 2) {
    return { flag: false, spikesCount: 0, dates: [], reason: "Недостаточно данных для анализа" };
  }

  const sortedMetrics = [...metrics].sort((a, b) => a.date.getTime() - b.date.getTime());

  const deltas: { date: Date; delta: number; followers: number }[] = [];
  for (let i = 1; i < sortedMetrics.length; i++) {
    deltas.push({
      date: sortedMetrics[i].date,
      delta: sortedMetrics[i].followers - sortedMetrics[i - 1].followers,
      followers: sortedMetrics[i].followers,
    });
  }

  const positiveDeltas = deltas.filter(d => d.delta > 0);
  if (positiveDeltas.length === 0) {
    return { flag: false, spikesCount: 0, dates: [], reason: "Нет положительных приростов" };
  }

  const avgDelta = deltas.reduce((sum, d) => sum + d.delta, 0) / deltas.length;
  const maxFollowers = Math.max(...sortedMetrics.map(m => m.followers));

  // Динамический порог для определения скачка
  const threshold = Math.max(avgDelta * 3, 50, maxFollowers * 0.005);

  const spikes = positiveDeltas.filter(d => d.delta > threshold);

  if (spikes.length === 0) {
    return { flag: false, spikesCount: 0, dates: [], reason: "Аномальных скачков не обнаружено" };
  }

  // Вспомогательная функция для проверки наличия события в окне [день скачка, предыдущий день]
  const getStartOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const hasEventInWindow = (targetDate: Date, eventDates: Date[]) => {
    const targetTime = getStartOfDay(targetDate);

    const prevDate = new Date(targetTime);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevTime = prevDate.getTime();

    return eventDates.some(ed => {
      const et = getStartOfDay(ed);
      return et === targetTime || et === prevTime;
    });
  };

  const anomalousSpikes = spikes.filter(spike => {
    const hasPost = hasEventInWindow(spike.date, postsDates);
    const hasMention = hasEventInWindow(spike.date, mentionsDates);
    return !hasPost && !hasMention;
  });

  if (anomalousSpikes.length === 0) {
    return { flag: false, spikesCount: 0, dates: [], reason: "Все скачки обоснованы публикациями или упоминаниями" };
  }

  const datesStr = anomalousSpikes.map(s => s.date.toISOString().split('T')[0]);

  return {
    flag: true,
    spikesCount: anomalousSpikes.length,
    dates: datesStr,
    reason: `Обнаружено ${anomalousSpikes.length} необъяснимых скачков подписчиков: ${datesStr.join(', ')}`
  };
}

/**
 * Четвертая проверка: выявление быстрого роста подписчиков при околонулевом индексе цитирования (`checkLowCitationGrowth`).
 *
 * Correlates 30-day subscriber growth percentage with external citation authority.
 * Organic channel growth in Telegram is driven by external discoverability: mentions, reposts,
 * and PR campaigns. A channel expanding rapidly without external citations is a classic indicator
 * of artificial subscriber injections (bot farming or paid incentivized traffic).
 *
 * Mathematical Formula:
 * - 30-day Growth: `G_30d = ((followers_now - followers_30d) / followers_30d) * 100%`.
 * - Citation Index: `CI = sum(mentions_i * log10(citing_subscribers_i))` over the last 30 days.
 *
 * Threshold Rules:
 * - Default thresholds: `minGrowth = 5%`, `maxCitationIndex = 1.0`.
 * - If `G_30d > minGrowth` AND `CI <= maxCitationIndex`: Flagged (`flag: true`, suspicious growth with near-zero citations).
 * - If `G_30d <= minGrowth`: Cleared (`flag: false`, growth rate does not exceed suspicion threshold).
 * - If `CI > maxCitationIndex`: Cleared (`flag: false`, citation index justifies subscriber growth rate).
 *
 * Flexible Input Support:
 * - Accepts a growth number/string/bigint or channel object with various property naming conventions (`growthRate`, `growth30d`, `delta30d.percent`).
 * - Accepts citation index value, array of `CitationMention`, or derives CI from the channel object.
 *
 * @param growthOrChannel Рост за 30 дней (%) или объект канала (поддерживает delta30d, growthRate, mentions и др.)
 * @param citationIndexOrMentions Индекс цитирования (число) или список упоминаний (CitationMention[])
 * @param options Настройки порогов (по умолчанию minGrowth = 5, maxCitationIndex = 1)
 * @returns {LowCitationGrowthResult} Результат проверки с флагом, темпом роста, индексом цитирования и описанием.
 */
export function checkLowCitationGrowth(
  growthOrChannel: number | string | bigint | LowCitationChannelInput | Record<string, unknown> | null | undefined,
  citationIndexOrMentions?: CitationInput,
  options?: { minGrowth?: number; maxCitationIndex?: number }
): LowCitationGrowthResult {
  const minGrowth = options?.minGrowth ?? 5;
  const maxCitationIndex = options?.maxCitationIndex ?? 1;

  let growthRate = 0;
  let citationIndex = 0;

  if (typeof growthOrChannel === 'number' || typeof growthOrChannel === 'bigint' || typeof growthOrChannel === 'string') {
    growthRate = parseGrowth(growthOrChannel);
    const parsedCi = parseCitationIndexParam(citationIndexOrMentions);
    if (parsedCi !== null) {
      citationIndex = parsedCi;
    } else if (citationIndexOrMentions !== undefined && citationIndexOrMentions !== null) {
      citationIndex = calculateCitationIndex(citationIndexOrMentions);
    }
  } else if (isRecord(growthOrChannel)) {
    const delta30d = isRecord(growthOrChannel.delta30d) ? growthOrChannel.delta30d.percent : undefined;
    const rawGrowth: unknown =
      delta30d ??
      growthOrChannel.growthRate30d ??
      growthOrChannel.growth30d ??
      growthOrChannel.growthPercent ??
      growthOrChannel.growthRate;

    growthRate = parseGrowth(rawGrowth);

    const parsedCiParam = parseCitationIndexParam(citationIndexOrMentions);
    if (parsedCiParam !== null) {
      citationIndex = parsedCiParam;
    } else if (citationIndexOrMentions !== undefined && citationIndexOrMentions !== null) {
      citationIndex = calculateCitationIndex(citationIndexOrMentions);
    } else {
      const parsedChannelCi = parseCitationIndexParam(growthOrChannel.citationIndex);
      if (parsedChannelCi !== null) {
        citationIndex = parsedChannelCi;
      } else {
        citationIndex = calculateCitationIndex(growthOrChannel);
      }
    }
  }

  growthRate = Number.isFinite(growthRate) ? growthRate : 0;
  citationIndex = Number.isFinite(citationIndex) ? Math.max(0, citationIndex) : 0;

  // Флаг накрутки: рост > minGrowth (5%) и индекс цитирования <= maxCitationIndex (1)
  const isHighGrowth = growthRate > minGrowth;
  const isNearZeroCitation = citationIndex <= maxCitationIndex;

  if (isHighGrowth && isNearZeroCitation) {
    return {
      flag: true,
      citationIndex,
      growthRate,
      growthPercent: growthRate,
      value: citationIndex,
      reason: `Подозрение на накрутку: рост подписчиков за 30 дней (> ${minGrowth}%: ${growthRate}%) при околонулевом индексе цитирования (${citationIndex})`
    };
  }

  if (!isHighGrowth) {
    return {
      flag: false,
      citationIndex,
      growthRate,
      growthPercent: growthRate,
      value: citationIndex,
      reason: `Рост подписчиков за 30 дней (${growthRate}%) не превышает порог ${minGrowth}%`
    };
  }

  return {
    flag: false,
    citationIndex,
    growthRate,
    growthPercent: growthRate,
    value: citationIndex,
    reason: `Индекс цитирования (${citationIndex}) достаточен для темпов роста (${growthRate}%)`
  };
}

/**
 * Четвертая проверка на накрутку: равномерность реакций (ERR) по недавним публикациям (`checkUniformReactionRatio`).
 *
 * Identifies suspiciously uniform Engagement Rate by Reach (ERR) across recent publications.
 * Organic posts naturally vary in engagement depending on content quality, timing, topic, and formatting.
 * Bot services that automatically deliver fixed reaction and comment quotas to every new post generate
 * an unnaturally consistent ERR profile across posts.
 *
 * Mathematical Formula:
 * 1. Post ERR:
 *    `ERR_k = ((reactions_k + comments_k + forwards_k) / views_k) * 100%`
 * 2. Sampling Window:
 *    Extracts the last 15-20 publications sorted descending by date.
 *    Requires at least 10 valid posts (`postsCount >= 10`). If fewer, returns `flag: false` (insufficient data).
 * 3. Statistical Dispersion:
 *    - Mean ERR: `avgErr = (1 / N) * sum(ERR_k)`.
 *    - Population Variance: `variance = (1 / N) * sum((ERR_k - avgErr)^2)`.
 *    - Population Standard Deviation: `stdDev = sqrt(variance)`.
 *    - Coefficient of Variation: `CV = stdDev / avgErr`.
 *
 * Threshold Rules:
 * - If `postsCount < 10`: Cleared (`flag: false`, insufficient data for reliable analysis).
 * - If `avgErr <= 0`: Cleared (`flag: false`, zero or negative engagement).
 * - If `CV < 0.1` (relative standard deviation < 10%): Flagged (`flag: true`, suspiciously uniform reaction pattern).
 * - Otherwise: Cleared (`flag: false`, normal organic engagement fluctuations).
 *
 * @param channel Объект канала с постами или массив постов
 * @returns {UniformReactionRatioResult} Результат проверки с флагом, CV, средним ERR, числом постов и сигналом
 */
export function checkUniformReactionRatio(channel: UniformReactionRatioInput): UniformReactionRatioResult {
  const rawPosts = extractRawPostsFromChannel(channel);

  // Фильтруем null/undefined элементы
  const nonNullPosts = rawPosts.filter((p) => p !== null && p !== undefined);

  // Сортировка по дате публикации (если даты доступны)
  const hasDates = nonNullPosts.some(
    (p) => isRecord(p) && Boolean(p.publishedAt || p.date || p.createdAt)
  );
  const sortedPosts = hasDates
    ? [...nonNullPosts].sort((a, b) => extractPostTimestamp(b) - extractPostTimestamp(a))
    : nonNullPosts;

  // Извлекаем валидные значения ERR
  const validErrs: number[] = [];
  for (const p of sortedPosts) {
    const err = extractPostERR(p);
    if (err !== null && Number.isFinite(err)) {
      validErrs.push(err);
    }
  }

  // Берём до 20 последних валидных постов (окно 15-20 постов)
  const recentErrs = validErrs.slice(0, 20);

  // Менее 10 постов - недостаточно данных
  if (recentErrs.length < 10) {
    return {
      flag: false,
      cv: 0,
      reason: "Недостаточно данных для анализа (менее 10 постов)",
      postsCount: recentErrs.length,
    };
  }

  const sum = recentErrs.reduce((acc, v) => acc + v, 0);
  const avgErr = sum / recentErrs.length;

  if (avgErr <= 0) {
    return {
      flag: false,
      cv: 0,
      reason: "Нулевой или отрицательный средний ERR",
      avgErr: 0,
      postsCount: recentErrs.length,
    };
  }

  const sumSquaredDiffs = recentErrs.reduce((acc, v) => acc + Math.pow(v - avgErr, 2), 0);
  const variance = sumSquaredDiffs / recentErrs.length;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const cv = Number.isFinite(stdDev / avgErr) ? stdDev / avgErr : 0;

  const isSuspicious = cv < 0.1;
  const reason = isSuspicious
    ? `Аномально равномерный ERR (CV = ${cv.toFixed(4)} < 0.1): подозрение на шаблонные накрутки реакций ботами`
    : `ERR в пределах нормы (CV = ${cv.toFixed(4)} >= 0.1: естественные колебания реакций)`;

  const result: UniformReactionRatioResult = {
    flag: isSuspicious,
    cv,
    reason,
    avgErr,
    postsCount: recentErrs.length,
  };

  if (isSuspicious) {
    result.signal = {
      signalType: 'uniform_err',
      value: cv,
      reason,
      channelId: extractChannelId(channel),
    };
  }

  return result;
}
