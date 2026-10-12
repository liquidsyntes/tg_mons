'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, ExternalLink, LineChart, ArrowUpRight, AlertTriangle } from 'lucide-react';

import { ChannelMetrics } from '@/lib/types';
import { checkLowCitationGrowth, runFraudAudit } from '@/lib/fraudDetector';
import { AudienceDemographics } from './AudienceDemographics';
import { SummaryMetric, GrowthMetric } from './SummaryMetric';
import { StatusBadge } from './StatusBadge';
import { RiskBadge } from './RiskBadge';
import { MetricCell, getMetricReason } from './channel/cells/MetricCell';
import { formatNumber } from '@/lib/utils';

interface MyChannelCardProps {
  channel: ChannelMetrics | null;
  onOpenAddModal: () => void;
}

export function MyChannelCard({ channel, onOpenAddModal }: MyChannelCardProps) {
  const [adPrice, setAdPrice] = useState<{ estimatedPricePerPost: number | null, cpm: number, confidence: 'high'|'low' } | null>(null);

  const fraudAudit = (channel && (channel.fraudScore == null || !channel.fraudSignals)) ? runFraudAudit(channel) : null;
  const fraudScore = channel?.fraudScore ?? fraudAudit?.fraudScore ?? 0;
  const fraudSignals = channel?.fraudSignals ?? fraudAudit?.signals ?? [];

  useEffect(() => {
    if (channel?.id && channel?.isMine) {
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
  }, [channel?.id, channel?.isMine]);
  if (!channel) {
    return (
      <div className="bg-surface border border-dashed border-border-subtle rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-accent/10 text-accent font-medium">
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

  const citationIndex = channel.citationIndex;
  const hasCitationIndex = citationIndex !== null && citationIndex !== undefined;
  const citationFraud = hasCitationIndex ? checkLowCitationGrowth(channel) : null;
  const isCitationFraud = citationFraud?.flag ?? false;

  return (
    <div className="bg-gradient-to-br from-surface to-slate-900 border border-accent/25 rounded-2xl p-5 sm:p-6 relative shadow-lg shadow-accent/5 overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute -top-24 -right-24 w-60 h-60 bg-accent/10 rounded-lg blur-3xl pointer-events-none"></div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        {/* Channel Info */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs bg-accent/20 text-accent font-semibold border border-accent/30">
              <Crown className="w-3.5 h-3.5" />
              Мой канал
            </span>
            <StatusBadge
              status={channel.status}
              lastCollectedAt={channel.lastCollectedAt}
              lastError={channel.lastError}
            />
            <RiskBadge score={fraudScore} signals={fraudSignals} />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
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

      {/* Key metrics */}
      <div className="mt-6 pt-5 border-t border-border/80">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70">
          <GrowthMetric label="Динамика · 24ч" delta={channel.delta24h} nominalDays={1} />
          <GrowthMetric label="Динамика · 7д" delta={channel.delta7d} nominalDays={7} />
          <GrowthMetric label="Динамика · 30д" delta={channel.delta30d} nominalDays={30} />
          <SummaryMetric
            label="Посты · 7д"
            value={channel.posts7d}
            detail={`${channel.posts30d} за 30д · ${channel.avgPostsPerDay}/д`}
          />
          <SummaryMetric
            label="Просмотры · 24ч"
            value={<span className="text-sky-400">{channel.avgViews24h !== null ? formatNumber(channel.avgViews24h) : 'н/д'}</span>}
            detail={`${channel.avgViews7d !== null ? formatNumber(channel.avgViews7d) : 'н/д'} за 7д`}
          />
          <SummaryMetric
            label={channel.type === 'group' ? 'CR · 7д' : 'ERR · 24ч'}
            value={channel.type === 'group'
              ? <MetricCell value={channel.cr7d} suffix="%" />
              : <MetricCell value={channel.err24h} suffix="%" {...getMetricReason('err24h', channel)} />}
            detail={channel.type === 'group'
              ? 'От аудитории'
              : <><MetricCell value={channel.err7d} suffix="%" {...getMetricReason('err7d', channel)} /> за 7д</>}
          />
          <SummaryMetric
            label="Цитирование · 30д"
            value={
              <span
                className={`inline-flex items-center gap-1 ${isCitationFraud ? 'text-rose-400' : hasCitationIndex && citationIndex > 0 ? 'text-emerald-400' : 'text-slate-300'}`}
                title={isCitationFraud ? citationFraud?.reason : hasCitationIndex ? `Индекс цитирования: ${citationIndex}` : undefined}
              >
                {hasCitationIndex ? citationIndex : 'н/д'}
                {isCitationFraud && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              </span>
            }
            detail="Взвешенный индекс"
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

      {channel.isMine && <AudienceDemographics channelId={channel.id} />}
    </div>
  );
}
