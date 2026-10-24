'use client';

import Link from 'next/link';
import { ArrowLeft, Crown, ExternalLink, AlertTriangle } from 'lucide-react';
import { ChannelMetrics } from '@/lib/types';
import { SummaryMetric, GrowthMetric } from '@/components/SummaryMetric';
import { StatusBadge } from '@/components/StatusBadge';
import { RiskBadge } from '@/components/RiskBadge';
import { runFraudAudit } from '@/lib/fraudDetector';
import { ExportPdfButton } from '@/components/ExportPdfButton';
import { ExportMenu } from '@/components/ExportMenu';
import { ExportWrappedButton } from '@/components/channel/ExportWrappedButton';
import { formatNumber } from '@/lib/utils';

interface ChannelHeaderProps {
  channel: ChannelMetrics;
  period: '24h' | '7d' | '30d';
  onPeriodChange: (period: '24h' | '7d' | '30d') => void;
}

import { useEffect, useState } from 'react';

export function ChannelHeader({ channel, period, onPeriodChange }: ChannelHeaderProps) {
  const [adPrice, setAdPrice] = useState<{ estimatedPricePerPost: number | null, cpm: number, confidence: 'high'|'low' } | null>(null);

  useEffect(() => {
    if (channel?.id) {
      fetch(`/api/channels/${channel.id}/ad-price`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setAdPrice(data);
          } else {
            setAdPrice({ estimatedPricePerPost: null, cpm: 0, confidence: 'low' });
          }
        })
        .catch(err => {
          console.error('Failed to load ad price', err);
          setAdPrice({ estimatedPricePerPost: null, cpm: 0, confidence: 'low' });
        });
    }
  }, [channel?.id]);

  const fraudAudit = (channel && (channel.fraudScore == null || !channel.fraudSignals)) ? runFraudAudit(channel) : null;
  const fraudScore = channel?.fraudScore ?? fraudAudit?.fraudScore ?? 0;
  const fraudSignals = channel?.fraudSignals ?? fraudAudit?.signals ?? [];
  return (
    <>
      {/* Top Bar */}
      <div className="border-b border-border bg-surface/80 backdrop-blur sticky top-16 z-20">
        <div className="site-shell mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-3 gap-3 flex flex-wrap items-center justify-between">
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
                aria-pressed={period === p}
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 lg:gap-x-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {channel.isMine && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs bg-accent/20 text-accent font-semibold border border-accent/30">
                  <Crown className="w-3.5 h-3.5" />
                  Мой канал
                </span>
              )}
              <StatusBadge
                status={channel.status}
                lastCollectedAt={channel.lastCollectedAt}
                lastError={channel.lastError}
              />
              <StatusBadge
                variant="activity"
                activityStatus={channel.activityStatus}
                lastPostAt={channel.lastPostAt}
              />
              <RiskBadge score={fraudScore} signals={fraudSignals} />
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

          <div className="flex flex-wrap items-center gap-6">
            <div className="text-left lg:text-right border-r border-border/70 pr-6">
              <div className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-sky-400">
                {channel.lastPostViews !== null ? formatNumber(channel.lastPostViews) : '—'}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-widest font-bold mt-1">Last Fact</div>
            </div>
            <div className="text-left lg:text-right">
              <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tabular-nums">
                {formatNumber(channel.currentMembers)}
              </div>
              <div className="text-xs text-slate-400">текущих подписчиков</div>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-stretch gap-2 lg:shrink-0">
            <ExportPdfButton
              reportContainerId="report-content"
              channelTitle={channel.title}
              period={period}
            />
            <ExportMenu items={(['daily', 'snapshots', 'posts'] as const).flatMap(dataset => {
              const label = dataset === 'daily' ? 'Дневные метрики' : dataset === 'snapshots' ? 'Снимки аудитории' : 'Последние посты';
              return (['csv', 'json'] as const).map(format => ({
                label: `${label}, ${format.toUpperCase()}`,
                href: `/api/channels/${channel.id}/export?dataset=${dataset}&format=${format}`,
              }));
            })} />
            <ExportWrappedButton filename={`tgmon-wrapped-${channel.username || channel.id}.png`} />
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-border/70">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70">
            <GrowthMetric label="Динамика · 24ч" delta={channel.delta24h} nominalDays={1} />
            <GrowthMetric label="Динамика · 7д" delta={channel.delta7d} nominalDays={7} />
            <GrowthMetric label="Динамика · 30д" delta={channel.delta30d} nominalDays={30} />
            <SummaryMetric
              label="Посты · 30д"
              value={channel.posts30d}
              detail={`${channel.avgPostsPerDay}/д в среднем`}
            />
            <SummaryMetric
              label="Реклама · пост"
              title={`Ориентировочная алгоритмическая оценка, не фактическая цена${adPrice?.cpm ? `; CPM ${adPrice.cpm} ₴` : ''}`}
              value={adPrice ? (
                adPrice.estimatedPricePerPost ? (
                  <span className={`inline-flex items-center gap-1 ${adPrice.confidence === 'high' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {formatNumber(adPrice.estimatedPricePerPost)} ₴
                    {adPrice.confidence === 'low' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-label="Мало данных для оценки" />}
                  </span>
                ) : 'н/д'
              ) : <span className="animate-pulse">...</span>}
              detail={!adPrice ? 'Загрузка оценки' : !adPrice.estimatedPricePerPost ? 'Недостаточно данных' : adPrice.confidence === 'low' ? 'Низкая уверенность' : 'Оценка за пост'}
            />
          </div>
        </div>
      </div>
    </>
  );
}
