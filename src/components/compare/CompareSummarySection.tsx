import React from 'react';
import { GitCompareArrows } from 'lucide-react';
import type { ChannelMetrics } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

export interface CompareMetricCardProps {
  label: string;
  valueA: number | null;
  valueB: number | null;
  formatFn?: (v: number | null) => string;
  highlight?: boolean;
}

export function CompareMetricCard({
  label,
  valueA,
  valueB,
  formatFn = (v) => (v !== null && v !== undefined ? String(v) : '-'),
  highlight = false,
}: CompareMetricCardProps) {
  const vA = formatFn(valueA);
  const vB = formatFn(valueB);
  const numA = typeof valueA === 'number' ? valueA : 0;
  const numB = typeof valueB === 'number' ? valueB : 0;
  const aWins = numA > numB;
  const bWins = numB > numA;

  return (
    <div className="bg-slate-900/60 rounded-xl border border-border/50 p-3">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 text-center">{label}</div>
      <div className="grid grid-cols-3 items-center gap-2">
        <div
          className={`text-right font-mono font-semibold text-sm ${
            highlight && aWins ? 'text-sky-400' : 'text-slate-200'
          }`}
        >
          {vA}
        </div>
        <div className="text-center text-slate-500 text-xs">vs</div>
        <div
          className={`text-left font-mono font-semibold text-sm ${
            highlight && bWins ? 'text-amber-400' : 'text-slate-200'
          }`}
        >
          {vB}
        </div>
      </div>
    </div>
  );
}

export interface CompareSummarySectionProps {
  channelA: ChannelMetrics;
  channelB: ChannelMetrics;
}

export function CompareSummarySection({ channelA: chA, channelB: chB }: CompareSummarySectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <div className="bg-surface border border-sky-500/30 rounded-2xl p-5 text-center">
          <div className="text-xs text-sky-400 font-semibold uppercase tracking-wider mb-1">Канал A</div>
          <h2 className="text-lg font-extrabold text-white truncate">{chA.title}</h2>
          {chA.username && (
            <a
              href={`https://t.me/${chA.username}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 font-mono"
            >
              @{chA.username}
            </a>
          )}
          <div className="text-2xl font-extrabold text-white font-mono mt-2">{formatNumber(chA.currentMembers)}</div>
          <div className="text-[10px] text-slate-400">подписчиков</div>
        </div>

        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-border flex items-center justify-center">
            <GitCompareArrows className="w-5 h-5 text-accent" />
          </div>
        </div>

        <div className="bg-surface border border-amber-500/30 rounded-2xl p-5 text-center">
          <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">Канал B</div>
          <h2 className="text-lg font-extrabold text-white truncate">{chB.title}</h2>
          {chB.username && (
            <a
              href={`https://t.me/${chB.username}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 font-mono"
            >
              @{chB.username}
            </a>
          )}
          <div className="text-2xl font-extrabold text-white font-mono mt-2">{formatNumber(chB.currentMembers)}</div>
          <div className="text-[10px] text-slate-400">подписчиков</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CompareMetricCard
          label="Δ 24ч"
          valueA={chA.delta24h.abs}
          valueB={chB.delta24h.abs}
          formatFn={(v) => (v !== null ? `${v > 0 ? '+' : ''}${formatNumber(v)}` : '-')}
          highlight
        />
        <CompareMetricCard
          label="Δ 7д"
          valueA={chA.delta7d.abs}
          valueB={chB.delta7d.abs}
          formatFn={(v) => (v !== null ? `${v > 0 ? '+' : ''}${formatNumber(v)}` : '-')}
          highlight
        />
        <CompareMetricCard
          label="Просм. (24ч)"
          valueA={chA.avgViews24h}
          valueB={chB.avgViews24h}
          formatFn={(v) => (v !== null ? formatNumber(v) : '-')}
          highlight
        />
        <CompareMetricCard
          label="ERR (7д)"
          valueA={chA.vr7d}
          valueB={chB.vr7d}
          formatFn={(v) => (v !== null ? `${v}%` : '-')}
          highlight
        />
        <CompareMetricCard
          label="Постов (7д)"
          valueA={chA.posts7d}
          valueB={chB.posts7d}
          formatFn={(v) => String(v)}
          highlight
        />
        <CompareMetricCard
          label="Постов (30д)"
          valueA={chA.posts30d}
          valueB={chB.posts30d}
          formatFn={(v) => String(v)}
          highlight
        />
        <CompareMetricCard
          label="Ср. постов/д"
          valueA={chA.avgPostsPerDay}
          valueB={chB.avgPostsPerDay}
          formatFn={(v) => String(v)}
          highlight
        />
        <CompareMetricCard
          label="Просм. (7д)"
          valueA={chA.avgViews7d}
          valueB={chB.avgViews7d}
          formatFn={(v) => (v !== null ? formatNumber(v) : '-')}
          highlight
        />
      </div>
    </>
  );
}
