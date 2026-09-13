import { calculateCitationIndex, CitationMention } from './citationIndex';

export interface FraudSignalResult {
  flag: boolean;
  ratio: number;
  reason: string;
}


export interface GrowthSmoothnessResult {
  flag: boolean;
  cv: number; // Coefficient of Variation
  reason: string;
}

/**
 * Первая проверка на накрутку: аномальное соотношение просмотров к подписчикам.
 * 
 * @param posts Список последних постов (ожидается, что передаются последние 20-30 постов)
 * @param currentMembers Текущее число подписчиков канала
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
 * Вторая проверка на накрутку: выявление неестественно гладкого графика роста подписчиков.
 * 
 * @param metrics Список ежедневных метрик канала
 * @returns {GrowthSmoothnessResult} Результат проверки
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

export interface UncorrelatedSpikesResult {
  flag: boolean;
  spikesCount: number;
  dates: string[]; // dates in YYYY-MM-DD format
  reason: string;
}

/**
 * Третья проверка: выявление резких скачков подписчиков в дни без публикаций и упоминаний.
 * 
 * @param metrics Список ежедневных метрик канала
 * @param postsDates Даты публикаций на канале
 * @param mentionsDates Даты упоминаний канала
 * @returns {UncorrelatedSpikesResult} Результат проверки
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

export interface LowCitationGrowthResult {
  flag: boolean;
  citationIndex: number;
  growthRate: number;
  growthPercent: number;
  value: number;
  reason: string;
}

function parseGrowth(val: unknown): number {
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

function parseCitationIndexParam(val: unknown): number | null {
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

/**
 * Четвертая проверка: выявление быстрого роста подписчиков при околонулевом индексе цитирования.
 * 
 * Если канал за последние 30 дней вырос более чем на 5%, но при этом индекс цитирования
 * остается около нуля (отсутствуют или крайне малы упоминания в других каналах),
 * это сигнализирует о вероятной накрутке ботами/мотивированным трафиком.
 * 
 * @param growthOrChannel Рост за 30 дней (%) или объект канала
 * @param citationIndexOrMentions Индекс цитирования или список упоминаний
 * @param options Настройки порогов (по умолчанию minGrowth = 5, maxCitationIndex = 1)
 * @returns {LowCitationGrowthResult} Результат проверки
 */
export function checkLowCitationGrowth(
  growthOrChannel: number | string | bigint | {
    growthRate?: number | string | bigint;
    growth30d?: number | string | bigint;
    growthRate30d?: number | string | bigint;
    growthPercent?: number | string | bigint;
    delta30d?: { percent: number | null };
    citationIndex?: number | string | bigint | null;
    mentions?: any[];
    [key: string]: any;
  } | null | undefined,
  citationIndexOrMentions?: number | string | bigint | CitationMention[] | any,
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
      citationIndex = calculateCitationIndex(citationIndexOrMentions as any);
    }
  } else if (growthOrChannel && typeof growthOrChannel === 'object') {
    const rawGrowth: unknown =
      growthOrChannel.delta30d?.percent ??
      growthOrChannel.growthRate30d ??
      growthOrChannel.growth30d ??
      growthOrChannel.growthPercent ??
      growthOrChannel.growthRate;

    growthRate = parseGrowth(rawGrowth);

    const parsedCiParam = parseCitationIndexParam(citationIndexOrMentions);
    if (parsedCiParam !== null) {
      citationIndex = parsedCiParam;
    } else if (citationIndexOrMentions !== undefined && citationIndexOrMentions !== null) {
      citationIndex = calculateCitationIndex(citationIndexOrMentions as any);
    } else {
      const parsedChannelCi = parseCitationIndexParam(growthOrChannel.citationIndex);
      if (parsedChannelCi !== null) {
        citationIndex = parsedChannelCi;
      } else {
        citationIndex = calculateCitationIndex(growthOrChannel);
      }
    }
  }

  growthRate = isFinite(growthRate) ? growthRate : 0;
  citationIndex = isFinite(citationIndex) ? Math.max(0, citationIndex) : 0;

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
