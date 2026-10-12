import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ChannelMetrics } from '@/lib/types';
import { formatDelta } from '@/lib/utils';

interface SummaryMetricProps {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  title?: string;
}

export function SummaryMetric({ label, value, detail, title }: SummaryMetricProps) {
  return (
    <div className="min-w-0 min-h-[104px] bg-slate-900/70 px-3.5 py-3.5 flex flex-col justify-between gap-3" title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] leading-4 text-slate-400">
        {label}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[17px] font-semibold leading-6 tracking-tight tabular-nums text-slate-100 whitespace-nowrap">
          {value}
        </div>
        <div className="mt-1 min-h-4 text-[11px] leading-4 text-slate-400 whitespace-nowrap">
          {detail}
        </div>
      </div>
    </div>
  );
}

export function GrowthMetric({ label, delta, nominalDays }: {
  label: string;
  delta: ChannelMetrics['delta24h'];
  nominalDays: number;
}) {
  const formatted = formatDelta(delta.abs, delta.percent);
  const color = formatted.direction === 'pos' ? 'text-emerald-400' : formatted.direction === 'neg' ? 'text-rose-400' : 'text-slate-300';
  const coverageIsPartial = delta.coverageDays != null && Math.abs(delta.coverageDays - nominalDays) > 1;

  return (
    <SummaryMetric
      label={label}
      value={
        <span className={`inline-flex items-center gap-1.5 ${color}`}>
          {formatted.direction === 'pos' ? <TrendingUp className="h-4 w-4 shrink-0" /> :
            formatted.direction === 'neg' ? <TrendingDown className="h-4 w-4 shrink-0" /> :
            formatted.direction === 'zero' ? <Minus className="h-4 w-4 shrink-0" /> : null}
          {formatted.text}
        </span>
      }
      detail={formatted.direction === 'na' ? 'Недостаточно данных' : (
        <span title={coverageIsPartial ? `Данные за ${delta.coverageDays} дней из ${nominalDays}` : undefined}>
          {formatted.percentText}{coverageIsPartial ? ` · ${delta.coverageDays}/${nominalDays}д` : ''}
        </span>
      )}
    />
  );
}
