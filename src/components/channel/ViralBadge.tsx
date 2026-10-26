import type { ViralClassification } from '@/lib/types';

const REASON_LABELS = {
  views: 'охват',
  forwards: 'пересылки',
  err: 'ERR',
} as const;

export function ViralBadge({ result }: { result: ViralClassification }) {
  if (!result.isViral || result.viralPrimaryReason === null || result.viralMultiplier === null) return null;

  return <span className="inline-flex self-start items-center rounded border border-rose-400/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
    🔥 Вирусный · {result.viralMultiplier.toFixed(1)}x {REASON_LABELS[result.viralPrimaryReason]}
  </span>;
}
