'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TopAdvertiser, TopAdvertisersResponse } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface TopAdvertisersPanelProps {
  niche: string;
  days: 7 | 30;
  selectedUsername: string;
  onDaysChange: (days: 7 | 30) => void;
  onSelect: (username: string) => void;
}

function money(value: number | null): string {
  return value === null ? 'н/д' : `${formatNumber(value)} ₴`;
}

function AdvertiserCard({ advertiser, selected, onSelect }: {
  advertiser: TopAdvertiser;
  selected: boolean;
  onSelect: () => void;
}) {
  return <article className={`rounded-xl border bg-slate-900 p-4 space-y-3 ${selected ? 'border-accent' : 'border-border'}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h4 className="font-semibold text-white">@{advertiser.username}</h4>
        <p className="text-xs text-slate-400">{advertiser.placementsCount} размещений · {advertiser.channelsCount} каналов</p>
      </div>
      <button type="button" onClick={onSelect} aria-pressed={selected}
        className="rounded-lg border border-accent/40 px-2 py-1 text-xs text-accent hover:bg-accent/10">
        Показать размещения
      </button>
    </div>
    <dl className="grid grid-cols-2 gap-2 text-xs">
      <div><dt className="text-slate-500">Суммарный охват</dt><dd className="text-white">{advertiser.totalViews === null ? 'н/д' : formatNumber(advertiser.totalViews)}</dd></div>
      <div><dt className="text-slate-500">Средний охват</dt><dd className="text-white">{advertiser.avgViews === null ? 'н/д' : formatNumber(advertiser.avgViews)}</dd></div>
      <div><dt className="text-slate-500">Оценка бюджета</dt><dd className="text-white" title="По CPM ниши донорского канала и текущим просмотрам постов">{money(advertiser.estimatedSpendUah)}</dd></div>
      <div><dt className="text-slate-500">Первое / последнее</dt><dd className="text-white">{new Date(advertiser.firstSeenAt).toLocaleDateString('ru-RU')} / {new Date(advertiser.lastSeenAt).toLocaleDateString('ru-RU')}</dd></div>
    </dl>
    <div className="text-xs text-slate-400">
      <span className="text-slate-500">Каналы размещения: </span>
      {advertiser.donorChannels.map((channel, index) => <span key={channel.id}>
        {index > 0 ? ', ' : ''}<Link href={`/channel/${channel.id}`} className="text-slate-300 hover:text-accent">{channel.title} ({channel.placementsCount})</Link>
      </span>)}
    </div>
    {advertiser.isTrackedChannel && advertiser.channelId !== null &&
      <Link href={`/channel/${advertiser.channelId}`} className="inline-block text-xs text-accent hover:underline">Открыть отслеживаемый канал</Link>}
  </article>;
}

export function TopAdvertisersPanel({ niche, days, selectedUsername, onDaysChange, onSelect }: TopAdvertisersPanelProps) {
  const [advertisers, setAdvertisers] = useState<TopAdvertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ days: String(days) });
    if (niche) params.set('niche', niche);
    setLoading(true);
    setError(null);
    fetch(`/api/posts/advertisers?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить рекламодателей');
        return await response.json() as TopAdvertisersResponse;
      })
      .then(data => { if (!controller.signal.aborted) setAdvertisers(data.advertisers); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, niche]);

  return <section className="rounded-2xl border border-border bg-surface p-5 space-y-4" aria-label="Топ рекламодателей">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-white">Топ рекламодателей</h2>
        <p className="text-xs text-slate-400">По рекламным постам отслеживаемых каналов</p>
      </div>
      <label className="text-xs text-slate-300">Период рейтинга{' '}
        <select value={days} onChange={event => onDaysChange(Number(event.target.value) as 7 | 30)}
          className="ml-2 rounded-lg border border-border bg-slate-900 px-2 py-1.5 text-white">
          <option value={7}>7 дней</option><option value={30}>30 дней</option>
        </select>
      </label>
    </div>
    {loading ? <p className="text-sm text-slate-400">Загрузка рекламодателей...</p>
      : error ? <p role="alert" className="text-sm text-rose-400">{error}</p>
      : advertisers.length === 0 ? <p className="text-sm text-slate-400">Рекламодатели за период не найдены</p>
      : <div className="grid gap-3 lg:grid-cols-2">
        {advertisers.map(advertiser => <AdvertiserCard key={advertiser.username} advertiser={advertiser}
          selected={selectedUsername === advertiser.username} onSelect={() => onSelect(advertiser.username)} />)}
      </div>}
  </section>;
}
