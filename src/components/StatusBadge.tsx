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

  if (status === 'stale') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20',
          className
        )}
        title={`Последнее обновление: ${formatRelativeTime(lastCollectedAt)}`}
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Обновлен {formatRelativeTime(lastCollectedAt)}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        className
      )}
      title={`Сбор активен. Последний: ${formatRelativeTime(lastCollectedAt)}`}
    >
      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{formatRelativeTime(lastCollectedAt)}</span>
    </div>
  );
}
