import React from 'react';
import Link from 'next/link';
import { Crown, Star, ExternalLink } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';

interface ChannelInfoCellProps {
  channel: ChannelMetrics;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent, channelId: number, currentFav: boolean) => void;
}

export function getAvatarStyles(channel: ChannelMetrics) {
  if (channel.status === 'error') {
    return 'bg-rose-500/30 text-rose-400 border-rose-500/40';
  }
  if (!channel.isActive) {
    return 'bg-slate-500/30 text-slate-400 border-slate-500/40';
  }

  let diffMinutes = 999;
  if (channel.lastCollectedAt) {
    const date = new Date(channel.lastCollectedAt);
    const diffMs = Math.max(0, new Date().getTime() - date.getTime());
    diffMinutes = Math.floor(diffMs / 60000);
  }

  if (diffMinutes <= 30) return 'bg-emerald-500/30 text-emerald-400 border-emerald-500/40';
  if (diffMinutes <= 45) return 'bg-amber-500/30 text-amber-400 border-amber-500/40';
  if (diffMinutes <= 55) return 'bg-orange-500/30 text-orange-400 border-orange-500/40';
  return 'bg-violet-500/30 text-violet-400 border-violet-500/40';
}

export function ChannelInfoCell({ channel, isFavorite, onToggleFavorite }: ChannelInfoCellProps) {
  const isMineRow = channel.isMine;
  const lastCollectedStr = channel.lastCollectedAt ? new Date(channel.lastCollectedAt).toLocaleString('ru-RU') : 'Никогда';

  return (
    <div className="flex items-center gap-2.5">
      {isMineRow ? (
        <div 
          className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${getAvatarStyles(channel)}`}
          title={`Последний сбор: ${lastCollectedStr}`}
        >
          <Crown className="w-3.5 h-3.5" />
        </div>
      ) : (
        <div 
          className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 font-mono text-xs ${getAvatarStyles(channel)}`}
          title={`Последний сбор: ${lastCollectedStr}`}
        >
          {channel.type === 'group' ? 'Г' : 'К'}
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {!isMineRow && (
            <button
              onClick={(e) => onToggleFavorite(e, channel.id, isFavorite)}
              className={`flex-shrink-0 transition-colors ${
                isFavorite 
                  ? 'text-amber-400 hover:text-amber-500' 
                  : 'text-slate-600 hover:text-amber-400/70'
              }`}
              title="В избранное"
            >
              <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400' : ''}`} />
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
          {!channel.isActive && (channel.consecutiveErrors || 0) > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-semibold" title={`Отключен из-за ${channel.consecutiveErrors} ошибок подряд`}>
              авто-off
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
  );
}
