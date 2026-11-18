'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Link2, Unlink } from 'lucide-react';
import type { PublicationResult } from '@/lib/publication-results';

interface Candidate {
  id: number;
  publishedAt: string;
  text: string | null;
}

const labels = {
  pending: 'Ожидается замер',
  missed: 'Окно замера пропущено',
  deleted: 'Публикация удалена',
  measured: 'Измерено',
} as const;

export function PublicationResultCard({
  result,
  disabled,
  onLink,
}: {
  result?: PublicationResult;
  disabled: boolean;
  onLink: (id: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<Candidate[]>([]);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [noChannel, setNoChannel] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch(`/api/posts/publication-candidates?${new URLSearchParams({ page: String(page), q: query })}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Не удалось загрузить публикации');
        return r.json() as Promise<{ posts: Candidate[]; hasMore: boolean; noMyChannel: boolean }>;
      })
      .then((d) => {
        setPosts(d.posts);
        setMore(d.hasMore);
        setNoChannel(d.noMyChannel);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Ошибка');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, page, query]);

  async function link(id: number | null) {
    try {
      await onLink(id);
      setOpen(false);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить связь');
    }
  }

  return (
    <div className="rounded-xl border border-border bg-slate-900/60 p-2.5 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-200">Фактическая публикация</p>
        {result?.state === 'linked' && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
            Привязана
          </span>
        )}
      </div>

      {result?.state === 'linked' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-slate-300">
              {result.channelTitle} · {result.publishedAt ? new Date(result.publishedAt).toLocaleString('ru-RU') : ''}
            </p>
            {result.username && (
              <a
                href={`https://t.me/${result.username}/${result.messageId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
              >
                <span>Открыть пост</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {result.deletedAt && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
              Пост удалён в Telegram. Сохранённые замеры доступны.
            </p>
          )}

          {result.points && result.points.length > 0 && (
            <div className="space-y-1.5">
              {result.points.map((point) => (
                <details
                  key={point.hours}
                  className="rounded-lg border border-border/80 bg-slate-950/70 p-2 space-y-1.5"
                >
                  <summary className="cursor-pointer font-mono font-medium text-slate-200 hover:text-white">
                    {point.hours} ч: {point.views === null ? labels[point.state] : `${point.views} просмотров`}
                  </summary>
                  <div className="pt-1 border-t border-border/50 space-y-1 text-[11px] text-slate-400">
                    <p>Возраст замера: {point.actualAgeHours?.toFixed(2) ?? 'нет данных'} ч.</p>
                    <p>
                      База: {point.sampleSize} публикаций того же формата и рекламного признака за предшествующие 30
                      дней.
                    </p>
                    <p className="text-slate-300">
                      {point.median === null
                        ? 'Недостаточно данных для сравнения (нужно 5)'
                        : `Медиана: ${point.median}; разница: ${point.delta ?? 'нет данных'}; ${
                            point.deltaPercent === null ? 'процент не определён' : `${point.deltaPercent.toFixed(1)}%`
                          }`}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          {!result
            ? 'Данные связи ещё не загружены'
            : result.state === 'unavailable'
              ? 'Связанная публикация недоступна'
              : result.state === 'removed'
                ? 'Связанная публикация удалена из базы'
                : 'Публикация не привязана'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
        >
          <Link2 className="w-3 h-3" />
          {result?.state === 'linked' ? 'Сменить публикацию' : 'Связать с публикацией'}
        </button>

        {result && result.state !== 'unlinked' && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void link(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50 transition-colors"
          >
            <Unlink className="w-3 h-3" />
            Отвязать
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
          {error}
        </p>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-border/80 bg-slate-950/60 p-2.5">
          <label className="block space-y-1 text-[11px] font-medium text-slate-300">
            <span>Поиск публикации</span>
            <input
              className="w-full rounded-lg bg-slate-950 border border-border px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
              placeholder="Текст публикации..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>

          {loading ? (
            <p className="text-[11px] text-slate-400 py-1">Загрузка...</p>
          ) : noChannel ? (
            <p className="text-[11px] text-amber-300 py-1">Сначала отметьте «Мой канал».</p>
          ) : posts.length === 0 ? (
            <p className="text-[11px] text-slate-500 py-1">Публикаций нет</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {posts.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  disabled={disabled}
                  onClick={() => void link(p.id)}
                  className="block text-left rounded-lg border border-border bg-slate-950/80 hover:border-accent/50 hover:bg-slate-800/70 p-2 w-full text-[11px] text-slate-200 transition-colors disabled:opacity-50"
                >
                  {new Date(p.publishedAt).toLocaleString('ru-RU')} · {p.text ?? 'Публикация без текста'}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              disabled={loading || page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-border bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Назад
            </button>
            <button
              type="button"
              disabled={loading || !more}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Далее
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
