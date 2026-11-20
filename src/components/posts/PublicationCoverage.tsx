'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { HelpPopover } from '@/components/help/HelpPopover';
import type { PublicationSummary } from '@/lib/metrics/publication-summary';

export function PublicationCoverage({ revision }: { revision: unknown }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PublicationSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    void fetch(`/api/posts/saved?coverageDays=${days}&summaryOnly=true`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Не удалось загрузить полноту замеров');
        return r.json() as Promise<{ summary?: PublicationSummary | null }>;
      })
      .then((r) => setData(r?.summary ?? null))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        }
      });
    return () => controller.abort();
  }, [days, revision]);

  return (
    <section
      aria-label="Полнота замеров"
      className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4 text-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent shrink-0" />
          <h3 className="text-sm font-semibold text-white">Полнота замеров публикаций</h3>
          <HelpPopover sectionId="publication-coverage" />
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
          <span>Эффективность публикаций за</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-slate-900 border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} дней
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
        >
          {error}
        </p>
      ) : !data ? (
        <p className="text-xs text-slate-400">Загрузка...</p>
      ) : (
        <>
          <p className="text-xs text-slate-400 leading-relaxed">
            По фактической дате публикации:{' '}
            <span className="font-mono text-slate-300">
              {new Date(data.coverage.periodStart).toLocaleString('ru-RU', { timeZone: data.timeZone })} -{' '}
              {new Date(data.coverage.periodEnd).toLocaleString('ru-RU', { timeZone: data.timeZone })}
            </span>
            . Часовой пояс: <span className="text-slate-300">{data.timeZone}</span>. Уникальных связанных публикаций:{' '}
            <strong className="font-mono text-white">{data.coverage.publications}</strong>, удалённых:{' '}
            <strong className="font-mono text-white">{data.coverage.deletedPublications}</strong>.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {data.coverage.windows.map((w) => (
              <div
                key={w.hours}
                className="rounded-xl border border-border bg-slate-900/50 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white font-mono">Окно {w.hours} ч</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-mono font-semibold ${
                      w.completenessPercent === null
                        ? 'bg-slate-800 text-slate-400'
                        : w.completenessPercent >= 80
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : w.completenessPercent >= 50
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {w.completenessPercent === null ? 'нет данных' : `${w.completenessPercent}%`}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {w.hours} ч: ожидаются {w.pending}; собраны {w.measured}; пропущены {w.missed}; удалены без замера{' '}
                  {w.deleted}. Полнота:{' '}
                  {w.completenessPercent === null ? 'нет данных' : `${w.completenessPercent}%`} ({w.denominator}{' '}
                  завершённых окон).
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400">
            Вне периода (дата неизвестна): недоступных публикаций{' '}
            <span className="font-mono text-slate-300">{data.unavailable}</span>; карточек с потерянной связью{' '}
            <span className="font-mono text-slate-300">{data.removedLinks}</span>.
          </p>

          {data.groups.length === 0 ? (
            <div className="rounded-xl border border-border bg-slate-900/40 p-4 text-center text-xs text-slate-400">
              За период нет доступных связанных публикаций.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-slate-900/30">
              <table className="w-full text-left text-xs border-collapse">
                <caption className="px-3.5 py-2.5 text-left text-xs font-semibold text-white border-b border-border bg-slate-900/60">
                  Сравнение с индивидуальной исторической медианой
                </caption>
                <thead>
                  <tr className="border-b border-border bg-slate-900/40 text-slate-400">
                    {['Формат', 'Окно', 'Замеры', 'Сравнимые', 'Выше / равно / ниже', 'Без базы'].map((label, idx) => (
                      <th
                        key={label}
                        scope="col"
                        className={`px-3 py-2 font-medium whitespace-nowrap ${idx >= 1 ? 'text-right' : ''}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.groups.flatMap((g) =>
                    g.windows.map((w) => (
                      <tr
                        key={`${g.isAd}-${g.contentType}-${w.hours}`}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-3 py-2.5 text-slate-200 font-medium whitespace-nowrap">
                          {g.contentType} ({g.isAd ? 'реклама' : 'обычные'}), {g.publications} публ.
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {w.hours} ч
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                          {w.measured}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                          {w.comparable}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white whitespace-nowrap">
                          {w.above} / {w.equal} / {w.below}
                          {w.comparable > 0 && (
                            <span className="block text-[11px] text-slate-400 mt-0.5">
                              {[w.above, w.equal, w.below]
                                .map((n) => `${Math.round((n / w.comparable) * 100)}%`)
                                .join(' / ')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-400">
                          {w.withoutBaseline}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}

          <details className="rounded-xl border border-border/70 bg-slate-900/40 p-3 text-xs text-slate-300">
            <summary className="cursor-pointer font-medium text-slate-200 hover:text-white">
              Как считается сравнение
            </summary>
            <p className="mt-2 leading-relaxed text-slate-400">
              Для каждой публикации и окна берётся медиана минимум 5 валидных замеров других предшествующих постов того
              же канала, формата и рекламного признака за 30 дней. Выше и ниже означают строгое сравнение просмотров,
              на уровне означает равенство. Доли рассчитаны от числа сравнимых публикаций в строке. Нули учитываются,
              отсутствие данных не равно нулю. Средний процент прироста не вычисляется. По этой сводке нельзя
              установить причину результата или рекомендовать лучший формат: достаточность для такого вывода не
              подтверждена.
            </p>
          </details>

          <p className="text-xs text-slate-400">
            Полнота учитывает собранные и пропущенные замеры только после закрытия окна. Ожидающие и удалённые без
            замера исключены. Причина пропуска без записанных доказательств неизвестна.
          </p>
        </>
      )}
    </section>
  );
}
