import React from 'react';
import { ChannelMetrics } from '@/lib/types';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { formatNumber } from '@/lib/utils';
import { DeltaBadge } from './DeltaBadge';

interface TopGainersLosersProps {
  channels: ChannelMetrics[];
}

export function TopGainersLosers({ channels }: TopGainersLosersProps) {
  // Exclude "My Channel" from competitive gainers/losers
  const competitors = channels.filter((c) => !c.isMine);

  const gainers = [...competitors]
    .filter((c) => (c.delta7d.abs ?? 0) > 0)
    .sort((a, b) => (b.delta7d.abs ?? 0) - (a.delta7d.abs ?? 0))
    .slice(0, 3);

  const losers = [...competitors]
    .filter((c) => (c.delta7d.abs ?? 0) < 0)
    .sort((a, b) => (a.delta7d.abs ?? 0) - (b.delta7d.abs ?? 0))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Top Gainers */}
      <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Лидеры роста (7 дней)
        </h3>
        <div className="flex flex-col gap-3">
          {gainers.length > 0 ? (
            gainers.map((channel) => (
              <Link key={channel.id} href={`/channel/${channel.id}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 group">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-accent transition-colors truncate max-w-[200px]">
                    {channel.title}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatNumber(channel.currentMembers || 0)}
                  </span>
                </div>
                <DeltaBadge 
                  abs={channel.delta7d.abs} 
                  percent={channel.delta7d.percent} 
                />
              </Link>
            ))
          ) : (
            <div className="text-xs text-slate-500 py-4 text-center">Нет растущих каналов</div>
          )}
        </div>
      </div>

      {/* Top Losers */}
      <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-rose-400" />
          Слив аудитории (7 дней)
        </h3>
        <div className="flex flex-col gap-3">
          {losers.length > 0 ? (
            losers.map((channel) => (
              <Link key={channel.id} href={`/channel/${channel.id}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 group">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-accent transition-colors truncate max-w-[200px]">
                    {channel.title}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatNumber(channel.currentMembers || 0)}
                  </span>
                </div>
                <DeltaBadge 
                  abs={channel.delta7d.abs} 
                  percent={channel.delta7d.percent} 
                />
              </Link>
            ))
          ) : (
            <div className="text-xs text-slate-500 py-4 text-center">Нет падающих каналов</div>
          )}
        </div>
      </div>
    </div>
  );
}
