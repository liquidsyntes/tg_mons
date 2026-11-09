import React from 'react';
import { ChannelMetrics } from '@/lib/types';

export interface MetricCellProps {
  value: number | null;
  suffix?: string;
  reason?: string | null;
  reasonTitle?: string | null;
  colorClass?: string;
  formattedValue?: string | number;
}

export function MetricCell({ value, suffix = '', reason, reasonTitle, colorClass, formattedValue }: MetricCellProps) {
  if (value !== null && value !== undefined) {
    const displayValue = formattedValue !== undefined ? formattedValue : value;
    return (
      <span className={colorClass}>
        {displayValue}{suffix}
      </span>
    );
  }

  if (reason === 'не постил 7д' || reason === 'нет постов за 24ч') {
    const isWeek = reason === 'не постил 7д';
    const label = reasonTitle || (isWeek ? 'Нет постов за последние 7 дней' : 'Нет постов за последние 24 часа');
    return (
      <span
        role="img"
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center align-middle"
        title={label}
      >
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isWeek ? 'bg-pink-400' : 'bg-sky-400'}`} />
      </span>
    );
  }

  if (reason) {
    return (
      <span 
        className="text-[11px] text-slate-400 font-normal leading-tight inline-block align-middle text-center"
        title={reasonTitle || reason}
      >
        {reason}
      </span>
    );
  }

  return <span className="text-slate-500">—</span>;
}

export function getMetricReason(
  metricName: 'er24h' | 'err24h' | 'er7d' | 'err7d' | 'vr24h' | 'vr7d' | 'views24h' | 'views7d' | 'lastFact',
  channel: ChannelMetrics
): { reason: string; reasonTitle: string } | null {
  if (channel.status === 'error' || channel.status === 'stale') {
    return {
      reason: 'сбор не выполнен',
      reasonTitle: channel.lastError ? `Сбор не выполнен: ${channel.lastError}` : 'Сбор не выполнен'
    };
  }

  if (metricName.includes('24h') && channel.posts24h === 0) {
    return { reason: 'нет постов за 24ч', reasonTitle: 'Нет постов за последние 24 часа' };
  }

  if (channel.posts7d === 0) {
    return { reason: 'не постил 7д', reasonTitle: 'Нет постов за последние 7 дней' };
  }

  if ((metricName.includes('views') || metricName.includes('vr') || metricName === 'lastFact') && channel.type === 'group') {
    return { reason: 'группа', reasonTitle: 'Группа без просмотров' };
  }

  if (metricName.includes('er') || metricName.includes('err')) {
    return { reason: 'реакции скрыты', reasonTitle: 'Реакции скрыты или отключены' };
  }

  return null;
}

export type RateMetricKind = 'vr' | 'er' | 'err';

export function getRateMetricColorClass(
  metric: RateMetricKind,
  value: number | null | undefined
): string {
  if (value === null || value === undefined) {
    return '';
  }
  const highThreshold = metric === 'vr' ? 20 : 2;
  const mediumThreshold = metric === 'vr' ? 10 : 1;
  if (value > highThreshold) return 'text-emerald-400';
  if (value > mediumThreshold) return 'text-amber-400';
  return 'text-slate-400';
}

export function getAdShareColorClass(
  adShare: ChannelMetrics['adShare7d'],
  fallbackColorClass = 'text-slate-400'
): string {
  if (!adShare) return fallbackColorClass;
  if (adShare.level === 'high') return 'text-rose-400';
  if (adShare.level === 'medium') return 'text-amber-400';
  if (adShare.level === 'low') return 'text-emerald-400';
  return fallbackColorClass;
}

export interface AdShareCellProps {
  adShare: ChannelMetrics['adShare7d'];
  variant?: 'desktop' | 'mobile';
}

export function AdShareCell({ adShare, variant = 'desktop' }: AdShareCellProps) {
  if (variant === 'mobile') {
    return (
      <div className={`text-[11px] font-mono font-semibold leading-tight ${getAdShareColorClass(adShare, 'text-white')}`}>
        {adShare && adShare.level !== 'none' ? `${adShare.percent}%` : '-'}
      </div>
    );
  }

  if (!adShare) {
    return <div className="text-slate-500 text-[13px]">-</div>;
  }

  return (
    <div className={`font-semibold text-[13px] ${getAdShareColorClass(adShare, 'text-slate-400')}`}>
      {adShare.level === 'none' ? '-' : `${adShare.percent}%`}
    </div>
  );
}

export interface RateWindowCellProps {
  metric: RateMetricKind;
  channel: ChannelMetrics;
}

export function RateWindowCell({ metric, channel }: RateWindowCellProps) {
  if (metric === 'err' && channel.type === 'group') {
    return (
      <div title="Comments Rate: ответы / подписчики" className="flex flex-col items-center justify-center">
        <div className="font-semibold text-slate-200 text-xs">
          <MetricCell value={channel.cr7d} suffix="% CR" />
        </div>
      </div>
    );
  }

  const value24h = metric === 'vr' ? channel.vr24h : metric === 'er' ? channel.er24h : channel.err24h;
  const value7d = metric === 'vr' ? channel.vr7d : metric === 'er' ? channel.er7d : channel.err7d;
  const reason24h = metric === 'vr' ? 'vr24h' : metric === 'er' ? 'er24h' : 'err24h';
  const reason7d = metric === 'vr' ? 'vr7d' : metric === 'er' ? 'er7d' : 'err7d';

  return (
    <div>
      <div className="font-semibold text-slate-200 text-xs">
        <MetricCell value={value24h} suffix="%" {...getMetricReason(reason24h, channel)} />
      </div>
      <div className={`text-[11px] mt-0.5 ${getRateMetricColorClass(metric, value7d)}`}>
        <MetricCell value={value7d} suffix="%" {...getMetricReason(reason7d, channel)} />
      </div>
    </div>
  );
}
