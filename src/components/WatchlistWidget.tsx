import React from 'react';
import { ChannelMetrics } from '@/lib/types';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { cn, formatNumber } from '@/lib/utils';
import { DeltaBadge } from './DeltaBadge';
import { StatusBadge } from './StatusBadge';
import { MetricCell, getMetricReason } from './channel/cells/MetricCell';

interface WatchlistWidgetProps {
  channels: ChannelMetrics[];
}

export function WatchlistWidget({ channels }: WatchlistWidgetProps) {
  const favorites = channels.filter(c => c.isFavorite && !c.isMine);

  if (favorites.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
        <h3 className="text-base font-bold text-white tracking-tight">Избранное</h3>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[6px]">
        {favorites.map(channel => {
          const isSilent =
            channel.activityStatus === 'молчит' ||
            (channel.activityStatus === undefined &&
              channel.posts7d === 0 &&
              (channel.posts24h === 0 || channel.posts24h === undefined));

          return (
            <Link 
              key={channel.id} 
              href={`/channel/${channel.id}`}
              className={cn(
                'block bg-slate-900 border rounded-xl p-4 transition-colors group relative',
                isSilent
                  ? 'border-rose-500/40 hover:border-rose-500/70 bg-rose-950/10 shadow-sm shadow-rose-950/20'
                  : 'border-border hover:border-accent/50'
              )}
            >
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="min-w-0 flex-1">
                  <h4
                    className={cn(
                      'text-sm font-bold truncate transition-colors',
                      isSilent
                        ? 'text-rose-200 group-hover:text-rose-300'
                        : 'text-slate-100 group-hover:text-accent'
                    )}
                  >
                    {channel.title}
                  </h4>
                  {channel.username && (
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      @{channel.username}
                    </div>
                  )}
                </div>

                {isSilent && (
                  <StatusBadge
                    variant="activity"
                    activityStatus="молчит"
                    className="px-2 py-0.5 text-[11px]"
                  />
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                      Подписчики
                    </div>
                    <div className="text-lg font-bold text-white font-mono leading-none">
                      {formatNumber(channel.currentMembers)}
                    </div>
                  </div>
                  <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} coverageDays={channel.delta7d.coverageDays} nominalDays={7} size="sm" />
                </div>
                
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold uppercase mb-0.5">
                      Просмотры 7д
                    </div>
                    <div className="text-xs font-mono text-slate-300">
                      {channel.avgViews7d !== null ? formatNumber(channel.avgViews7d) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold uppercase mb-0.5">
                      {channel.type === 'group' ? 'CR 7д' : 'ERR 7д'}
                    </div>
                    <div className="text-xs font-mono text-slate-300">
                      {channel.type === 'group'
                        ? <MetricCell value={channel.cr7d} suffix="%" />
                        : <MetricCell value={channel.err7d} suffix="%" {...getMetricReason('err7d', channel)} />}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
