import type { ReactionBreakdownItem } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

export function ReactionBreakdownInline({ total, breakdown }: {
  total: number | null;
  breakdown: ReactionBreakdownItem[] | null;
}) {
  return <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
    <span>Реакции: {total === null ? 'н/д' : formatNumber(total)}</span>
    {breakdown?.slice(0, 3).map(item =>
      <span key={item.emoji} className="rounded border border-border bg-slate-800/70 px-1.5 py-0.5 text-slate-200">
        {item.emoji} {formatNumber(item.count)}
      </span>)}
  </span>;
}
