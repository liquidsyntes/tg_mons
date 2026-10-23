'use client';

import React from 'react';
import { AlertCircle, Clock, VolumeX, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChannelStatus, ChannelSilenceStatus } from '@/lib/types';
import { calculateSilenceStatus } from '@/lib/metrics/silence';

export interface StatusBadgeProps {
  status?: ChannelStatus | ChannelSilenceStatus;
  lastCollectedAt?: string | null;
  lastError?: string | null;
  activityStatus?: ChannelSilenceStatus | null;
  lastPostAt?: string | Date | null;
  variant?: 'collection' | 'activity';
  showText?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  lastCollectedAt = null,
  lastError = null,
  activityStatus,
  lastPostAt,
  variant,
  showText,
  className,
}: StatusBadgeProps) {
  // Determine if this badge is operating in activity status mode
  const isActivityMode =
    variant === 'activity' ||
    activityStatus !== undefined ||
    status === 'активен' ||
    status === 'замедлился' ||
    status === 'молчит' ||
    (variant !== 'collection' && lastPostAt !== undefined && !lastCollectedAt);

  if (isActivityMode) {
    let resolvedStatus: ChannelSilenceStatus = 'молчит';

    if (activityStatus) {
      resolvedStatus = activityStatus;
    } else if (status === 'активен' || status === 'замедлился' || status === 'молчит') {
      resolvedStatus = status;
    } else if (lastPostAt !== undefined) {
      resolvedStatus = calculateSilenceStatus(lastPostAt);
    }

    let colorClass = '';
    let bgClass = '';
    let borderClass = '';
    let label = '';
    let title = '';
    let Icon = Radio;

    if (resolvedStatus === 'активен') {
      colorClass = 'text-emerald-400';
      bgClass = 'bg-emerald-500/10';
      borderClass = 'border-emerald-500/20';
      label = 'Активен';
      title = 'Канал активен (последняя публикация менее 3 дней назад)';
      Icon = Radio;
    } else if (resolvedStatus === 'замедлился') {
      colorClass = 'text-amber-400';
      bgClass = 'bg-amber-500/10';
      borderClass = 'border-amber-500/20';
      label = 'Замедлился';
      title = 'Канал замедлился (нет публикаций от 3 до 7 дней)';
      Icon = Clock;
    } else {
      colorClass = 'text-rose-400';
      bgClass = 'bg-rose-500/10';
      borderClass = 'border-rose-500/20';
      label = 'Молчит';
      title = 'Канал молчит (нет публикаций более 7 дней)';
      Icon = VolumeX;
    }

    const shouldShowText = showText ?? true;

    if (shouldShowText) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold border flex-shrink-0 transition-colors',
            bgClass,
            colorClass,
            borderClass,
            className
          )}
          title={title}
          data-testid="status-badge-activity"
        >
          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{label}</span>
        </span>
      );
    }

    return (
      <div
        className={cn(
          'inline-flex items-center justify-center w-7 h-7 rounded-md border flex-shrink-0 transition-colors',
          bgClass,
          colorClass,
          borderClass,
          className
        )}
        title={title}
        data-testid="status-badge-activity"
      >
        <Icon className="w-4 h-4" />
      </div>
    );
  }

  // Collection status badge (original mode)
  if (status === 'error') {
    return (
      <div
        className={cn(
          'inline-flex items-center justify-center w-7 h-7 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 flex-shrink-0',
          className
        )}
        title={lastError || 'Ошибка при сборе данных'}
      >
        <AlertCircle className="w-4 h-4" />
      </div>
    );
  }

  let diffMinutes = 999;

  if (lastCollectedAt) {
    const date = new Date(lastCollectedAt);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    diffMinutes = Math.floor(diffMs / 60000);
  }

  let colorClass = '';
  let bgClass = '';
  let borderClass = '';

  if (diffMinutes <= 30) {
    colorClass = 'text-emerald-400';
    bgClass = 'bg-emerald-500/10';
    borderClass = 'border-emerald-500/20';
  } else if (diffMinutes <= 45) {
    colorClass = 'text-amber-400';
    bgClass = 'bg-amber-500/10';
    borderClass = 'border-amber-500/20';
  } else if (diffMinutes <= 55) {
    colorClass = 'text-rose-400';
    bgClass = 'bg-rose-500/10';
    borderClass = 'border-rose-500/20';
  } else {
    colorClass = 'text-violet-400';
    bgClass = 'bg-violet-500/10';
    borderClass = 'border-violet-500/20';
  }

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded-md border flex-shrink-0',
        bgClass,
        colorClass,
        borderClass,
        className
      )}
      title={`Последний сбор: ${lastCollectedAt ? new Date(lastCollectedAt).toLocaleString('ru-RU') : 'Никогда'}`}
    >
      <Clock className="w-4 h-4" />
    </div>
  );
}
