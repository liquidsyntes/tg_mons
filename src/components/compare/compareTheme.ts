export interface CompareSeriesStyle {
  stroke: string;
  dotBg: string;
  borderClass: string;
  textClass: string;
  slotLabel: string;
}

export const COMPARE_SERIES_STYLES: ReadonlyArray<CompareSeriesStyle> = [
  {
    stroke: '#38bdf8',
    dotBg: 'bg-sky-400',
    borderClass: 'border-sky-500/30',
    textClass: 'text-sky-400',
    slotLabel: 'Канал A',
  },
  {
    stroke: '#fbbf24',
    dotBg: 'bg-amber-400',
    borderClass: 'border-amber-500/30',
    textClass: 'text-amber-400',
    slotLabel: 'Канал B',
  },
  {
    stroke: '#34d399',
    dotBg: 'bg-emerald-400',
    borderClass: 'border-emerald-500/30',
    textClass: 'text-emerald-400',
    slotLabel: 'Канал C',
  },
  {
    stroke: '#a78bfa',
    dotBg: 'bg-violet-400',
    borderClass: 'border-violet-500/30',
    textClass: 'text-violet-400',
    slotLabel: 'Канал D',
  },
];

export const COMPARE_BENCHMARK_STYLE: CompareSeriesStyle = {
  stroke: '#f472b6',
  dotBg: 'bg-pink-400',
  borderClass: 'border-pink-500/40',
  textClass: 'text-pink-300',
  slotLabel: 'Эталон папки',
};

export function getParticipantStyle(index: number, isBenchmark?: boolean): CompareSeriesStyle {
  if (isBenchmark) return COMPARE_BENCHMARK_STYLE;
  return COMPARE_SERIES_STYLES[index % COMPARE_SERIES_STYLES.length];
}
