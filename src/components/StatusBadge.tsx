'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { ChannelStatus } from '@/lib/types';

interface StatusBadgeProps {
  status: ChannelStatus;
  lastCollectedAt: string | null;
  lastError: string | null;
  className?: string;
}

export function StatusBadge({
  status,
  lastCollectedAt,
  lastError,
  className,
}: StatusBadgeProps) {
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
