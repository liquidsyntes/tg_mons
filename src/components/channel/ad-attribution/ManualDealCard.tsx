'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Pencil } from 'lucide-react';
import type { AdPlacementDeal } from '@/lib/types';
import { DealEditorForm } from './DealEditorForm';
import {
  FORMAT_SHORT_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  formatDelta,
  formatMoney,
} from './helpers';

export function ManualDealCard({
  channelId,
  deal,
  donorOptions,
  onSaved,
}: {
  channelId: number;
  deal: AdPlacementDeal;
  donorOptions: Array<{ id: number; title: string; username: string | null }>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <article className="rounded-xl border border-border bg-slate-900/40 p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {deal.donorChannel ? (
          <Link href={`/channel/${deal.donorChannel.id}`} className="text-sm font-semibold text-white hover:text-accent">
            {deal.donorChannel.title}{deal.donorChannel.username ? ` (@${deal.donorChannel.username})` : ''}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-white">Канал #{deal.donorChannelId}</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Calendar className="h-3.5 w-3.5" />
          {deal.scheduledAt ? new Date(deal.scheduledAt).toLocaleString('ru-RU') : 'Дата не указана'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
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
      </div>

      <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
        <span className="font-medium text-white">Цена: {formatMoney(deal.priceAmount, deal.currency)}</span>
        <span>
          Прирост: {formatDelta(deal.effectiveGain)}
          {deal.actualJoins !== null ? ' (инвайт)' : ''}
        </span>
        <span>CPF: {formatMoney(deal.factualCpf, deal.currency)}</span>
      </div>

      {deal.notes && (
        <p className="rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300">{deal.notes}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {deal.inviteLink ? (
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
          Редактировать
        </button>
      </div>

      {editing && (
        <DealEditorForm
          channelId={channelId}
          donorOptions={donorOptions.length > 0 ? donorOptions : (deal.donorChannel ? [deal.donorChannel] : [])}
          allowDonorPick={donorOptions.length > 0}
          initialDeal={deal}
          defaultTargetChannelId={deal.targetChannelId}
          defaultDonorChannelId={deal.donorChannelId}
          defaultPostId={deal.postId}
          defaultPrice={deal.priceAmount}
          defaultScheduledAt={deal.scheduledAt}
          defaultStatus={deal.status}
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
