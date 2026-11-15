export interface DataEvidence {
  status: 'sufficient' | 'partial' | 'insufficient';
  source: string;
  updatedAt?: string | null;
  sampleSize: number;
  periodStart: string | null;
  periodEnd: string | null;
  reason: string;
}

export function describeSample(source: string, dates: readonly (Date | string | number | null | undefined)[], minimum: number): DataEvidence {
  const valid = dates.flatMap(value => {
    if (value == null) return [];
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? [time] : [];
  }).sort((a, b) => a - b);
  return {
    status: valid.length >= minimum ? 'sufficient' : valid.length ? 'partial' : 'insufficient',
    source, sampleSize: valid.length,
    periodStart: valid.length ? new Date(valid[0]).toISOString() : null,
    periodEnd: valid.length ? new Date(valid[valid.length - 1]).toISOString() : null,
    reason: valid.length >= minimum ? 'Достаточная выборка для ориентира; статистическая уверенность не оценивалась' : `Ограниченная выборка: требуется минимум ${minimum} публикаций с датой`,
  };
}
