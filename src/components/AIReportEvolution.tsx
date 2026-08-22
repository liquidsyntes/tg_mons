import React from 'react';
import { TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, ArrowRight, Zap, Target } from 'lucide-react';

export interface AIEvolutionData {
  progressScore: string | number;
  summary: string;
  metricsComparison: { metric: string; oldValue: string; newValue: string; trend: 'positive' | 'negative' | 'neutral' }[];
  implementedRecommendations: { recommendation: string; result: string }[];
  ignoredRecommendations: { recommendation: string; impact: string }[];
  newStrengths: { title: string; description: string }[];
  newWeaknesses: { title: string; description: string }[];
  nextSteps: { priority: string; action: string };
}

interface Props {
  data: AIEvolutionData;
}

export function AIReportEvolution({ data }: Props) {
  const score = Number(data.progressScore);
  const scoreColor = isNaN(score) ? 'text-amber-400' : score >= 7 ? 'text-emerald-400' : score >= 4 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="bg-[#07111f] rounded-3xl p-6 sm:p-10 border border-[#231b52] text-[#edf4fb] space-y-12">
      
      {/* 1. Header & Summary */}
      <section className="flex flex-col md:flex-row gap-8 items-start">
        <div className="shrink-0 text-center bg-[#100d2f] border border-[#231b52] rounded-3xl p-8 shadow-lg min-w-[200px]">
          <div className="text-sm text-[#a39fcc] uppercase tracking-widest font-semibold mb-2">Прогресс</div>
          <div className={`text-6xl font-black ${scoreColor}`}>
            {data.progressScore}<span className="text-3xl text-slate-600">/10</span>
          </div>
        </div>
        <div className="flex-1 bg-gradient-to-r from-[#100d2f] to-[#07111f] border border-[#231b52] rounded-3xl p-8 shadow-lg">
          <h2 className="text-xl font-bold tracking-tight mb-4 text-violet-100">Резюме изменений</h2>
          <p className="text-lg leading-relaxed text-[#dce8f3] m-0">{data.summary}</p>
        </div>
      </section>

      {/* 2. Metrics Comparison */}
      {data.metricsComparison && data.metricsComparison.length > 0 && (
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-6 text-violet-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            Сдвиги в метриках и показателях
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.metricsComparison.map((m, i) => {
              const isPos = m.trend === 'positive';
              const isNeg = m.trend === 'negative';
              const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
              const trendColor = isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-slate-400';
              const trendBg = isPos ? 'bg-emerald-400/10' : isNeg ? 'bg-rose-400/10' : 'bg-slate-400/10';
              
              return (
                <div key={i} className="bg-[#100d2f] border border-[#231b52] rounded-2xl p-5 shadow-lg flex flex-col justify-between">
                  <div className="text-sm text-[#a39fcc] font-medium mb-4">{m.metric}</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="line-through text-slate-500 text-sm">{m.oldValue}</span>
                      <ArrowRight className="w-4 h-4 text-slate-600" />
                      <span className="font-bold text-white text-lg">{m.newValue}</span>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${trendBg} ${trendColor}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Recommendations check */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-4 text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Внедрено (Плюсы)
          </h2>
          <div className="space-y-4">
            {data.implementedRecommendations?.length > 0 ? data.implementedRecommendations.map((item, i) => (
              <div key={i} className="bg-emerald-950/20 border border-emerald-900/30 rounded-2xl p-5">
                <div className="text-sm text-emerald-500/80 mb-1">Рекомендация:</div>
                <div className="font-medium text-emerald-100 mb-3">{item.recommendation}</div>
                <div className="text-sm text-emerald-500/80 mb-1">Результат:</div>
                <div className="text-sm text-emerald-200/80">{item.result}</div>
              </div>
            )) : (
              <div className="text-sm text-slate-500 italic p-4 bg-[#100d2f] rounded-2xl border border-[#231b52]">
                Прошлые рекомендации не были внедрены.
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight mb-4 text-rose-400 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            Проигнорировано (Минусы)
          </h2>
          <div className="space-y-4">
            {data.ignoredRecommendations?.length > 0 ? data.ignoredRecommendations.map((item, i) => (
              <div key={i} className="bg-rose-950/20 border border-rose-900/30 rounded-2xl p-5">
                <div className="text-sm text-rose-500/80 mb-1">Проигнорировано:</div>
                <div className="font-medium text-rose-100 mb-3">{item.recommendation}</div>
                <div className="text-sm text-rose-500/80 mb-1">Последствия:</div>
                <div className="text-sm text-rose-200/80">{item.impact}</div>
              </div>
            )) : (
              <div className="text-sm text-slate-500 italic p-4 bg-[#100d2f] rounded-2xl border border-[#231b52]">
                Все значимые рекомендации были отработаны!
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. New Strengths / Weaknesses */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-bold tracking-tight mb-4 text-accent">Новые сильные стороны</h2>
          <div className="space-y-3">
            {data.newStrengths?.length > 0 ? data.newStrengths.map((item, i) => (
              <div key={i} className="bg-[#100d2f] border border-[#231b52] rounded-xl p-4">
                <h3 className="font-bold text-white text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-[#a39fcc] m-0">{item.description}</p>
              </div>
            )) : (
              <div className="text-xs text-slate-500 italic">Ничего нового не появилось.</div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold tracking-tight mb-4 text-amber-400">Новые проблемы / Уязвимости</h2>
          <div className="space-y-3">
            {data.newWeaknesses?.length > 0 ? data.newWeaknesses.map((item, i) => (
              <div key={i} className="bg-amber-950/10 border border-amber-900/20 rounded-xl p-4">
                <h3 className="font-bold text-amber-100 text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-amber-200/60 m-0">{item.description}</p>
              </div>
            )) : (
              <div className="text-xs text-slate-500 italic">Новых проблем не обнаружено.</div>
            )}
          </div>
        </div>
      </section>

      {/* 5. Next Steps */}
      <section>
        <div className="bg-gradient-to-br from-violet-900/40 to-[#07111f] border border-violet-500/30 rounded-3xl p-8 shadow-lg flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/20 text-violet-300 flex items-center justify-center shrink-0 border border-violet-500/30">
            <Target className="w-8 h-8" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest uppercase text-violet-400 mb-2">Главный фокус на следующий месяц</div>
            <h3 className="text-xl font-bold text-white mb-2">{data.nextSteps?.priority}</h3>
            <p className="text-[#a39fcc] text-sm m-0 leading-relaxed">{data.nextSteps?.action}</p>
          </div>
        </div>
      </section>

    </div>
  );
}
