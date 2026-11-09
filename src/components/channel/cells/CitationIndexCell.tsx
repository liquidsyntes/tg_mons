import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChannelMetrics } from '@/lib/types';
import { checkLowCitationGrowth } from '@/lib/fraudDetector';

export interface CitationIndexEvaluation {
  ci: number | null;
  hasCi: boolean;
  isFraud: boolean;
  title: string | undefined;
}

export function evaluateCitationIndex(channel: ChannelMetrics): CitationIndexEvaluation {
  const ci = channel.citationIndex ?? null;
  const hasCi = channel.citationIndex !== null && channel.citationIndex !== undefined;
  const fraud = hasCi ? checkLowCitationGrowth(channel) : null;
  const isFraud = fraud?.flag ?? false;
  const title = isFraud
    ? fraud?.reason
    : hasCi
    ? `Индекс цитирования: ${ci}`
    : undefined;

  return { ci, hasCi, isFraud, title };
}

export interface CitationIndexCellProps {
  channel: ChannelMetrics;
  variant?: 'desktop' | 'mobile';
}

export function CitationIndexCell({ channel, variant = 'desktop' }: CitationIndexCellProps) {
  const { ci, hasCi, isFraud, title } = evaluateCitationIndex(channel);

  if (variant === 'mobile') {
    if (!hasCi || ci === null) {
      return null;
    }

    return (
      <span
        className="text-[11px] font-mono text-slate-400 inline-flex items-center gap-1"
        title={title}
      >
        ИЦ:{' '}
        <strong
          className={
            isFraud
              ? 'text-rose-400 font-bold'
              : ci > 0
              ? 'text-emerald-400 font-semibold'
              : 'text-slate-300'
          }
        >
          {ci}
        </strong>
        {isFraud && <AlertTriangle className="w-3 h-3 text-rose-400 inline" />}
      </span>
    );
  }

  return (
    <span
      className={
        isFraud
          ? 'text-rose-400 font-bold text-xs inline-flex items-center gap-1 justify-center'
          : hasCi && ci !== null && ci > 0
          ? 'text-emerald-400 font-semibold text-xs'
          : 'text-slate-400 text-xs'
      }
      title={title}
    >
      {hasCi ? ci : '-'}
      {isFraud && <AlertTriangle className="w-3 h-3 text-rose-400" />}
    </span>
  );
}
