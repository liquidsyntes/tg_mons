'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import type { AdAttributionPlacement } from '@/lib/types';
import { isDeletedRetentionFormat } from '@/lib/adReach';
import { AdRetentionBadge } from '@/components/AdRetentionBadge';
import { DealEditorForm } from './DealEditorForm';
import {
  type Direction,
  FORMAT_SHORT_LABELS,
  PRICE_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  formatDelta,
  formatMoney,
  numberFormat,
} from './helpers';

export function PlacementCard({
  channelId,
  placement,
  direction,
  onSaved,
}: {
  channelId: number;
  placement: AdAttributionPlacement;
  direction: Direction;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const otherChannel = direction === 'inbound' ? placement.sourceChannel : placement.targetChannel;
  const deal = placement.deal ?? null;
  const retentionFormat = placement.retentionFormat;
  const isDeleted = Boolean(placement.deletedAt) || isDeletedRetentionFormat(retentionFormat);
  const displayedViews = placement.lastCapturedViews ?? placement.views;

  return (
    <article className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/channel/${otherChannel.id}`} className="text-sm font-semibold text-white hover:text-accent">
          {otherChannel.title}{otherChannel.username ? ` (@${otherChannel.username})` : ''}
        </Link>
        <span className="text-xs text-slate-400">{new Date(placement.publishedAt).toLocaleString('ru-RU')}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${placement.isAd ? 'bg-orange-500/15 text-orange-300' : 'bg-slate-800 text-slate-400'}`}>
          {placement.isAd ? 'Реклама' : 'Упоминание'}
        </span>
        <AdRetentionBadge format={retentionFormat} deletedAt={placement.deletedAt} variant="detailed" />
        {placement.overlappingCampaigns && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300" title="В этот же период выходили другие размещения">
            Пересечение размещений
          </span>
        )}
        {deal && (
          <>
            <span className={`rounded px-2 py-0.5 ${STATUS_BADGE_CLASSES[deal.status]}`}>
              {STATUS_LABELS[deal.status]}
            </span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
              {FORMAT_SHORT_LABELS[deal.format]}
            </span>
            {deal.factualCpm !== null && (
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                CPM {formatMoney(deal.factualCpm, deal.currency)}
              </span>
            )}
            {deal.factualCpf !== null && (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-accent">
                CPF {formatMoney(deal.factualCpf, deal.currency)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
        <span>
          {isDeleted ? 'Сохранённый охват' : 'Текущий охват'}:{' '}
          {displayedViews === null ? 'н/д' : numberFormat.format(displayedViews)}
        </span>
        <span>Подписчики +24 ч: {formatDelta(placement.deltaSubscribers24h)}</span>
        <span>Подписчики +48 ч: {formatDelta(placement.deltaSubscribers48h)}</span>
        {deal ? (
          <>
            <span className="font-medium text-white">
              Факт. цена: {formatMoney(deal.priceAmount, deal.currency)}
            </span>
            <span>
              Факт. CPF: {formatMoney(deal.factualCpf, deal.currency)}
              {deal.actualJoins !== null ? ` (по инвайту: +${numberFormat.format(deal.actualJoins)})` : ''}
            </span>
          </>
        ) : (
          <>
            <span>Цена поста: {formatMoney(placement.estimatedPricePerPost)}{placement.priceSource ? ` · ${PRICE_LABELS[placement.priceSource]}` : ''}</span>
            <span>Оценочный CPF: {formatMoney(placement.estimatedCpf)}</span>
          </>
        )}
        {direction === 'outbound' && (
          <span>Конверсия просмотров: {placement.conversionPercent === null ? 'н/д' : `${placement.conversionPercent}%`}</span>
        )}
      </div>

      {deal?.notes && (
        <p className="rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300">
          {deal.notes}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {deal?.inviteLink ? (
          <span className="truncate text-[11px] text-slate-400" title={deal.inviteLink}>
            Инвайт: {deal.inviteLink}
          </span>
        ) : <span />}
        <button
          type="button"
          onClick={() => setEditing(value => !value)}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Pencil className="h-3 w-3" />
          {deal ? 'Изменить условия' : 'Указать цену / условия'}
        </button>
      </div>

      {editing && (
        <DealEditorForm
          channelId={channelId}
          donorOptions={[placement.sourceChannel]}
          allowDonorPick={false}
          initialDeal={deal}
          defaultTargetChannelId={placement.targetChannel.id}
          defaultDonorChannelId={placement.sourceChannel.id}
          defaultPostId={placement.postId}
          defaultPrice={placement.estimatedPricePerPost}
          defaultScheduledAt={placement.publishedAt}
          defaultStatus="completed"
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </article>
  );
}
