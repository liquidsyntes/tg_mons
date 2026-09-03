import React from 'react';
import Link from 'next/link';
import { Crown, Star, ExternalLink } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { DeltaBadge } from '../DeltaBadge';
import { StatusBadge } from '../StatusBadge';
import { TrendCell } from './cells/TrendCell';
import { formatNumber } from '@/lib/utils';

interface ChannelsMobileListProps {
  channels: ChannelMetrics[];
  localFavorites: Record<number, boolean>;
  onToggleFavorite: (e: React.MouseEvent, channelId: number, currentFav: boolean) => void;
}

export function ChannelsMobileList({
  channels,
  localFavorites,
  onToggleFavorite,
}: ChannelsMobileListProps) {
  return (
    <div className="block md:hidden space-y-3">
      {channels.map((channel) => {
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
                      onClick={(e) => onToggleFavorite(e, channel.id, localFavorites[channel.id] ?? channel.isFavorite)}
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
                  <div className="ml-auto mt-1 flex justify-end">
                    <TrendCell sparkline={channel.sparkline7d} deltaAbs={channel.delta7d.abs} />
                  </div>
                )}
              </div>
            </div>

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
  );
}
