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

  if (reason) {
    return (
      <span 
        className="text-[10px] text-slate-500 font-normal leading-tight inline-block align-middle text-center" 
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
