'use client';

import Link from 'next/link';
import type { AdCampaignSummary } from '@/lib/types';
import { formatMoney, numberFormat } from './helpers';

export function SummaryKpiStrip({ summary }: { summary: AdCampaignSummary }) {
  return (
    <div
      className="grid gap-3 rounded-xl border border-border bg-slate-900/50 p-3.5 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Сводка фактических закупок"
    >
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Потрачено всего</p>
        <p className="mt-1 text-base font-semibold text-white">{formatMoney(summary.totalSpent, summary.currency)}</p>
        <p className="text-[11px] text-slate-400">
          Сделок: {summary.dealsCount}{summary.activeDealsCount > 0 ? ` (в работе: ${summary.activeDealsCount})` : ''}
        </p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Привлечено подписчиков</p>
        <p className="mt-1 text-base font-semibold text-emerald-300">
          {summary.totalGainedSubscribers > 0 ? `+${numberFormat.format(summary.totalGainedSubscribers)}` : numberFormat.format(summary.totalGainedSubscribers)}
        </p>
        <p className="text-[11px] text-slate-400">По инвайтам или оценке</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Средний CPF</p>
        <p className="mt-1 text-base font-semibold text-white">{formatMoney(summary.avgCpf, summary.currency)}</p>
        <p className="text-[11px] text-slate-400">Цена за подписчика</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Средний CPM</p>
        <p className="mt-1 text-base font-semibold text-white">{formatMoney(summary.avgCpm, summary.currency)}</p>
        <p className="text-[11px] text-slate-400">За 1000 просмотров</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Лучший донор</p>
        {summary.bestDonor ? (
          <>
            <Link
              href={`/channel/${summary.bestDonor.channelId}`}
              className="mt-1 block truncate text-sm font-semibold text-accent hover:underline"
            >
              {summary.bestDonor.title}
            </Link>
            <p className="text-[11px] text-slate-400">
              CPF: {formatMoney(summary.bestDonor.cpf, summary.currency)} (+{numberFormat.format(summary.bestDonor.gainedSubscribers)})
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-400">н/д</p>
        )}
      </div>
    </div>
  );
}
