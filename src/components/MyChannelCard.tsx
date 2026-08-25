'use client';

import React from 'react';
import Link from 'next/link';
import { Crown, ExternalLink, LineChart, FileText, Users, ArrowUpRight } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { DeltaBadge } from './DeltaBadge';
import { StatusBadge } from './StatusBadge';
import { formatNumber } from '@/lib/utils';

interface MyChannelCardProps {
  channel: ChannelMetrics | null;
  onOpenAddModal: () => void;
}

export function MyChannelCard({ channel, onOpenAddModal }: MyChannelCardProps) {
  if (!channel) {
    return (
      <div className="bg-surface border border-dashed border-border-subtle rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-accent/10 text-accent font-medium">
            <Crown className="w-3.5 h-3.5" />
            <span>Базовый канал не выбран</span>
          </div>
          <h3 className="text-lg font-semibold text-white">
            Назначьте «Мой канал» для сравнительного анализа
          </h3>
          <p className="text-xs text-slate-400 max-w-xl">
            Выберите «Мой канал» в сравнительной таблице ниже или добавьте новый, чтобы автоматически вычислять долю аудитории конкурентов и опережение по темпам роста.
          </p>
        </div>
        <button
          onClick={onOpenAddModal}
          className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-slate-950 text-xs font-semibold transition-colors"
        >
          Добавить мой канал
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-surface to-slate-900 border border-accent/25 rounded-2xl p-5 sm:p-6 relative shadow-lg shadow-accent/5 overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-24 -right-24 w-60 h-60 bg-accent/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        {/* Channel Info */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs bg-accent/20 text-accent font-semibold border border-accent/30">
              <Crown className="w-3.5 h-3.5" />
              Мой канал
            </span>
            <StatusBadge
              status={channel.status}
              lastCollectedAt={channel.lastCollectedAt}
              lastError={channel.lastError}
            />
          </div>

          <div className="flex items-baseline gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {channel.title}
            </h2>
            {channel.username && (
              <a
                href={`https://t.me/${channel.username}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-400 hover:text-accent font-mono inline-flex items-center gap-1 transition-colors"
              >
                @{channel.username}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tabular-nums tracking-tight font-mono">
              {formatNumber(channel.currentMembers)}
            </span>
            <span className="text-xs text-slate-400 font-medium">подписчиков</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex sm:self-start lg:self-center">
          <Link
            href={`/channel/${channel.id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-border transition-all hover:border-accent/40"
          >
            <LineChart className="w-4 h-4 text-accent" />
            <span>Детальные графики</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </Link>
        </div>
      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-[6px] mt-6 pt-5 border-t border-border/80">
        {/* Delta 24h */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-border/50">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Дин. 24ч</span>
          </div>
          <DeltaBadge abs={channel.delta24h.abs} percent={channel.delta24h.percent} size="md" />
        </div>

        {/* Delta 7d */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-border/50">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Дин. 7д</span>
          </div>
          <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} size="md" />
        </div>

        {/* Delta 30d */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-border/50">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Дин. 30д</span>
          </div>
          <DeltaBadge abs={channel.delta30d.abs} percent={channel.delta30d.percent} size="md" />
        </div>

        {/* Posts Frequency */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-border/50">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Посты 7д/30д</span>
          </div>
          <div className="text-xs font-mono text-white tabular-nums font-semibold flex items-center gap-1.5">
            <span>{channel.posts7d}</span>
            <span className="text-slate-500">/</span>
            <span>{channel.posts30d}</span>
            <span className="text-[10px] text-slate-400 font-normal">
              ({channel.avgPostsPerDay}/д)
            </span>
          </div>
        </div>

        {/* Avg Views */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-border/50">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Просмотры (24ч/7д)</span>
          </div>
          <div className="text-xs font-mono tabular-nums font-semibold flex items-center gap-1.5">
            <span className="text-sky-400">{channel.avgViews24h ? formatNumber(channel.avgViews24h) : '—'}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-300">{channel.avgViews7d ? formatNumber(channel.avgViews7d) : '—'}</span>
          </div>
        </div>

        {/* ERR */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-border/50">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>ERR (24ч/7д)</span>
          </div>
          <div className="text-xs font-mono tabular-nums font-semibold flex items-center gap-1.5">
            <span className="text-slate-200">{channel.err24h !== null ? `${channel.err24h}%` : '—'}</span>
            <span className="text-slate-500">/</span>
            {channel.err7d !== null ? (
              <span className={channel.err7d > 20 ? 'text-emerald-400' : channel.err7d > 10 ? 'text-amber-400' : 'text-slate-300'}>
                {channel.err7d}%
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
