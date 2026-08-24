'use client';

import Link from 'next/link';
import { ArrowLeft, Crown, ExternalLink } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { ExportPdfButton } from '@/components/ExportPdfButton';
import { ExportWrappedButton } from '@/components/channel/ExportWrappedButton';
import { formatNumber } from '@/lib/utils';

interface ChannelHeaderProps {
  channel: ChannelMetrics;
  period: '24h' | '7d' | '30d';
  onPeriodChange: (period: '24h' | '7d' | '30d') => void;
}

export function ChannelHeader({ channel, period, onPeriodChange }: ChannelHeaderProps) {
  return (
    <>
      {/* Top Bar */}
      <div className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Назад ко всем каналам</span>
          </Link>

          {/* Period selector */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border">
            {(['24h', '7d', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-3 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                  period === p
                    ? 'bg-accent text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p === '24h' ? '24ч' : p === '7d' ? '7 дней' : '30 дней'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Channel Hero */}
      <div className="bg-surface border border-border rounded-2xl p-6 relative overflow-hidden shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {channel.isMine && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-accent/20 text-accent font-semibold border border-accent/30">
                  <Crown className="w-3.5 h-3.5" />
                  Мой канал
                </span>
              )}
              <StatusBadge
                status={channel.status}
                lastCollectedAt={channel.lastCollectedAt}
                lastError={channel.lastError}
              />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {channel.title}
            </h1>

            {channel.username && (
              <a
                href={`https://t.me/${channel.username}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-400 hover:text-accent font-mono inline-flex items-center gap-1 transition-colors"
              >
                @{channel.username}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-left md:text-right">
              <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tabular-nums">
                {formatNumber(channel.currentMembers)}
              </div>
              <div className="text-xs text-slate-400">текущих подписчиков</div>
            </div>
            <div className="flex flex-col gap-2">
              <ExportPdfButton
                reportContainerId="report-content"
                channelTitle={channel.title}
                period={period}
              />
              <ExportWrappedButton filename={`tgmon-wrapped-${channel.username || channel.id}.png`} />
            </div>
          </div>
        </div>

        {/* KPI Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-border/70">
          <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
            <span className="text-[11px] text-slate-400 block mb-1">Δ 24 часа</span>
            <DeltaBadge abs={channel.delta24h.abs} percent={channel.delta24h.percent} size="md" />
          </div>
          <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
            <span className="text-[11px] text-slate-400 block mb-1">Δ 7 дней</span>
            <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} size="md" />
          </div>
          <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
            <span className="text-[11px] text-slate-400 block mb-1">Δ 30 дней</span>
            <DeltaBadge abs={channel.delta30d.abs} percent={channel.delta30d.percent} size="md" />
          </div>
          <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
            <span className="text-[11px] text-slate-400 block mb-1">Публикаций (30д)</span>
            <div className="text-xs font-mono font-semibold text-white">
              {channel.posts30d}{' '}
              <span className="text-slate-400 font-normal">({channel.avgPostsPerDay}/д)</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
