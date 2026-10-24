'use client';

import React from 'react';
import Link from 'next/link';
import { Search, GitCompareArrows } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { serializeChannelsCsv, serializeChannelsJson, formatChannelTelegramUrl as formatTelegramUrl } from '@/lib/exportData';
import { ExportMenu } from './ExportMenu';
import { useChannelsData } from './channel/useChannelsData';
import { ChannelsDesktopTable } from './channel/ChannelsDesktopTable';
import { ChannelsMobileList } from './channel/ChannelsMobileList';

interface ChannelsTableProps {
  channels: ChannelMetrics[];
}

export function formatChannelTelegramUrl(username: string | null | undefined): string {
  return formatTelegramUrl(username);
}

export function buildChannelsExportCsv(channels: ChannelMetrics[]): string {
  return serializeChannelsCsv(channels, false);
}

export function ChannelsTable({ channels }: ChannelsTableProps) {
  const {
    searchQuery,
    setSearchQuery,
    sortField,
    sortOrder,
    handleSort,
    localFavorites,
    toggleFavorite,
    processedChannels
  } = useChannelsData(channels);

  const handleExport = (format: 'csv' | 'json') => {
    const content = format === 'csv' ? serializeChannelsCsv(processedChannels) : serializeChannelsJson(processedChannels);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tg-monitor-export-${new Date().toISOString().split('T')[0]}.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="space-y-[6px]">
      <div className="bg-slate-800/40 border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-white tracking-tight">
            Сравнительный мониторинг каналов
          </h3>
          <Link
            href="/compare"
            className="inline-flex min-h-9 items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 border border-border hover:border-accent hover:bg-slate-700 text-slate-200 transition-colors"
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
            <ExportMenu items={[
              { label: 'Таблица каналов, CSV', onClick: () => handleExport('csv') },
              { label: 'Таблица каналов, JSON', onClick: () => handleExport('json') },
            ]} />
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
      />

      <ChannelsMobileList
        channels={processedChannels}
        localFavorites={localFavorites}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}
