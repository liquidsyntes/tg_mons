import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { DeltaBadge } from '../DeltaBadge';
import { TrendCell } from './cells/TrendCell';
import { ScoreCell, EpCell } from './cells/ScoreCell';
import { ComparisonCell } from './cells/ComparisonCell';
import { ChannelInfoCell } from './cells/ChannelInfoCell';
import { CitationIndexCell } from './cells/CitationIndexCell';
import { MetricCell, getMetricReason, AdShareCell, RateWindowCell } from './cells/MetricCell';
import { SortField, SortOrder } from './useChannelsData';
import { formatNumber } from '@/lib/utils';

interface DesktopColumnConfig {
  label: string;
  field?: SortField;
  hint?: string;
  className: string;
}

const DESKTOP_TABLE_COLUMNS: readonly DesktopColumnConfig[] = [
  {
    label: 'Channel',
    field: 'title',
    className: 'sticky left-0 z-20 bg-slate-900 py-3.5 px-2 w-[220px] min-w-[220px] text-center hover:text-white transition-colors',
  },
  {
    label: 'Subs',
    field: 'members',
    className: 'py-3.5 px-1 w-[72px] min-w-[72px] hover:text-white transition-colors text-center',
  },
  {
    label: 'Trend',
    hint: 'тренд за 7 дней',
    className: 'py-3.5 px-2 text-center',
  },
  {
    label: 'Δ 24h',
    field: 'delta24h',
    className: 'py-3.5 px-1 hover:text-white transition-colors text-center',
  },
  {
    label: 'Δ 7d',
    field: 'delta7d',
    className: 'py-3.5 px-1 hover:text-white transition-colors text-center',
  },
  {
    label: 'Δ 30d',
    field: 'delta30d',
    className: 'py-3.5 px-1 hover:text-white transition-colors text-center',
  },
  {
    label: 'Posts',
    field: 'posts7d',
    hint: 'Кол-во постов за 7 и 30 дней, среднее кол-во постов в день',
    className: 'py-3.5 px-2 hover:text-white transition-colors text-center',
  },
  {
    label: 'Last',
    field: 'lastFact',
    hint: 'Просмотры последнего поста',
    className: 'py-3.5 px-1 w-[60px] min-w-[60px] hover:text-white transition-colors text-center leading-tight',
  },
  {
    label: 'AVG.V',
    field: 'views',
    hint: 'Средние просмотры: сверху показатель за 24 часа, снизу за 7 дней',
    className: 'py-3.5 px-1 w-16 min-w-16 hover:text-white transition-colors text-center',
  },
  {
    label: 'VR',
    field: 'vr',
    hint: 'VR: просмотры относительно аудитории. Сверху за 24 часа, снизу за 7 дней',
    className: 'py-3.5 px-1 hover:text-white transition-colors text-center leading-tight',
  },
  {
    label: 'ER',
    field: 'er',
    hint: 'ER: просмотры и взаимодействия относительно подписчиков на момент публикации. Сверху за 24 часа, снизу за 7 дней',
    className: 'py-3.5 px-1 hover:text-white transition-colors text-center leading-tight',
  },
  {
    label: 'ERR',
    field: 'err',
    hint: 'ERR: реакции, комментарии и пересылки относительно просмотров. Сверху за 24 часа, снизу за 7 дней; для групп показан CR за 7 дней',
    className: 'py-3.5 px-1 hover:text-white transition-colors text-center leading-tight',
  },
  {
    label: 'Ads',
    field: 'adShare',
    hint: 'Доля рекламных и партнёрских постов за 7 дней',
    className: 'py-3.5 px-1 w-16 min-w-16 hover:text-white transition-colors text-center leading-tight',
  },
  {
    label: '% of',
    field: 'share',
    hint: 'Аудитория канала в процентах от аудитории моего канала; ниже разница темпа роста за 7 дней',
    className: 'py-3.5 px-1 w-16 min-w-16 hover:text-white transition-colors text-center',
  },
  {
    label: 'Score',
    field: 'score',
    className: 'py-3.5 px-2 hover:text-white transition-colors text-center',
  },
  {
    label: 'EP',
    field: 'ep',
    className: 'py-3.5 px-2 hover:text-white transition-colors text-center',
  },
  {
    label: 'CI',
    field: 'citationIndex',
    hint: 'Индекс цитирования: взвешенная сумма упоминаний за 30 дней',
    className: 'py-3.5 px-2 hover:text-white transition-colors text-center leading-tight',
  },
];

interface ChannelsDesktopTableProps {
  channels: ChannelMetrics[];
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  localFavorites: Record<number, boolean>;
  onToggleFavorite: (e: React.MouseEvent, channelId: number, currentFav: boolean) => void;
  availableTags?: string[];
  onTagsChange?: (channelId: number, nextTags: string[]) => void;
}

