export type StatsPeriod = '24h' | '7d' | '30d';

export function parseStatsPeriod(periodParam: string | null): StatsPeriod {
  return periodParam === '24h' || periodParam === '30d' ? periodParam : '7d';
}

/**
 * Округляет числовое значение процента до 2 знаков (`number | null`).
 * Для строкового форматирования с `%` используйте `formatPercent` или `formatLocalePercent` из `@/lib/utils`.
 */
export function roundPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value.toFixed(2));
}

export const formatPercent = roundPercent;

export function formatDelta(
  current: number,
  baseline: number
): { abs: number; percent: number } {
  if (baseline === 0) return { abs: current, percent: 0 };
  const abs = current - baseline;
  const percent = formatPercent((abs / baseline) * 100) || 0;
  return { abs, percent };
}

