'use client';

import React from 'react';
import { AD_RETENTION_COMPACT_LABELS, AD_RETENTION_PLACEMENT_LABELS } from '@/lib/adReach';
import type { AdRetentionFormat } from '@/lib/types';

const RETENTION_BADGE_CLASSES: Record<AdRetentionFormat, string> = {
  early_delete: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  '24h': 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
  '48h': 'bg-sky-500/15 text-sky-300 border border-sky-500/20',
  retained: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
  active: 'bg-slate-800 text-slate-300',
};

export interface AdRetentionBadgeProps {
  format?: AdRetentionFormat | null;
  deletedAt?: string | null;
  variant?: 'compact' | 'detailed';
}

export function AdRetentionBadge({
  format,
  deletedAt,
  variant = 'compact',
}: AdRetentionBadgeProps) {
  if (!format && !deletedAt) return null;

  if (!format && deletedAt) {
    return (
      <span
        className={
          variant === 'detailed'
            ? 'rounded border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-rose-300'
            : 'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30'
        }
      >
        Пост удалён
      </span>
    );
  }

  if (!format) return null;
  if (variant === 'compact' && format === 'active') return null;

  const label =
    variant === 'detailed'
      ? AD_RETENTION_PLACEMENT_LABELS[format]
      : format === 'active'
      ? AD_RETENTION_PLACEMENT_LABELS.active
      : AD_RETENTION_COMPACT_LABELS[format];

  const sizeClass =
    variant === 'detailed'
      ? 'rounded px-2 py-0.5'
      : 'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider';

  return <span className={`${sizeClass} ${RETENTION_BADGE_CLASSES[format]}`}>{label}</span>;
}
