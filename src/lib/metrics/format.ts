export function formatPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value.toFixed(2));
}

export function formatDelta(
  current: number,
  baseline: number
): { abs: number; percent: number } {
  if (baseline === 0) return { abs: current, percent: 0 };
  const abs = current - baseline;
  const percent = formatPercent((abs / baseline) * 100) || 0;
  return { abs, percent };
}
