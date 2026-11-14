'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { AdRetentionFormat, AdRetentionSummary } from '@/lib/types';

export interface AdReachDataPoint {
  hoursAfterPost: number;
  views: number;
}

export interface AdReachChartProps {
  data: AdReachDataPoint[];
  retentionSummary?: AdRetentionSummary | null;
  className?: string;
}

const RETENTION_CARD_STYLES: Record<Exclude<AdRetentionFormat, 'active'>, string> = {
  '24h': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  '48h': 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  retained: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  early_delete: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

export function AdReachChart({ data, retentionSummary, className = '' }: AdReachChartProps) {
  const hasChart = Array.isArray(data) && data.length > 0;
  const hasRetention = Boolean(retentionSummary && retentionSummary.totalAds > 0);

  if (!hasChart && !hasRetention) {
    return (
      <div className={`p-4 bg-surface rounded-xl shadow-sm border border-border flex items-center justify-center text-sm text-slate-500 h-[250px] ${className}`}>
        Нет данных об охвате
      </div>
    );
  }

  const chartData = (data ?? []).map(d => ({
    time: `${d.hoursAfterPost}ч`,
    views: d.views,
  }));

  return (
    <div className={`p-4 bg-surface rounded-xl shadow-sm border border-border space-y-4 ${className}`}>
      {hasChart && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Динамика охвата</h3>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis
                  dataKey="time"
                  axisLine={{ stroke: '#1e293b' }}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  dy={10}
                />
                <YAxis
                  axisLine={{ stroke: '#1e293b' }}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  dx={-10}
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => val > 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '3px', border: '1px solid #1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' }}
                  itemStyle={{ color: '#f8fafc' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#38bdf8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasRetention && retentionSummary && (
        <div
          className={hasChart ? 'border-t border-border pt-3.5 space-y-2.5' : 'space-y-2.5'}
          aria-label="Форматы удержания рекламы"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Форматы удержания рекламы
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span>
                Оценено постов: {retentionSummary.evaluatedAds} из {retentionSummary.totalAds}
                {retentionSummary.activeAds > 0 ? ` (в открутке: ${retentionSummary.activeAds})` : ''}
              </span>
              {retentionSummary.hasEarlyDeletions && (
                <span className="rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                  Зафиксированы ранние удаления (&lt;24ч)
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {retentionSummary.buckets.map((bucket) => {
              const cardStyle =
                bucket.format !== 'active' && bucket.count > 0
                  ? RETENTION_CARD_STYLES[bucket.format]
                  : 'border-border bg-slate-900/50 text-slate-300';
              return (
                <div
                  key={bucket.format}
                  className={`rounded-xl border px-3 py-2 ${cardStyle}`}
                >
                  <p className="text-[11px] opacity-85">{bucket.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {bucket.sharePercent}%{' '}
                    <span className="text-xs font-normal text-slate-400">({bucket.count})</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
