'use client';

import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { FraudSignal } from '@/lib/fraudDetector';

export interface RiskBadgeProps {
  score?: number | null;
  signals?: FraudSignal[] | Array<{ signalType: string; reason: string }>;
  className?: string;
}

export function RiskBadge({ score, signals = [], className = '' }: RiskBadgeProps) {
  const parsedScore =
    typeof score === 'number'
      ? score
      : typeof score === 'bigint'
      ? Number(score)
      : typeof score === 'string' && (score as string).trim() !== ''
      ? Number(score)
      : 0;
  const safeScore = isFinite(parsedScore) ? Math.max(0, Math.min(100, Math.round(parsedScore))) : 0;
  const isHighRisk = safeScore >= 50;
  const isMediumRisk = safeScore > 0 && safeScore < 50;

  const colorStyles = isHighRisk
    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    : isMediumRisk
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';

  const safeSignals = Array.isArray(signals) ? signals.filter((s) => s && typeof s === 'object') : [];

  const tooltip =
    safeSignals.length > 0
      ? `Risk of Artificial Traffic: ${safeScore}%\n` +
        safeSignals
          .map((s) => `• ${s.reason || s.signalType || 'Подозрительная активность'}`)
          .join('\n')
      : `Risk of Artificial Traffic: ${safeScore}% (Низкий риск накрутки)`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${colorStyles} ${className}`}
      title={tooltip}
      data-testid="risk-badge"
    >
      {safeScore > 0 ? (
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      ) : (
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span>Risk of Artificial Traffic: {safeScore}%</span>
    </span>
  );
}

export const FraudScoreBadge = RiskBadge;
