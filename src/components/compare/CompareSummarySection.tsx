import React from 'react';
import Link from 'next/link';
import { Award, Folder, GitCompareArrows, Megaphone, Network } from 'lucide-react';
import type {
  CompareKpiRow,
  CompareParticipantStats,
  MultiChannelComparisonResult,
  TagBenchmarkProfileResult,
} from '@/lib/compare';
import type { ChannelMetrics } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { getParticipantStyle } from './compareTheme';

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

function formatKpiCellValue(row: CompareKpiRow, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (row.unit === 'count') return formatNumber(Math.round(value));
  if (row.unit === 'percent') {
    const sign = (row.key === 'growth7d' || row.key === 'growth30d') && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }
  if (row.unit === 'rate') return value.toFixed(1);
  if (row.unit === 'score') return `${Math.round(value)}/100`;
  return String(value);
}

export interface CompareSummarySectionProps {
  channelA?: ChannelMetrics;
  channelB?: ChannelMetrics;
  participants?: ReadonlyArray<CompareParticipantStats>;
  comparison?: MultiChannelComparisonResult | null;
  benchmarkProfile?: TagBenchmarkProfileResult | null;
}

export function CompareSummarySection({
  channelA,
  channelB,
  participants: explicitParticipants,
  comparison,
  benchmarkProfile,
}: CompareSummarySectionProps) {
  const participants: ReadonlyArray<CompareParticipantStats> = explicitParticipants && explicitParticipants.length > 0
    ? explicitParticipants
    : channelA && channelB
      ? [
          { channel: channelA, membersHistory: [], postsDistribution: [] },
          { channel: channelB, membersHistory: [], postsDistribution: [] },
        ]
      : [];

  if (participants.length === 0) return null;

  const isLegacyPair = participants.length === 2 && !participants.some((p) => p.channel.isBenchmark);
  const chA = participants[0]?.channel;
  const chB = participants[1]?.channel;
  const participantTitleById = new Map(participants.map((p) => [p.channel.id, p.channel.title]));

  const gridColsClass =
    participants.length === 2
      ? 'sm:grid-cols-2'
      : participants.length === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  const kpiRows = comparison?.kpiRows ?? [];
  const sharedAdvertisers = comparison?.sharedAdvertisers ?? [];
  const citationMatrix = comparison?.citationMatrix ?? [];

  return (
    <>
      {!!comparison?.coverageWarnings?.length && <details className="text-xs text-amber-300 border border-amber-500/30 rounded p-3"><summary>Ограничения сравнения</summary>{comparison.coverageWarnings.map(w => <p key={w}>{w}</p>)}</details>}
      <div className={`grid grid-cols-1 ${gridColsClass} gap-3`}>
        {participants.map((participant, index) => {
          const ch = participant.channel;
          const style = getParticipantStyle(index, ch.isBenchmark);

          return (
            <div
              key={ch.id}
              className={`bg-surface border ${style.borderClass} rounded-2xl p-4 sm:p-5 text-center space-y-1`}
            >
              <div className={`text-xs ${style.textClass} font-semibold uppercase tracking-wider inline-flex items-center gap-1`}>
                {ch.isBenchmark && <Folder className="w-3.5 h-3.5" />}
                <span>{style.slotLabel}</span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-white truncate">{ch.title}</h2>
              {ch.isBenchmark ? (
                <div className="text-xs text-slate-400">
                  Каналов в папке: {ch.cohortSize ?? benchmarkProfile?.cohortSize ?? 0}
                </div>
              ) : ch.username ? (
                <a
                  href={`https://t.me/${ch.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-400 font-mono block"
                >
                  @{ch.username}
                </a>
              ) : (
                <div className="text-xs text-slate-500 font-mono">приватный канал</div>
              )}
              <div className="text-2xl font-extrabold text-white font-mono pt-1">
                {formatNumber(ch.currentMembers)}
              </div>
              <div className="text-[10px] text-slate-400">
                {ch.isBenchmark ? 'подписчиков (среднее по папке)' : 'подписчиков'}
              </div>
            </div>
          );
        })}
      </div>

      {isLegacyPair && chA && chB && (
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
      )}

      {kpiRows.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-accent" />
              Сводная таблица KPI
            </h3>
            <span className="text-xs text-slate-400">
              {participants.length} участн. · подсветка лидера по каждой метрике
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-slate-400">
                  <th className="py-2 pr-4 font-semibold">Метрика</th>
                  {participants.map((p, idx) => {
                    const style = getParticipantStyle(idx, p.channel.isBenchmark);
                    return (
                      <th key={p.channel.id} className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${style.dotBg}`} />
                          <span className="text-slate-200">{p.channel.title}</span>
                        </span>
                      </th>
                    );
                  })}
                  {benchmarkProfile && (
                    <th className="py-2 pl-3 font-semibold text-right whitespace-nowrap text-pink-300">
                      Медиана папки
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {kpiRows.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-900/40">
                    <td className="py-2.5 pr-4 text-slate-300 font-medium">
                      <span>{row.label}</span>
                      {row.neutral && (
                        <span className="ml-2 text-[10px] text-slate-500">(нейтрально)</span>
                      )}
                    </td>
                    {participants.map((p) => {
                      const val = row.values[p.channel.id] ?? null;
                      const isLeader = !row.neutral && row.leaderChannelId === p.channel.id;
                      return (
                        <td
                          key={p.channel.id}
                          className={`py-2.5 px-3 text-right font-mono whitespace-nowrap ${
                            isLeader
                              ? 'bg-emerald-500/10 text-emerald-300 font-bold'
                              : 'text-slate-200'
                          }`}
                        >
                          <span>{formatKpiCellValue(row, val)}</span>
                          {isLeader && (
                            <span className="ml-1.5 inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                              Лидер
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {benchmarkProfile && (
                      <td className="py-2.5 pl-3 text-right font-mono text-pink-200/90 whitespace-nowrap">
                        {formatKpiCellValue(row, benchmarkProfile.metrics[row.key]?.median ?? null)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {comparison && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-accent" />
                Общие рекламодатели
              </h3>
              <span className="text-xs text-slate-400">за 30 дней</span>
            </div>

            {sharedAdvertisers.length > 0 ? (
              <div className="space-y-2">
                {sharedAdvertisers.slice(0, 10).map((adv) => (
                  <div
                    key={adv.username}
                    className="rounded-xl border border-border/60 bg-slate-900/50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <Link
                        href={`/posts?onlyAds=true&advertiser=${encodeURIComponent(adv.username)}`}
                        className="font-mono font-semibold text-accent hover:underline"
                      >
                        @{adv.username}
                      </Link>
                      <div className="text-[11px] text-slate-400">
                        {adv.channelIds
                          .map((cid) => `${participantTitleById.get(cid) ?? `#${cid}`}: ${adv.placementsByChannel[cid] ?? 0}`)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
                        {adv.channelsCount} кан.
                      </span>
                      <span className="rounded bg-orange-500/15 px-2 py-0.5 text-orange-300">
                        {adv.totalPlacements} разм.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Общие рекламодатели среди выбранных каналов за последние 30 дней не обнаружены.
              </p>
            )}
          </div>

          <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Network className="w-4 h-4 text-accent" />
                Матрица взаимных упоминаний
              </h3>
              <span className="text-xs text-slate-400">за 30 дней</span>
            </div>

            {citationMatrix.length >= 2 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-slate-400">
                      <th className="py-1.5 pr-3 text-left font-medium">Откуда \ Куда</th>
                      {citationMatrix.map((col) => (
                        <th key={col.sourceChannelId} className="py-1.5 px-2 text-center font-medium max-w-[110px] truncate">
                          {col.sourceTitle}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {citationMatrix.map((row) => (
                      <tr key={row.sourceChannelId}>
                        <td className="py-2 pr-3 text-slate-300 font-medium max-w-[140px] truncate">
                          {row.sourceTitle}
                        </td>
                        {citationMatrix.map((col) => {
                          const isSelf = row.sourceChannelId === col.sourceChannelId;
                          const count = row.countsByTargetId[col.sourceChannelId] ?? 0;
                          return (
                            <td
                              key={col.sourceChannelId}
                              className={`py-2 px-2 text-center font-mono ${
                                isSelf
                                  ? 'text-slate-600'
                                  : count > 0
                                    ? 'text-sky-300 font-bold'
                                    : 'text-slate-500'
                              }`}
                            >
                              {isSelf ? '-' : count}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <GitCompareArrows className="w-4 h-4 text-slate-600" />
                <span>Для матрицы взаимных упоминаний выберите минимум 2 реальных канала.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
