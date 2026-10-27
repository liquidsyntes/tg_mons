import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { checkLowCitationGrowth } from '@/lib/fraudDetector';
import { DeltaBadge } from '../DeltaBadge';
import { TrendCell } from './cells/TrendCell';
import { ScoreCell, EpCell } from './cells/ScoreCell';
import { ComparisonCell } from './cells/ComparisonCell';
import { ChannelInfoCell } from './cells/ChannelInfoCell';
import { MetricCell, getMetricReason } from './cells/MetricCell';
import { SortField, SortOrder } from './useChannelsData';
import { formatNumber } from '@/lib/utils';

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
              <th
                scope="col"
                aria-sort={sortField === 'title' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="sticky left-0 z-20 bg-slate-900 py-3.5 px-2 w-[220px] min-w-[220px] text-center hover:text-white transition-colors"
              >
                <button type="button" onClick={() => onSort('title')} className="w-full rounded text-center">
                  {renderHeaderLabel('Channel', 'title')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'members' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 w-[72px] min-w-[72px] hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('members')} className="w-full rounded text-center">
                  {renderHeaderLabel('Subs', 'members')}
                </button>
              </th>
              <th scope="col" className="py-3.5 px-2 text-center">{renderHeaderLabel('Trend', undefined, 'тренд за 7 дней')}</th>
              <th
                scope="col"
                aria-sort={sortField === 'delta24h' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('delta24h')} className="w-full rounded text-center">
                  {renderHeaderLabel('Δ 24h', 'delta24h')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'delta7d' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('delta7d')} className="w-full rounded text-center">
                  {renderHeaderLabel('Δ 7d', 'delta7d')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'delta30d' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('delta30d')} className="w-full rounded text-center">
                  {renderHeaderLabel('Δ 30d', 'delta30d')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'posts7d' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-2 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('posts7d')} className="w-full rounded text-center">
                  {renderHeaderLabel('Posts', 'posts7d', 'Кол-во постов за 7 и 30 дней, среднее кол-во постов в день')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'lastFact' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 w-[60px] min-w-[60px] hover:text-white transition-colors text-center leading-tight"
              >
                <button type="button" onClick={() => onSort('lastFact')} className="w-full rounded text-center">
                  {renderHeaderLabel('Last', 'lastFact', 'Просмотры последнего поста')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'views' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 w-16 min-w-16 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('views')} className="w-full rounded text-center">
                  {renderHeaderLabel('AVG.V', 'views', 'Средние просмотры: сверху показатель за 24 часа, снизу за 7 дней')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'vr' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 hover:text-white transition-colors text-center leading-tight"
              >
                <button type="button" onClick={() => onSort('vr')} className="w-full rounded text-center">
                  {renderHeaderLabel('VR', 'vr', 'VR: просмотры относительно аудитории. Сверху за 24 часа, снизу за 7 дней')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'er' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 hover:text-white transition-colors text-center leading-tight"
              >
                <button type="button" onClick={() => onSort('er')} className="w-full rounded text-center">
                  {renderHeaderLabel('ER', 'er', 'ER: просмотры и взаимодействия относительно подписчиков на момент публикации. Сверху за 24 часа, снизу за 7 дней')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'err' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 hover:text-white transition-colors text-center leading-tight"
              >
                <button type="button" onClick={() => onSort('err')} className="w-full rounded text-center">
                  {renderHeaderLabel('ERR', 'err', 'ERR: реакции, комментарии и пересылки относительно просмотров. Сверху за 24 часа, снизу за 7 дней; для групп показан CR за 7 дней')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'adShare' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 w-16 min-w-16 hover:text-white transition-colors text-center leading-tight"
              >
                <button type="button" onClick={() => onSort('adShare')} className="w-full rounded text-center">
                  {renderHeaderLabel('Ads', 'adShare', 'Доля рекламных и партнёрских постов за 7 дней')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'share' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-1 w-16 min-w-16 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('share')} className="w-full rounded text-center">
                  {renderHeaderLabel('% of', 'share', 'Аудитория канала в процентах от аудитории моего канала; ниже разница темпа роста за 7 дней')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'score' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-2 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('score')} className="w-full rounded text-center">
                  {renderHeaderLabel('Score', 'score')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'ep' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-2 hover:text-white transition-colors text-center"
              >
                <button type="button" onClick={() => onSort('ep')} className="w-full rounded text-center">
                  {renderHeaderLabel('EP', 'ep')}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={sortField === 'citationIndex' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-3.5 px-2 hover:text-white transition-colors text-center leading-tight"
              >
                <button type="button" onClick={() => onSort('citationIndex')} className="w-full rounded text-center">
                  {renderHeaderLabel('CI', 'citationIndex', 'Индекс цитирования: взвешенная сумма упоминаний за 30 дней')}
                </button>
              </th>
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
                    <div>
                      <div className="font-semibold text-slate-200 text-xs">
                        <MetricCell value={channel.vr24h} suffix="%" {...getMetricReason('vr24h', channel)} />
                      </div>
                      <div className={`text-[11px] mt-0.5 ${channel.vr7d !== null ? (channel.vr7d > 20 ? 'text-emerald-400' : channel.vr7d > 10 ? 'text-amber-400' : 'text-slate-400') : ''}`}>
                        <MetricCell value={channel.vr7d} suffix="%" {...getMetricReason('vr7d', channel)} />
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    <div>
                      <div className="font-semibold text-slate-200 text-xs">
                        <MetricCell value={channel.er24h} suffix="%" {...getMetricReason('er24h', channel)} />
                      </div>
                      <div className={`text-[11px] mt-0.5 ${channel.er7d !== null ? (channel.er7d > 2 ? 'text-emerald-400' : channel.er7d > 1 ? 'text-amber-400' : 'text-slate-400') : ''}`}>
                        <MetricCell value={channel.er7d} suffix="%" {...getMetricReason('er7d', channel)} />
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    {channel.type === 'group' ? (
                      <div title="Comments Rate: ответы / подписчики" className="flex flex-col items-center justify-center">
                        <div className="font-semibold text-slate-200 text-xs">
                          <MetricCell value={channel.cr7d} suffix="% CR" />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold text-slate-200 text-xs">
                          <MetricCell value={channel.err24h} suffix="%" {...getMetricReason('err24h', channel)} />
                        </div>
                        <div className={`text-[11px] mt-0.5 ${channel.err7d !== null ? (channel.err7d > 2 ? 'text-emerald-400' : channel.err7d > 1 ? 'text-amber-400' : 'text-slate-400') : ''}`}>
                          <MetricCell value={channel.err7d} suffix="%" {...getMetricReason('err7d', channel)} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-1 text-center font-mono tabular-nums">
                    {channel.adShare7d ? (
                      <div className={`font-semibold text-[13px] ${
                        channel.adShare7d.level === 'high' ? 'text-rose-400' :
                        channel.adShare7d.level === 'medium' ? 'text-amber-400' :
                        channel.adShare7d.level === 'low' ? 'text-emerald-400' :
                        'text-slate-400'
                      }`}>
                        {channel.adShare7d.level === 'none' ? '—' : `${channel.adShare7d.percent}%`}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-[13px]">—</div>
                    )}
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
                    {(() => {
                      const ci = channel.citationIndex;
                      const hasCi = ci !== null && ci !== undefined;
                      const fraud = hasCi ? checkLowCitationGrowth(channel) : null;
                      const isFraud = fraud?.flag ?? false;
                      return (
                        <span
                          className={
                            isFraud
                              ? "text-rose-400 font-bold text-xs inline-flex items-center gap-1 justify-center"
                              : hasCi && ci > 0
                              ? "text-emerald-400 font-semibold text-xs"
                              : "text-slate-400 text-xs"
                          }
                          title={
                            isFraud
                              ? fraud?.reason
                              : hasCi
                              ? `Индекс цитирования: ${ci}`
                              : undefined
                          }
                        >
                          {hasCi ? ci : '—'}
                          {isFraud && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                        </span>
                      );
                    })()}
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
