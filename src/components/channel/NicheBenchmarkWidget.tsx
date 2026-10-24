import type { NicheBenchmarkMetric, NicheBenchmarkMetricKey, NicheBenchmarkResult } from '@/lib/types';

const labels: Array<{ key: NicheBenchmarkMetricKey; label: string; suffix: string }> = [
  { key: 'er7d', label: 'ER 7д', suffix: '%' },
  { key: 'err7d', label: 'ERR 7д', suffix: '%' },
  { key: 'vr7d', label: 'VR 7д', suffix: '%' },
  { key: 'posts7d', label: 'Постов за 7 дней', suffix: '' },
  { key: 'adShare30d', label: 'Доля рекламы 30д', suffix: '%' },
  { key: 'delta7dPct', label: 'Прирост 7д', suffix: '%' },
];

function formatValue(value: number | null, suffix: string): string {
  return value === null ? 'Нет данных' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function position(value: number, minimum: number, maximum: number): number {
  return maximum === minimum ? 50 : 100 * (value - minimum) / (maximum - minimum);
}

function metricBadge(metric: NicheBenchmarkMetric): string {
  if (metric.rank === null || metric.median === null || metric.value === null) return 'Недостаточно данных';
  if (metric.rank >= 75) return 'Топ 25% ниши';
  if (metric.value === metric.median) return 'На медиане';
  return metric.rank > 50 ? 'Выше медианы' : 'Ниже медианы';
}

function MetricRow({ label, suffix, metric }: { label: string; suffix: string; metric: NicheBenchmarkMetric }) {
  if (metric.value === null || metric.p25 === null || metric.median === null || metric.p75 === null) {
    return (
      <div className="rounded-xl border border-border/70 bg-slate-900/40 p-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-200">{label}</span>
        <span className="text-xs text-slate-400">Нет данных для сравнения</span>
      </div>
    );
  }
  const minimum = Math.min(metric.p25, metric.value);
  const maximum = Math.max(metric.p75, metric.value);
  const left = position(metric.p25, minimum, maximum);
  const right = position(metric.p75, minimum, maximum);
  const current = position(metric.value, minimum, maximum);
  return (
    <div className="rounded-xl border border-border/70 bg-slate-900/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-slate-200">{label}</span>
        <span className="font-mono text-white">{formatValue(metric.value, suffix)}</span>
        <span className="text-accent">{metricBadge(metric)}</span>
      </div>
      <div className="relative h-2 bg-slate-700 rounded-lg" aria-label={`${label}: ${formatValue(metric.value, suffix)}, медиана ${formatValue(metric.median, suffix)}`} role="img">
        <div className="absolute h-full bg-sky-500/40" style={{ left: `${left}%`, width: `${right - left}%` }} />
        <div className="absolute top-[-3px] w-px h-3.5 bg-slate-300" style={{ left: `${position(metric.median, minimum, maximum)}%` }} />
        <div className="absolute top-[-3px] w-2 h-3.5 bg-accent rounded-lg -translate-x-1/2" style={{ left: `${current}%` }} />
      </div>
      <div className="flex justify-between gap-2 text-[10px] text-slate-400">
        <span>P25 {formatValue(metric.p25, suffix)}</span>
        <span>Медиана {formatValue(metric.median, suffix)}</span>
        <span>P75 {formatValue(metric.p75, suffix)}</span>
      </div>
    </div>
  );
}

export function NicheBenchmarkWidget({ benchmark }: { benchmark: NicheBenchmarkResult }) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-white">Позиция в нише: {benchmark.niche}</h2>
        <span className="text-xs text-slate-400">Активных каналов: {benchmark.cohortSize}</span>
      </div>
      {benchmark.status === 'insufficient_cohort' ? (
        <p className="text-sm text-slate-400">Для сравнения нужны минимум 3 активных канала той же ниши и типа.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {labels.map(({ key, label, suffix }) => (
            <MetricRow key={key} label={label} suffix={suffix} metric={benchmark.metrics[key]} />
          ))}
        </div>
      )}
    </section>
  );
}
