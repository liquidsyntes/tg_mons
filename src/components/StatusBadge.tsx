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
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 max-w-[200px] truncate',
          className
        )}
        title={lastError || 'Ошибка при сборе данных'}
      >
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{lastError || 'Ошибка сбора'}</span>
      </div>
    );
  }

  let text = 'Никогда';
  let diffMinutes = 999;
  
  if (lastCollectedAt) {
    const date = new Date(lastCollectedAt);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) text = 'сейчас';
    else if (diffMinutes < 60) text = `${diffMinutes} мин`;
    else if (diffHours < 24) text = `${diffHours} ч`;
    else if (diffDays === 1) text = 'вчера';
    else if (diffDays < 30) text = `${diffDays} д`;
    else text = date.toLocaleDateString('ru-RU');
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
        'inline-flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded text-[11px] border leading-tight min-w-[50px] font-mono',
        bgClass,
        colorClass,
        borderClass,
        className
      )}
      title={`Последний сбор: ${lastCollectedAt ? new Date(lastCollectedAt).toLocaleString('ru-RU') : 'Никогда'}`}
    >
      <Clock className="w-3.5 h-3.5" />
      <span className="font-semibold">{text}</span>
    </div>
  );
}
