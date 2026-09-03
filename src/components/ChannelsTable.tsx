'use client';

import React from 'react';
import Link from 'next/link';
import { Search, GitCompareArrows, Download } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { useChannelsData } from './channel/useChannelsData';
import { ChannelsDesktopTable } from './channel/ChannelsDesktopTable';
import { ChannelsMobileList } from './channel/ChannelsMobileList';

interface ChannelsTableProps {
  channels: ChannelMetrics[];
  myChannel: ChannelMetrics | null;
  onRefresh: () => Promise<void>;
}

export function ChannelsTable({ channels, myChannel, onRefresh }: ChannelsTableProps) {
  const {
    searchQuery,
    setSearchQuery,
    sortField,
    sortOrder,
    handleSort,
    localFavorites,
    toggleFavorite,
    actionLoadingId,
    setActionLoadingId,
    processedChannels
  } = useChannelsData(channels);

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

  return (
    <div className="space-y-[6px]">
      <div className="bg-slate-800/40 border border-border rounded-2xl p-4 sm:p-5 space-y-4">
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

      <ChannelsDesktopTable
        channels={processedChannels}
        sortField={sortField}
        sortOrder={sortOrder}
        onSort={handleSort}
        localFavorites={localFavorites}
        onToggleFavorite={toggleFavorite}
        actionLoadingId={actionLoadingId}
        onToggleActive={handleToggleActive}
      />

      <ChannelsMobileList
        channels={processedChannels}
        localFavorites={localFavorites}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}
