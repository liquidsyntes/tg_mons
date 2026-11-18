import type { DataEvidence } from '@/lib/data-evidence';

export function DataEvidenceDetails({
  evidence,
  fallback,
}: {
  evidence?: DataEvidence;
  fallback?: boolean;
}) {
  if (!evidence) return null;
  const label = fallback
    ? 'Резервный ориентир'
    : evidence.status === 'sufficient'
      ? 'Основания рекомендации'
      : 'Ограниченные данные';
  return (
    <details className="rounded-xl border border-border/70 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
      <summary className="cursor-pointer font-medium text-slate-300 hover:text-white select-none">
        {label} · {evidence.sampleSize} публикаций
      </summary>
      <div className="mt-2 pt-2 border-t border-border/60 space-y-1 text-slate-400 leading-relaxed">
        <p>
          {evidence.source}. {evidence.reason}
        </p>
        <p>
          Последний сбор источника (для группы: самый ранний известный):{' '}
          {evidence.updatedAt ?? 'неизвестно'}
        </p>
        <p>
          Период публикаций: {evidence.periodStart ?? 'нет данных'} -{' '}
          {evidence.periodEnd ?? 'нет данных'}. Даты публикаций не подтверждают свежесть сбора.
        </p>
      </div>
    </details>
  );
}
