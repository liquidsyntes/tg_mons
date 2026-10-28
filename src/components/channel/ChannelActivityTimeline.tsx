'use client';

import { useEffect, useState } from 'react';
import { Activity, ChevronDown, RotateCw } from 'lucide-react';
import type { HourlyActivityRow } from '@/lib/channel-activity';
import { formatNumber } from '@/lib/utils';

interface ActivityResponse {
  timeZone: string;
  rows: HourlyActivityRow[];
}

interface ChannelActivityTimelineProps {
  channelId: number;
  username: string | null;
  tgId: string | null;
}

function postHref(username: string | null, tgId: string | null, messageId: string): string | null {
  if (!/^[1-9]\d*$/.test(messageId)) return null;
  if (username && /^[a-z0-9_]{4,}$/i.test(username)) return `https://t.me/${username}/${messageId}`;
  return tgId && /^[1-9]\d*$/.test(tgId) ? `https://t.me/c/${tgId}/${messageId}` : null;
}

export function ChannelActivityTimeline({ channelId, username, tgId }: ChannelActivityTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPosts, setShowPosts] = useState(true);
  const [showReposts, setShowReposts] = useState(true);
  const [showReactions, setShowReactions] = useState(true);
  const [showForwards, setShowForwards] = useState(true);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/stats/channel/${channelId}/activity`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить активность');
        return response.json() as Promise<ActivityResponse>;
      })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить активность');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channelId, expanded, revision]);

  const formatter = data ? new Intl.DateTimeFormat('ru-RU', {
    timeZone: data.timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : null;
  const hasObservations = data?.rows.some(row => row.membersCount !== null || row.posts.length > 0
    || row.reactionsAdded > 0 || row.forwardsAdded > 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" data-pdf-hide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Activity className="h-5 w-5 text-accent" /> Активность по часам
          </h2>
          <p className="mt-1 text-xs text-slate-400">48 последних часов: аудитория, публикации, реакции и пересылки</p>
        </div>
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
          aria-controls={`activity-content-${channelId}`}
          className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          {expanded ? 'Свернуть' : 'Развернуть'} <ChevronDown className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div id={`activity-content-${channelId}`} className={expanded ? 'mt-5 space-y-4' : 'hidden'}>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {([
            ['Посты', showPosts, setShowPosts],
            ['Репосты в канале', showReposts, setShowReposts],
            ['Реакции', showReactions, setShowReactions],
            ['Пересылки постов', showForwards, setShowForwards],
          ] as const).map(([label, checked, setChecked]) => (
            <label key={label} className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)}
                className="rounded border-border bg-slate-900 text-accent focus:ring-accent" /> {label}
            </label>
          ))}
          <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}
            className="ml-auto flex items-center gap-1 text-accent hover:underline disabled:opacity-50">
            <RotateCw className="h-3.5 w-3.5" /> Обновить
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Прирост аудитории сравнивается с предыдущим часом. Реакции и пересылки отмечаются в час, когда сборщик заметил изменение счётчика; первый замер служит исходной точкой.
        </p>
        {loading && !data && <p role="status" className="text-xs text-slate-400">Загрузка активности...</p>}
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
        {data && !hasObservations && <p className="text-xs text-slate-400">За последние 48 часов наблюдений пока нет.</p>}
        {data && hasObservations && (
          <div className="max-h-[480px] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-300">
                <tr><th className="px-3 py-2">Час</th><th className="px-3 py-2">Подписчиков</th>
                  <th className="px-3 py-2">Прирост</th><th className="px-3 py-2">События</th></tr>
              </thead>
              <tbody>
                {data.rows.map(row => {
                  const reposts = row.posts.filter(post => post.isForwarded);
                  const regularPosts = row.posts.filter(post => !post.isForwarded);
                  const firstPost = (showPosts ? regularPosts[0] : null) ?? (showReposts ? reposts[0] : null);
                  const href = firstPost ? postHref(username, tgId, firstPost.messageId) : null;
                  return <tr key={row.hourStart} className="border-t border-border/70 even:bg-slate-900/30">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-300">{formatter?.format(new Date(row.hourStart))}</td>
                    <td className="px-3 py-2 font-mono text-white" title={row.sampledAt ? `Замер: ${formatter?.format(new Date(row.sampledAt))}` : 'В этот час замера не было'}>
                      {row.membersCount === null ? 'Нет замера' : formatNumber(row.membersCount)}
                    </td>
                    <td className={`px-3 py-2 font-mono font-semibold ${row.membersDelta === null ? 'text-slate-500'
                      : row.membersDelta > 0 ? 'text-emerald-400' : row.membersDelta < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {row.membersDelta === null ? 'н/д' : row.membersDelta > 0 ? `+${row.membersDelta}` : row.membersDelta}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {showPosts && regularPosts.length > 0 && <span>Вышел пост ×{regularPosts.length}</span>}
                        {showReposts && reposts.length > 0 && <span>Репост в канале ×{reposts.length}</span>}
                        {showReactions && row.reactionsAdded > 0 && <span>Реакции +{row.reactionsAdded}</span>}
                        {showForwards && row.forwardsAdded > 0 && <span>Пересылки +{row.forwardsAdded}</span>}
                        {href && <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Открыть пост</a>}
                        {(!showPosts || regularPosts.length === 0) && (!showReposts || reposts.length === 0)
                          && (!showReactions || row.reactionsAdded === 0) && (!showForwards || row.forwardsAdded === 0)
                          && <span className="text-slate-500">Нет событий</span>}
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
