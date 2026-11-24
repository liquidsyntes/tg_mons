'use client';

/**
 * Виджет рекламной атрибуции и трекера закупок канала на странице /channel/[id].
 * Отображает сводку фактического ROI/CPM/CPF по закупкам, автоматически найденные
 * упоминания (+24/+48 ч прирост) и позволяет фиксировать реальные условия сделок
 * (цену, формат 1/24, 2/48, инвайт-ссылку, фактические вступления и заметки).
 */

import { useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import type { ChannelAdAttribution } from '@/lib/types';
import { AdPriceSettings } from './AdPriceSettings';
import { HelpPopover } from '@/components/help/HelpPopover';
import type { Direction } from './ad-attribution/helpers';
import { DealEditorForm } from './ad-attribution/DealEditorForm';
import { SummaryKpiStrip } from './ad-attribution/SummaryKpiStrip';
import { PlacementCard } from './ad-attribution/PlacementCard';
import { ManualDealCard } from './ad-attribution/ManualDealCard';

/**
 * Основной компонент виджета атрибуции и трекера закупок.
 */
export function AdAttributionWidget({ channelId, onPriceSaved }: { channelId: number; onPriceSaved?: () => void }) {
  const [direction, setDirection] = useState<Direction>('inbound');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<ChannelAdAttribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceRevision, setPriceRevision] = useState(0);
  const [showNewDealForm, setShowNewDealForm] = useState(false);

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
  }, [channelId, days, priceRevision]);

  const placements = data?.[direction] ?? [];
  const manualPlacements = data?.manualPlacements ?? [];
  const accessibleChannels = data?.accessibleChannels ?? [];
  const summary = data?.summary;
  const triggerReload = () => {
    setPriceRevision(value => value + 1);
    onPriceSaved?.();
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Megaphone className="h-4 w-4 text-accent" />
            <span>Эффективность размещений</span>
            <HelpPopover sectionId="ad-attribution" />
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Фактический учёт закупок (CPM, CPF) и автоматическая атрибуция прироста аудитории.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewDealForm(value => !value)}
            disabled={accessibleChannels.length === 0}
            title={accessibleChannels.length === 0 ? 'Добавьте ещё один канал, чтобы выбрать донора' : undefined}
            className="inline-flex items-center gap-1 rounded-xl border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {showNewDealForm ? 'Скрыть форму' : 'Добавить закупку'}
          </button>
          <label className="text-xs text-slate-300">
            Период{' '}
            <select
              value={days}
              onChange={event => setDays(Number(event.target.value) as 7 | 30 | 90)}
              className="rounded-xl border border-border bg-slate-900 px-2 py-1.5 text-white"
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </label>
        </div>
      </div>

      {summary && summary.dealsCount > 0 && (
        <SummaryKpiStrip summary={summary} />
      )}

      {showNewDealForm && (
        <DealEditorForm
          channelId={channelId}
          donorOptions={accessibleChannels}
          allowDonorPick={true}
          initialDeal={null}
          defaultTargetChannelId={channelId}
          defaultDonorChannelId={accessibleChannels[0]?.id ?? null}
          defaultPostId={null}
          defaultPrice={null}
          defaultScheduledAt={null}
          defaultStatus="planned"
          onCancel={() => setShowNewDealForm(false)}
          onSaved={() => {
            setShowNewDealForm(false);
            triggerReload();
          }}
        />
      )}

      <AdPriceSettings
        channelId={channelId}
        onSaved={triggerReload}
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Направление размещений">
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'inbound'}
          onClick={() => setDirection('inbound')}
          className={`rounded-xl border px-3 py-2 text-xs ${direction === 'inbound' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}
        >
          Закупки (Входящие упоминания)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'outbound'}
          onClick={() => setDirection('outbound')}
          className={`rounded-xl border px-3 py-2 text-xs ${direction === 'outbound' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}
        >
          Отдача рекламы (Исходящие размещения)
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-900/50" aria-label="Загрузка размещений" />
      ) : (
        <>
          {direction === 'inbound' && manualPlacements.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Запланированные и ручные закупки ({manualPlacements.length})
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {manualPlacements.map(deal => (
                  <ManualDealCard
                    key={`deal-${deal.id}`}
                    channelId={channelId}
                    deal={deal}
                    donorOptions={accessibleChannels}
                    onSaved={triggerReload}
                  />
                ))}
              </div>
            </div>
          )}

          {placements.length === 0 && (direction === 'outbound' || manualPlacements.length === 0) ? (
            <p className="rounded-xl border border-border p-6 text-center text-sm text-slate-400">
              Размещений за выбранный период нет.
            </p>
          ) : placements.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {placements.map(placement => (
                <PlacementCard
                  key={`${placement.postId}:${placement.targetChannel.id}`}
                  channelId={channelId}
                  placement={placement}
                  direction={direction}
                  onSaved={triggerReload}
                />
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-slate-500">
        Прирост без указания инвайт-ссылки может включать органические подписки. Зафиксированная цена и вступления используются в фактических расчётах CPM и CPF.
      </p>
    </section>
  );
}
