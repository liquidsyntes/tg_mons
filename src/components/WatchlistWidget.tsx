import React from 'react';
import { ChannelMetrics } from '@/lib/types';
import { Star, Eye, Users } from 'lucide-react';
import Link from 'next/link';
import { formatNumber, formatPercent } from '@/lib/utils';
import { DeltaBadge } from './DeltaBadge';

interface WatchlistWidgetProps {
  channels: ChannelMetrics[];
}

export function WatchlistWidget({ channels }: WatchlistWidgetProps) {
  const favorites = channels.filter(c => c.isFavorite && !c.isMine);

  if (favorites.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
        <h3 className="text-base font-bold text-white tracking-tight">Избранное</h3>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {favorites.map(channel => (
          <Link 
            key={channel.id} 
            href={`/channel/${channel.id}`}
            className="block bg-surface border border-border hover:border-amber-500/50 rounded-2xl p-4 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 truncate">
                  {channel.title}
                </h4>
                {channel.username && (
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    @{channel.username}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
                    Подписчики
                  </div>
                  <div className="text-lg font-bold text-white font-mono leading-none">
                    {formatNumber(channel.currentMembers)}
                  </div>
                </div>
                <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} size="sm" />
              </div>
              
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <div>
                  <div className="text-[9px] text-slate-500 font-semibold uppercase mb-0.5">
                    Просмотры 7д
                  </div>
                  <div className="text-xs font-mono text-slate-300">
                    {channel.avgViews7d ? formatNumber(channel.avgViews7d) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 font-semibold uppercase mb-0.5">
                    ERR 7д
                  </div>
                  <div className="text-xs font-mono text-slate-300">
                    {channel.err7d !== null ? `${channel.err7d}%` : '—'}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
