'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Crown,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Power,
  Sparkles,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Layers,
  Download,
  Star,
  GitCompareArrows
} from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { DeltaBadge } from './DeltaBadge';
import { StatusBadge } from './StatusBadge';
import { formatNumber, formatPercent } from '@/lib/utils';
import { LineChart, Line, YAxis } from 'recharts';

type SortField = 'title' | 'members' | 'delta24h' | 'delta7d' | 'delta30d' | 'posts7d' | 'share' | 'views' | 'err' | 'score' | 'ep' | 'lastFact';
type SortOrder = 'asc' | 'desc';

interface ChannelsTableProps {
  channels: ChannelMetrics[];
  myChannel: ChannelMetrics | null;
  onRefresh: () => Promise<void>;
}

export function ChannelsTable({ channels, myChannel, onRefresh }: ChannelsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('members');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };



  const handleToggleActive = async (channelId: number, currentActive: boolean) => {
    setActionLoadingId(channelId);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) await onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoadingId(null);
    }
  };



  const handleExportCSV = () => {
    const headers = [
      'Название',
      'Username',
      'Подписчики',
      'Δ 24ч (чел)',
      'Δ 24ч (%)',
      'Δ 7д (чел)',
      'Δ 7д (%)',
      'Δ 30д (чел)',
      'Δ 30д (%)',
      'Постов (7д)',
      'Постов (30д)',
      'Просм. (avg 7д)',
      'ERR (7д, %)',
      'Моя доля (%)'
    ];

    const rows = processedChannels.map(c => [
      `"${c.title.replace(/"/g, '""')}"`,
      c.username ? `@${c.username}` : '',
      c.currentMembers ?? '',
      c.delta24h.abs ?? '',
      c.delta24h.percent ?? '',
      c.delta7d.abs ?? '',
      c.delta7d.percent ?? '',
      c.delta30d.abs ?? '',
      c.delta30d.percent ?? '',
      c.posts7d,
      c.posts30d,
      c.avgViews7d ?? '',
      c.vr7d ?? '',
      c.comparison?.audienceSharePercent ?? ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tg-monitor-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter and Sort
  const [localFavorites, setLocalFavorites] = useState<Record<number, boolean>>({});

  const toggleFavorite = async (e: React.MouseEvent, channelId: number, currentFav: boolean) => {
    e.stopPropagation();
    e.preventDefault();
    const newFav = !currentFav;
    setLocalFavorites(prev => ({ ...prev, [channelId]: newFav }));
    
    try {
      const res = await fetch(`/api/channels/${channelId}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: newFav })
      });
      if (!res.ok) throw new Error('Failed to update favorite');
    } catch (err) {
      console.error(err);
      // revert on error
      setLocalFavorites(prev => ({ ...prev, [channelId]: currentFav }));
    }
  };

  const processedChannels = useMemo(() => {
    let list = [...channels];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.username && c.username.toLowerCase().includes(q))
      );
    }

    // Extract My Channel so it stays pinned at the top
    const myCh = list.find((c) => c.isMine);
    const competitors = list.filter((c) => !c.isMine);

    // Sort competitors
    competitors.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'title':
          return sortOrder === 'asc'
            ? a.title.localeCompare(b.title)
            : b.title.localeCompare(a.title);
        case 'members':
          valA = a.currentMembers ?? -1;
          valB = b.currentMembers ?? -1;
          break;
        case 'delta24h':
          valA = a.delta24h.percent ?? (a.delta24h.abs !== null ? a.delta24h.abs : -999999);
          valB = b.delta24h.percent ?? (b.delta24h.abs !== null ? b.delta24h.abs : -999999);
          break;
        case 'delta7d':
          valA = a.delta7d.percent ?? (a.delta7d.abs !== null ? a.delta7d.abs : -999999);
          valB = b.delta7d.percent ?? (b.delta7d.abs !== null ? b.delta7d.abs : -999999);
          break;
        case 'delta30d':
          valA = a.delta30d.percent ?? (a.delta30d.abs !== null ? a.delta30d.abs : -999999);
          valB = b.delta30d.percent ?? (b.delta30d.abs !== null ? b.delta30d.abs : -999999);
          break;
        case 'posts7d':
          valA = a.posts7d;
          valB = b.posts7d;
          break;
        case 'share':
          valA = a.comparison?.audienceSharePercent ?? -1;
          valB = b.comparison?.audienceSharePercent ?? -1;
          break;
        case 'views':
          valA = a.avgViews24h ?? a.avgViews7d ?? -1;
          valB = b.avgViews24h ?? b.avgViews7d ?? -1;
          break;
        case 'err':
          valA = a.vr24h ?? a.vr7d ?? -1;
          valB = b.vr24h ?? b.vr7d ?? -1;
          break;
        case 'score':
          valA = a.contentScore ?? -1;
          valB = b.contentScore ?? -1;
          break;
        case 'ep':
          valA = a.ep ?? -1;
          valB = b.ep ?? -1;
          break;
        case 'lastFact':
          valA = a.lastPostViews ?? -1;
          valB = b.lastPostViews ?? -1;
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pinned My Channel is always index 0
    return myCh ? [myCh, ...competitors] : competitors;
  }, [channels, searchQuery, sortField, sortOrder]);

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
    <div className="space-y-[6px]">
      {/* Combined Toolbar Frame */}
      <div className="bg-slate-800/40 border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white tracking-tight">
            Сравнительный мониторинг каналов
          </h3>
          <Link
            href="/compare"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 border border-border hover:border-accent hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            Сравнить каналы
          </Link>
        </div>

        {/* Search row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию или @username..."
              className="w-full bg-slate-900/90 border border-border/80 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>Всего: <strong className="text-white font-mono">{channels.length}</strong></span>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600"
              title="Выгрузить данные в CSV"
            >
              <Download className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline">Экспорт</span>
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-slate-900/70 text-slate-400 font-medium select-none">
                <th
                  onClick={() => handleSort('title')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors"
                >
                  Channel {renderSortIcon('title')}
                </th>
                <th
                  onClick={() => handleSort('members')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-right"
                >
                  Subscribers {renderSortIcon('members')}
                </th>
                <th className="py-3.5 px-3 text-center">
                  Trend (7d)
                </th>
                <th
                  onClick={() => handleSort('delta24h')}
                  className="py-3.5 px-1 cursor-pointer hover:text-white transition-colors text-center"
                >
                  Δ 24h {renderSortIcon('delta24h')}
                </th>
                <th
                  onClick={() => handleSort('delta7d')}
                  className="py-3.5 px-1 cursor-pointer hover:text-white transition-colors text-center"
                >
                  Δ 7d {renderSortIcon('delta7d')}
                </th>
                <th
                  onClick={() => handleSort('delta30d')}
                  className="py-3.5 px-1 cursor-pointer hover:text-white transition-colors text-center"
                >
                  Δ 30d {renderSortIcon('delta30d')}
                </th>
                <th
                  onClick={() => handleSort('posts7d')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
                >
                  Publ (7d / 30d) {renderSortIcon('posts7d')}
                </th>
                <th
                  onClick={() => handleSort('lastFact')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center leading-tight"
                >
                  <div className="flex flex-col items-center">
                    <span>Last</span>
                    <span>Fact {renderSortIcon('lastFact')}</span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('views')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
                >
                  Views (avg 24h / 7d) {renderSortIcon('views')}
                </th>
                <th
                  onClick={() => handleSort('err')}
                  className="py-3.5 px-3 cursor-pointer hover:text-white transition-colors text-center"
                >
                  ERR {renderSortIcon('err')}
                </th>
                <th
                  onClick={() => handleSort('share')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
                >
                  % of mine {renderSortIcon('share')}
                </th>
                <th
                  onClick={() => handleSort('score')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
                >
                  Score {renderSortIcon('score')}
                </th>
                <th
                  onClick={() => handleSort('ep')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition-colors text-center"
                >
                  EP {renderSortIcon('ep')}
                </th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {processedChannels.map((channel) => {
                const isMineRow = channel.isMine;
                return (
                  <tr
                    key={channel.id}
                    className={`transition-colors duration-150 ${
                      isMineRow
                        ? 'bg-accent/[0.06] hover:bg-accent/[0.1] border-l-2 border-l-accent'
                        : channel.isActive
                        ? 'hover:bg-slate-800/40'
                        : 'opacity-60 bg-slate-950/40 hover:bg-slate-900/50'
                    }`}
                  >
                    {/* Title & Username */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        {isMineRow ? (
                          <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent flex-shrink-0">
                            <Crown className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-border flex items-center justify-center text-slate-400 flex-shrink-0 font-mono text-xs">
                            {channel.type === 'group' ? 'Г' : 'К'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {!isMineRow && (
                              <button
                                onClick={(e) => toggleFavorite(e, channel.id, localFavorites[channel.id] ?? channel.isFavorite)}
                                className={`flex-shrink-0 transition-colors ${
                                  (localFavorites[channel.id] ?? channel.isFavorite) 
                                    ? 'text-amber-400 hover:text-amber-500' 
                                    : 'text-slate-600 hover:text-amber-400/70'
                                }`}
                                title="В избранное"
                              >
                                <Star className={`w-3.5 h-3.5 ${(localFavorites[channel.id] ?? channel.isFavorite) ? 'fill-amber-400' : ''}`} />
                              </button>
                            )}
                            <Link
                              href={`/channel/${channel.id}`}
                              className="font-semibold text-slate-100 hover:text-accent transition-colors truncate max-w-[180px] inline-block"
                              title={channel.title}
                            >
                              {channel.title}
                            </Link>
                            {isMineRow && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-semibold">
                                Мой
                              </span>
                            )}
                          </div>
                          {channel.username && (
                            <a
                              href={`https://t.me/${channel.username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-slate-400 hover:text-accent font-mono inline-flex items-center gap-1 transition-colors"
                            >
                              @{channel.username}
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Members Count */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white tabular-nums text-sm">
                      {formatNumber(channel.currentMembers)}
                    </td>

                    {/* Trend 7d Sparkline */}
                    <td className="py-3.5 px-3 text-center">
                      {channel.sparkline7d && channel.sparkline7d.length > 1 ? (
                        <div className="w-[80px] h-[30px] mx-auto opacity-80 hover:opacity-100 transition-opacity">
                          <LineChart width={80} height={30} data={channel.sparkline7d.map(v => ({ value: v }))}>
                            <YAxis domain={['dataMin', 'dataMax']} hide />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke={
                                channel.delta7d.abs && channel.delta7d.abs > 0 ? '#34d399' :
                                channel.delta7d.abs && channel.delta7d.abs < 0 ? '#fb7185' : '#94a3b8'
                              }
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-[10px]">н/д</span>
                      )}
                    </td>

                    {/* Delta 24h */}
                    <td className="py-3.5 px-1 text-center">
                      <DeltaBadge
                        abs={channel.delta24h.abs}
                        percent={channel.delta24h.percent}
                        size="sm"
                      />
                    </td>

                    {/* Delta 7d */}
                    <td className="py-3.5 px-1 text-center">
                      <DeltaBadge
                        abs={channel.delta7d.abs}
                        percent={channel.delta7d.percent}
                        size="sm"
                      />
                    </td>

                    {/* Delta 30d */}
                    <td className="py-3.5 px-1 text-center">
                      <DeltaBadge
                        abs={channel.delta30d.abs}
                        percent={channel.delta30d.percent}
                        size="sm"
                      />
                    </td>

                    {/* Posts Counts */}
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                      <span className="font-semibold text-slate-200">{channel.posts7d}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-slate-400">{channel.posts30d}</span>
                      <span className="text-[10px] text-slate-500 block">
                        ({channel.avgPostsPerDay}/д)
                      </span>
                    </td>

                    {/* Last Fact */}
                    <td className="py-3.5 px-4 text-center font-mono font-semibold tabular-nums text-[lime]">
                      {channel.lastPostViews !== null ? formatNumber(channel.lastPostViews) : '—'}
                    </td>

                    {/* Views */}
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                      <span className="font-semibold text-sky-400">
                        {channel.avgViews24h ? formatNumber(channel.avgViews24h) : '—'}
                      </span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-slate-300">
                        {channel.avgViews7d ? formatNumber(channel.avgViews7d) : '—'}
                      </span>
                    </td>
                    
                    {/* ERR */}
                    <td className="py-3.5 px-3 text-center font-mono tabular-nums">
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className="text-xs text-slate-400">
                          24ч: {channel.vr24h !== null ? <span className="text-slate-200">{channel.vr24h}%</span> : '—'}
                        </span>
                        {channel.vr7d !== null ? (
                          <span className={`font-semibold ${channel.vr7d > 20 ? 'text-emerald-400' : channel.vr7d > 10 ? 'text-amber-400' : 'text-slate-300'}`}>
                            7д: {channel.vr7d}%
                          </span>
                        ) : (
                          <span className="text-slate-500">7д: —</span>
                        )}
                      </div>
                    </td>

                    {/* Comparison with My Channel */}
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums">
                      {isMineRow ? (
                        <span className="text-accent font-semibold text-xs">100% (база)</span>
                      ) : channel.comparison?.audienceSharePercent !== null &&
                        channel.comparison?.audienceSharePercent !== undefined ? (
                        <div>
                          <span className="font-semibold text-slate-200">
                            {channel.comparison.audienceSharePercent}%
                          </span>
                          {channel.comparison.growthRateDiff7d !== null && (
                            <span
                              className={`text-[10px] block ${
                                channel.comparison.growthRateDiff7d > 0
                                  ? 'text-emerald-400'
                                  : channel.comparison.growthRateDiff7d < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {channel.comparison.growthRateDiff7d > 0 ? '+' : ''}
                              {channel.comparison.growthRateDiff7d}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">н/д</span>
                      )}
                    </td>

                    {/* Score */}
                    <td className="py-3.5 px-4 text-center">
                      {channel.contentScore !== undefined && channel.contentGrade ? (
                        <div
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                            channel.contentScore >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                            channel.contentScore >= 70 ? 'bg-amber-500/10 text-amber-400' :
                            channel.contentScore >= 60 ? 'bg-orange-500/10 text-orange-400' :
                            'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {channel.contentGrade} <span className="opacity-70 ml-1 font-normal">{channel.contentScore}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-mono text-xs">н/д</span>
                      )}
                    </td>

                    {/* EP */}
                    <td className="py-3.5 px-4 text-center">
                      {channel.ep !== undefined ? (
                        <div
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                            channel.ep >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                            channel.ep >= 60 ? 'bg-amber-500/10 text-amber-400' :
                            channel.ep >= 40 ? 'bg-orange-500/10 text-orange-400' :
                            'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {channel.ep.toFixed(1)}
                        </div>
                      ) : (
                        <span className="text-slate-500 font-mono text-xs">н/д</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">
                      <StatusBadge
                        status={channel.status}
                        lastCollectedAt={channel.lastCollectedAt}
                        lastError={channel.lastError}
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => handleToggleActive(channel.id, channel.isActive)}
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

      {/* Mobile Cards View */}
      <div className="block md:hidden space-y-3">
        {processedChannels.map((channel) => {
          const isMineRow = channel.isMine;
          return (
            <div
              key={channel.id}
              className={`p-4 rounded-2xl border ${
                isMineRow
                  ? 'bg-accent/[0.07] border-accent/40 shadow-sm'
                  : 'bg-surface border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    {isMineRow && <Crown className="w-3.5 h-3.5 text-accent" />}
                    {!isMineRow && (
                      <button
                        onClick={(e) => toggleFavorite(e, channel.id, localFavorites[channel.id] ?? channel.isFavorite)}
                        className={`flex-shrink-0 transition-colors p-0.5 ${
                          (localFavorites[channel.id] ?? channel.isFavorite) 
                            ? 'text-amber-400 hover:text-amber-500' 
                            : 'text-slate-600 hover:text-amber-400/70'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${(localFavorites[channel.id] ?? channel.isFavorite) ? 'fill-amber-400' : ''}`} />
                      </button>
                    )}
                    <Link
                      href={`/channel/${channel.id}`}
                      className="font-bold text-white text-sm hover:text-accent truncate max-w-[200px]"
                    >
                      {channel.title}
                    </Link>
                  </div>
                  {channel.username && (
                    <a
                      href={`https://t.me/${channel.username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-400 font-mono inline-flex items-center gap-1 mt-0.5"
                    >
                      @{channel.username}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>
                  )}
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-4">
                    <div className="text-right">
                      <div className="text-base font-extrabold font-mono text-[lime] tabular-nums">
                        {channel.lastPostViews !== null ? formatNumber(channel.lastPostViews) : '—'}
                      </div>
                      <div className="text-[10px] text-slate-400">Last Fact</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-extrabold font-mono text-white tabular-nums">
                        {formatNumber(channel.currentMembers)}
                      </div>
                      <div className="text-[10px] text-slate-400">подписчиков</div>
                    </div>
                  </div>
                  {channel.sparkline7d && channel.sparkline7d.length > 1 && (
                    <div className="w-[60px] h-[20px] ml-auto mt-1 opacity-70">
                      <LineChart width={60} height={20} data={channel.sparkline7d.map(v => ({ value: v }))}>
                        <YAxis domain={['dataMin', 'dataMax']} hide />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={
                            channel.delta7d.abs && channel.delta7d.abs > 0 ? '#34d399' :
                            channel.delta7d.abs && channel.delta7d.abs < 0 ? '#fb7185' : '#94a3b8'
                          }
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </div>
                  )}
                </div>
              </div>

              {/* Deltas & Posts & ERR */}
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border/60 text-center">
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-400 mb-1">Δ 7д</div>
                  <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} size="sm" />
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-400 mb-1">Посты (7д)</div>
                  <div className="text-xs font-mono font-semibold text-white">
                    {channel.posts7d}
                  </div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-400 mb-1">Просм.</div>
                  <div className="text-xs font-mono font-semibold text-white">
                    {channel.avgViews7d ? formatNumber(channel.avgViews7d) : '-'}
                  </div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-400 mb-1">ERR</div>
                  <div className="text-xs font-mono font-semibold text-white">
                    {channel.vr7d !== null ? `${channel.vr7d}%` : '-'}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/60 text-xs">
                <StatusBadge
                  status={channel.status}
                  lastCollectedAt={channel.lastCollectedAt}
                  lastError={channel.lastError}
                />
                <div className="flex items-center gap-2">
                  <Link
                    href={`/channel/${channel.id}`}
                    className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 text-[11px]"
                  >
                    График
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
