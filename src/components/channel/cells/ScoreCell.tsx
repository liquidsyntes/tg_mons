import React from 'react';

interface ScoreCellProps {
  score: number | undefined;
  grade: string | undefined;
}

export function ScoreCell({ score, grade }: ScoreCellProps) {
  if (score === undefined || !grade) {
    return <span className="text-slate-500 font-mono text-xs">н/д</span>;
  }

  let bgClass = 'bg-rose-500/10 text-rose-400';
  if (score >= 80) bgClass = 'bg-emerald-500/10 text-emerald-400';
  else if (score >= 70) bgClass = 'bg-amber-500/10 text-amber-400';
  else if (score >= 60) bgClass = 'bg-orange-500/10 text-orange-400';

  return (
    <div className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${bgClass}`}>
      {grade} <span className="opacity-70 ml-1 font-normal">{score}</span>
    </div>
  );
}

interface EpCellProps {
  ep: number | undefined;
}

export function EpCell({ ep }: EpCellProps) {
  if (ep === undefined) {
    return <span className="text-slate-500 font-mono text-xs">н/д</span>;
  }

  let bgClass = 'bg-rose-500/10 text-rose-400';
  if (ep >= 80) bgClass = 'bg-emerald-500/10 text-emerald-400';
  else if (ep >= 60) bgClass = 'bg-amber-500/10 text-amber-400';
  else if (ep >= 40) bgClass = 'bg-orange-500/10 text-orange-400';

  return (
    <div className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${bgClass}`}>
      {ep.toFixed(1)}
    </div>
  );
}
