import type { DataEvidence } from '@/lib/data-evidence';

export function DataEvidenceDetails({ evidence, fallback }: {
  evidence?: DataEvidence;
  fallback?: boolean;
}) {
  if (!evidence) return null;
  const label = fallback ? 'Резервный ориентир'
    : evidence.status === 'sufficient' ? 'Основания рекомендации' : 'Ограниченные данные';
  return (
    <details className="text-xs text-slate-400">
      <summary className="cursor-pointer">{label} · {evidence.sampleSize} публикаций</summary>
      <p>{evidence.source}. {evidence.reason}</p>
      <p>Последний сбор источника (для группы: самый ранний известный): {evidence.updatedAt ?? 'неизвестно'}</p>
      <p>Период публикаций: {evidence.periodStart ?? 'нет данных'} - {evidence.periodEnd ?? 'нет данных'}. Даты публикаций не подтверждают свежесть сбора.</p>
    </details>
  );
}
