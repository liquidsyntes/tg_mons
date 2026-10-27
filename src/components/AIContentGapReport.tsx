import React from 'react';
import { Lightbulb, Target, Sparkles, GitCompareArrows } from 'lucide-react';

export interface MissingTopicItem {
  topic: string;
  whyItWorked: string;
  competitorChannels: string[];
  engagementPotential: string;
  suggestedAngle: string;
  quote?: string;
}

export interface CoveredTopicItem {
  topic: string;
  myPerformance: string;
  competitorPerformance: string;
  improvementTip: string;
}

export interface QuickWinItem {
  headline: string;
  format: string;
  hook: string;
}

export interface AIContentGapData {
  summary?: string;
  missingTopics?: MissingTopicItem[];
  coveredTopicsComparison?: CoveredTopicItem[];
  quickWins?: QuickWinItem[];
}

export function AIContentGapReport({ data }: { data: AIContentGapData | null }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {data.summary && (
        <div className="p-5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-sm text-cyan-100 leading-relaxed">
          <span className="font-bold text-white block mb-1">Резюме контентного разрыва:</span>
          {data.summary}
        </div>
      )}

      {data.missingTopics && data.missingTopics.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-cyan-400" />
            Упущенные темы конкурентов
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.missingTopics.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 border border-border rounded-2xl p-5 flex flex-col space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h5 className="text-sm font-bold text-white">{item.topic}</h5>
                  {item.engagementPotential && (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-bold text-cyan-300 uppercase">
                      {item.engagementPotential}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-slate-200">Почему взлетело:</strong> {item.whyItWorked}
                </p>

                {item.suggestedAngle && (
                  <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-200">
                    <strong className="text-cyan-400 block mb-0.5">Угол подачи для вашего канала:</strong>
                    {item.suggestedAngle}
                  </div>
                )}

                {item.quote && (
                  <div className="pl-3 border-l-2 border-cyan-500/40 text-xs text-slate-400 italic">
                    «{item.quote}»
                  </div>
                )}

                {item.competitorChannels && item.competitorChannels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 mt-auto">
                    {item.competitorChannels.map((ch, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-300"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.coveredTopicsComparison && data.coveredTopicsComparison.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5 text-violet-400" />
            Сравнение общих тем
          </h4>
          <div className="overflow-x-auto rounded-2xl border border-border bg-slate-900/50">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-slate-900/80 text-slate-400">
                  <th className="p-3 font-semibold">Тема</th>
                  <th className="p-3 font-semibold text-accent">Мой канал</th>
                  <th className="p-3 font-semibold text-violet-400">Конкуренты</th>
                  <th className="p-3 font-semibold text-emerald-400">Как усилить</th>
                </tr>
              </thead>
              <tbody>
                {data.coveredTopicsComparison.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/60 last:border-0">
                    <td className="p-3 font-semibold text-white align-top">{row.topic}</td>
                    <td className="p-3 text-slate-300 align-top">{row.myPerformance}</td>
                    <td className="p-3 text-slate-300 align-top">{row.competitorPerformance}</td>
                    <td className="p-3 text-emerald-200 align-top">{row.improvementTip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.quickWins && data.quickWins.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            Быстрые победы — готовые идеи публикаций
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.quickWins.map((win, idx) => (
              <div
                key={idx}
                className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    <Sparkles className="w-3 h-3" />
                    Идея #{idx + 1}
                  </span>
                  {win.format && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                      {win.format}
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-white leading-snug">{win.headline}</div>
                <p className="text-xs text-slate-300 leading-relaxed">{win.hook}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