export function ChannelsDesktopTable({
  channels,
  sortField,
  sortOrder,
  onSort,
  localFavorites,
  onToggleFavorite,
  availableTags = [],
  onTagsChange,
}: ChannelsDesktopTableProps) {
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40 shrink-0" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-accent shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-accent shrink-0" />
    );
  };

  const renderHeaderLabel = (label: string, field?: SortField, hint?: string) => (
    <span className="inline-flex h-5 items-center justify-center gap-1 whitespace-nowrap leading-5 text-center">
      <span title={hint}>{label}</span>
      {field && renderSortIcon(field)}
    </span>
  );

  return (
    <div className="hidden md:block bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto focus-visible:outline-offset-[-2px]" tabIndex={0} role="region" aria-label="Channel metrics — прокрутка таблицы">
        <table className="w-full text-left border-separate border-spacing-0 text-xs [&_th]:whitespace-nowrap [&_th]:align-middle [&_td]:border-b [&_td]:border-border/60">
          <thead>
            <tr className="border-b border-border bg-slate-900/70 text-slate-400 font-medium select-none">
              {DESKTOP_TABLE_COLUMNS.map((column) => {
                const sortFieldName = column.field;
                if (!sortFieldName) {
                  return (
                    <th key={column.label} scope="col" className={column.className}>
                      {renderHeaderLabel(column.label, undefined, column.hint)}
                    </th>
                  );
                }

                return (
                  <th
                    key={column.label}
                    scope="col"
                    aria-sort={sortField === sortFieldName ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={column.className}
                  >
                    <button type="button" onClick={() => onSort(sortFieldName)} className="w-full rounded text-center">
                      {renderHeaderLabel(column.label, sortFieldName, column.hint)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {channels.map((channel) => {
              const isMineRow = channel.isMine;
              return (
                <tr
                  key={channel.id}
                  className={`h-[88px] transition-colors duration-150 ${
                    isMineRow
                      ? 'bg-accent/[0.06] hover:bg-accent/[0.1] border-l-2 border-l-accent'
                      : channel.isActive
                      ? 'hover:bg-slate-800/40'
                      : 'opacity-60 bg-slate-950/40 hover:bg-slate-900/50'
                  }`}
                >
                  <td className={`sticky left-0 z-10 py-3.5 px-2 border-r border-border ${isMineRow ? 'bg-[#102238]' : 'bg-surface'}`}>
                    <ChannelInfoCell 
                      channel={channel} 
                      isFavorite={localFavorites[channel.id] ?? channel.isFavorite} 
                      onToggleFavorite={onToggleFavorite}
                      availableTags={availableTags}
                      onTagsChange={onTagsChange}
                    />
                  </td>
                  <td className="py-3.5 px-1 text-right font-mono font-bold text-white tabular-nums text-xs">
                    {formatNumber(channel.currentMembers)}
                  </td>
                  <td className="py-3.5 px-2 text-center">
                    <TrendCell sparkline={channel.sparkline7d} deltaAbs={channel.delta7d.abs} />
                  </td>
                  <td className="py-3.5 px-1 text-center">
                    <DeltaBadge abs={channel.delta24h.abs} percent={channel.delta24h.percent} coverageDays={channel.delta24h.coverageDays} nominalDays={1} size="sm" />
                  </td>
                  <td className="py-3.5 px-1 text-center">
                    <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} coverageDays={channel.delta7d.coverageDays} nominalDays={7} size="sm" />
                  </td>
                  <td className="py-3.5 px-1 text-center">
                    <DeltaBadge abs={channel.delta30d.abs} percent={channel.delta30d.percent} coverageDays={channel.delta30d.coverageDays} nominalDays={30} size="sm" />
                  </td>
                  <td className="py-3.5 px-2 text-center font-mono tabular-nums">
                    <div className="flex flex-col items-center">
                      <div className="font-semibold text-slate-200 text-sm">
                        {channel.posts7d}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {channel.posts30d}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {channel.avgPostsPerDay}/д
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono font-semibold tabular-nums text-[#6cd733]">
                    <MetricCell 
                      value={channel.lastPostViews} 
                      {...getMetricReason('lastFact', channel)} 
                    />
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    <div className="font-semibold text-sky-400 text-sm">
                      <MetricCell
                        value={channel.avgViews24h}
                        {...getMetricReason('views24h', channel)}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      <MetricCell
                        value={channel.avgViews7d}
                        {...getMetricReason('views7d', channel)}
                      />
                    </div>
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    <RateWindowCell metric="vr" channel={channel} />
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    <RateWindowCell metric="er" channel={channel} />
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    <RateWindowCell metric="err" channel={channel} />
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    <AdShareCell adShare={channel.adShare7d} variant="desktop" />
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    <ComparisonCell 
                      isMine={!!isMineRow} 
                      audienceSharePercent={channel.comparison?.audienceSharePercent} 
                      growthRateDiff7d={channel.comparison?.growthRateDiff7d} 
                    />
                  </td>
                  <td className="py-3.5 px-2 text-center">
                    <ScoreCell score={channel.contentScore} grade={channel.contentGrade} />
                  </td>
                  <td className="py-3.5 px-2 text-center">
                    <EpCell ep={channel.ep} />
                  </td>
                  <td className="py-3.5 px-2 text-center font-mono tabular-nums">
                    <CitationIndexCell channel={channel} variant="desktop" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
