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

