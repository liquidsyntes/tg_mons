import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Power } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { DeltaBadge } from '../DeltaBadge';
import { TrendCell } from './cells/TrendCell';
import { ScoreCell, EpCell } from './cells/ScoreCell';
import { ComparisonCell } from './cells/ComparisonCell';
import { ChannelInfoCell } from './cells/ChannelInfoCell';
import { SortField, SortOrder } from './useChannelsData';
import { formatNumber } from '@/lib/utils';

interface ChannelsDesktopTableProps {
  channels: ChannelMetrics[];
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  localFavorites: Record<number, boolean>;
  onToggleFavorite: (e: React.MouseEvent, channelId: number, currentFav: boolean) => void;
  actionLoadingId: number | null;
  onToggleActive: (channelId: number, currentActive: boolean) => void;
}

export function ChannelsDesktopTable({
  channels,
  sortField,
  sortOrder,
  onSort,
  localFavorites,
  onToggleFavorite,
  actionLoadingId,
  onToggleActive,
}: ChannelsDesktopTableProps) {
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40 ml-1 inline" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-accent ml-1 inline" />
    ) : (
      <ArrowDown className="w-3 h-3 text-accent ml-1 inline" />
    );
  };

  return (
    <div className="hidden md:block bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-slate-900/70 text-slate-400 font-medium select-none">
              <th
                onClick={() => onSort('title')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
              >
                Channel {renderSortIcon('title')}
              </th>
              <th
                onClick={() => onSort('members')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-right"
              >
                Subscribers {renderSortIcon('members')}
              </th>
              <th className="py-3.5 px-3 text-center">Trend (7d)</th>
              <th
                onClick={() => onSort('delta24h')}
                className="py-3.5 px-1 cursor-pointer hover:text-white transition-colors text-center"
              >
                Δ 24h {renderSortIcon('delta24h')}
              </th>
              <th
                onClick={() => onSort('delta7d')}
                className="py-3.5 px-1 cursor-pointer hover:text-white transition-colors text-center"
              >
                Δ 7d {renderSortIcon('delta7d')}
              </th>
              <th
                onClick={() => onSort('delta30d')}
                className="py-3.5 px-1 cursor-pointer hover:text-white transition-colors text-center"
              >
                Δ 30d {renderSortIcon('delta30d')}
              </th>
              <th
                onClick={() => onSort('posts7d')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                Publ (7d / 30d) {renderSortIcon('posts7d')}
              </th>
              <th
                onClick={() => onSort('lastFact')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center leading-tight"
              >
                <div className="flex flex-col items-center">
                  <span>Last</span>
                  <span>Fact {renderSortIcon('lastFact')}</span>
                </div>
              </th>
              <th
                onClick={() => onSort('views')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                Views (avg 24h / 7d) {renderSortIcon('views')}
              </th>
              <th
                onClick={() => onSort('err')}
                className="py-3.5 px-3 cursor-pointer hover:text-white transition-colors text-center leading-tight"
              >
                <div>ERR {renderSortIcon('err')}</div>
                <div className="text-[10px] text-slate-500 font-normal mt-0.5">(24h / 7d)</div>
              </th>
              <th
                onClick={() => onSort('share')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                % of mine {renderSortIcon('share')}
              </th>
              <th
                onClick={() => onSort('score')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                Score {renderSortIcon('score')}
              </th>
              <th
                onClick={() => onSort('ep')}
                className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
              >
                EP {renderSortIcon('ep')}
              </th>
              <th className="py-3.5 pl-2 pr-4 text-center">Act.</th>
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
                  <td className="py-3.5 px-4">
                    <ChannelInfoCell 
                      channel={channel} 
                      isFavorite={localFavorites[channel.id] ?? channel.isFavorite} 
                      onToggleFavorite={onToggleFavorite} 
                    />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-white tabular-nums text-sm">
                    {formatNumber(channel.currentMembers)}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <TrendCell sparkline={channel.sparkline7d} deltaAbs={channel.delta7d.abs} />
                  </td>
                  <td className="py-3.5 px-1 text-center">
                    <DeltaBadge abs={channel.delta24h.abs} percent={channel.delta24h.percent} size="sm" />
                  </td>
                  <td className="py-3.5 px-1 text-center">
                    <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} size="sm" />
                  </td>
                  <td className="py-3.5 px-1 text-center">
                    <DeltaBadge abs={channel.delta30d.abs} percent={channel.delta30d.percent} size="sm" />
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                    <span className="font-semibold text-slate-200">{channel.posts7d}</span>
                    <span className="text-slate-500 mx-1">/</span>
                    <span className="text-slate-400">{channel.posts30d}</span>
                    <span className="text-[10px] text-slate-500 block">
                      ({channel.avgPostsPerDay}/д)
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono font-semibold tabular-nums text-[lime]">
                    {channel.lastPostViews !== null ? formatNumber(channel.lastPostViews) : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                    <span className="font-semibold text-sky-400">
                      {channel.avgViews24h ? formatNumber(channel.avgViews24h) : '—'}
                    </span>
                    <span className="text-slate-500 mx-1">/</span>
                    <span className="text-slate-300">
                      {channel.avgViews7d ? formatNumber(channel.avgViews7d) : '—'}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono tabular-nums">
                    <div>
                      <div className="font-semibold text-slate-200 text-sm">
                        {channel.vr24h !== null ? `${channel.vr24h}%` : '—'}
                      </div>
                      <div className={`text-[10px] mt-0.5 ${channel.vr7d !== null ? (channel.vr7d > 20 ? 'text-emerald-400' : channel.vr7d > 10 ? 'text-amber-400' : 'text-slate-400') : 'text-slate-500'}`}>
                        {channel.vr7d !== null ? `${channel.vr7d}%` : '—'}
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                    <ComparisonCell 
                      isMine={!!isMineRow} 
                      audienceSharePercent={channel.comparison?.audienceSharePercent} 
                      growthRateDiff7d={channel.comparison?.growthRateDiff7d} 
                    />
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <ScoreCell score={channel.contentScore} grade={channel.contentGrade} />
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <EpCell ep={channel.ep} />
                  </td>
                  <td className="py-3.5 pl-2 pr-4 text-center">
                    <div className="inline-flex items-center gap-1.5 justify-center">
                      <button
                        onClick={() => onToggleActive(channel.id, channel.isActive)}
                        disabled={actionLoadingId === channel.id}
                        className={`p-1.5 rounded-lg transition-colors ${
                          channel.isActive
                            ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                            : 'text-amber-400 hover:text-emerald-400 hover:bg-slate-800'
                        }`}
                        title={channel.isActive ? 'Поставить на паузу' : 'Возобновить сбор'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
