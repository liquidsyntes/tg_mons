import type { ChannelReactionSummary } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

export function PopularReactionsWidget({ summary }: { summary: ChannelReactionSummary | undefined }) {
  return <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-label="Популярные реакции за 30 дней">
    <h3 className="text-base font-bold text-white">Популярные реакции за 30 дней</h3>
    {!summary || summary.top.length === 0 ? (
      <p className="mt-3 text-xs text-slate-400">Разбивка реакций пока недоступна</p>
    ) : (
      <>
        <p className="mt-1 text-xs text-slate-400">По {formatNumber(summary.coveredPosts)} постам с разбивкой</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.top.map(item => <div key={item.emoji} className="rounded-xl border border-border bg-slate-900 px-3 py-2 text-sm text-white">
            <span className="font-semibold">{item.emoji} {formatNumber(item.count)}</span>
            <span className="ml-2 text-xs text-slate-400">{item.sharePercent}%</span>
          </div>)}
        </div>
      </>
    )}
  </section>;
}
