'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import type { AdAttributionPlacement, ChannelAdAttribution } from '@/lib/types';

type Direction = 'inbound' | 'outbound';

const numberFormat = new Intl.NumberFormat('ru-RU');
const moneyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

function formatDelta(value: number | null): string {
  return value === null ? 'н/д' : `${value > 0 ? '+' : ''}${numberFormat.format(value)}`;
}

function formatMoney(value: number | null): string {
  return value === null ? 'н/д' : `${moneyFormat.format(value)} ₴`;
}

function PlacementCard({ placement, direction }: { placement: AdAttributionPlacement; direction: Direction }) {
  const otherChannel = direction === 'inbound' ? placement.sourceChannel : placement.targetChannel;
  return (
    <article className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/channel/${otherChannel.id}`} className="text-sm font-semibold text-white hover:text-accent">
          {otherChannel.title}{otherChannel.username ? ` (@${otherChannel.username})` : ''}
        </Link>
        <span className="text-xs text-slate-400">{new Date(placement.publishedAt).toLocaleString('ru-RU')}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${placement.isAd ? 'bg-orange-500/15 text-orange-300' : 'bg-slate-800 text-slate-400'}`}>
          {placement.isAd ? 'Реклама' : 'Упоминание'}
        </span>
        {placement.overlappingCampaigns && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">
          Пересечение размещений
        </span>}
      </div>
      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
        <span>Текущий охват: {placement.views === null ? 'н/д' : numberFormat.format(placement.views)}</span>
        <span>Подписчики +24 ч: {formatDelta(placement.deltaSubscribers24h)}</span>
        <span>Подписчики +48 ч: {formatDelta(placement.deltaSubscribers48h)}</span>
        <span>Оценка цены поста: {formatMoney(placement.estimatedPricePerPost)}</span>
        <span>Оценочный CPF: {formatMoney(placement.estimatedCpf)}</span>
        {direction === 'outbound' && <span>Конверсия просмотров: {placement.conversionPercent === null ? 'н/д' : `${placement.conversionPercent}%`}</span>}
      </div>
    </article>
  );
}

export function AdAttributionWidget({ channelId }: { channelId: number }) {
  const [direction, setDirection] = useState<Direction>('inbound');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<ChannelAdAttribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/channels/${channelId}/ad-attribution?days=${days}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить эффективность размещений');
        return await response.json() as ChannelAdAttribution;
      })
      .then(setData)
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channelId, days]);

  const placements = data?.[direction] ?? [];
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white"><Megaphone className="h-4 w-4 text-accent" />Эффективность размещений</h2>
          <p className="mt-1 text-xs text-slate-400">Прирост по снимкам аудитории и оценочная цена рекламы.</p>
        </div>
        <label className="text-xs text-slate-300">Период{' '}
          <select value={days} onChange={event => setDays(Number(event.target.value) as 7 | 30 | 90)}
            className="rounded-xl border border-border bg-slate-900 px-2 py-1.5 text-white">
            <option value={7}>7 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Направление размещений">
        <button type="button" role="tab" aria-selected={direction === 'inbound'} onClick={() => setDirection('inbound')}
          className={`rounded-xl border px-3 py-2 text-xs ${direction === 'inbound' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}>
          Закупки (Входящие упоминания)
        </button>
        <button type="button" role="tab" aria-selected={direction === 'outbound'} onClick={() => setDirection('outbound')}
          className={`rounded-xl border px-3 py-2 text-xs ${direction === 'outbound' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}>
          Отдача рекламы (Исходящие размещения)
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-slate-900/50" aria-label="Загрузка размещений" /> :
        placements.length === 0 ? <p className="rounded-xl border border-border p-6 text-center text-sm text-slate-400">
          Размещений за выбранный период нет.
        </p> : <div className="grid gap-3 lg:grid-cols-2">{placements.map(placement =>
          <PlacementCard key={`${placement.postId}:${placement.targetChannel.id}`} placement={placement} direction={direction} />)}</div>}
      <p className="text-xs text-slate-500">Прирост может включать органические подписки и другие кампании. Цена и CPF являются оценками, а не фактическими расходами.</p>
    </section>
  );
}
