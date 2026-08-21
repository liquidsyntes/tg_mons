'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

interface DeltaBadgeProps {
  abs: number | null | undefined;
  percent: number | null | undefined;
  showAbs?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DeltaBadge({
  abs,
  percent,
  showAbs = true,
  size = 'md',
  className,
}: DeltaBadgeProps) {
  if (abs === null || abs === undefined || isNaN(abs)) {
    return (
      <span className={cn('text-xs text-slate-500 font-mono inline-flex items-center gap-1', className)}>
        <span>н/д</span>
      </span>
    );
  }

  const isPositive = abs > 0;
  const isNegative = abs < 0;
  const isZero = abs === 0;

  const colorClass = isPositive
    ? 'text-emerald-400'
    : isNegative
    ? 'text-rose-400'
    : 'text-slate-400';

  const bgClass = isPositive
    ? 'bg-emerald-500/10'
    : isNegative
    ? 'bg-rose-500/10'
    : 'bg-slate-800/40';

  const icon = isPositive ? (
    <TrendingUp className="w-3 h-3 stroke-[2.5]" />
  ) : isNegative ? (
    <TrendingDown className="w-3 h-3 stroke-[2.5]" />
  ) : (
    <Minus className="w-3 h-3" />
  );

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono tabular-nums',
        bgClass,
        colorClass,
        size === 'sm' && 'text-xs px-1.5 py-0.5',
        size === 'md' && 'text-xs',
        size === 'lg' && 'text-sm px-2.5 py-1',
        className
      )}
    >
      {icon}
      <span>
        {showAbs && (
          <span className="font-semibold">
            {isPositive ? '+' : ''}
            {formatNumber(abs)}
          </span>
        )}
        {showAbs && percent !== null && percent !== undefined && (
          <span className="text-xs opacity-75 ml-1">({formatPercent(percent)})</span>
        )}
        {!showAbs && percent !== null && percent !== undefined && (
          <span className="font-semibold">{formatPercent(percent)}</span>
        )}
      </span>
    </div>
  );
}
