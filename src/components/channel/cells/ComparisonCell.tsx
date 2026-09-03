import React from 'react';

interface ComparisonCellProps {
  isMine: boolean;
  audienceSharePercent: number | null | undefined;
  growthRateDiff7d: number | null | undefined;
}

export function ComparisonCell({ isMine, audienceSharePercent, growthRateDiff7d }: ComparisonCellProps) {
  if (isMine) {
    return <span className="text-accent font-semibold text-xs">100% (база)</span>;
  }

  if (audienceSharePercent === null || audienceSharePercent === undefined) {
    return <span className="text-slate-500">н/д</span>;
  }

  return (
    <div>
      <span className="font-semibold text-slate-200">
        {audienceSharePercent}%
      </span>
      {growthRateDiff7d !== null && growthRateDiff7d !== undefined && (
        <span
          className={`text-[10px] block ${
            growthRateDiff7d > 0
              ? 'text-emerald-400'
              : growthRateDiff7d < 0
              ? 'text-rose-400'
              : 'text-slate-400'
          }`}
        >
          {growthRateDiff7d > 0 ? '+' : ''}
          {growthRateDiff7d}%
        </span>
      )}
    </div>
  );
}
