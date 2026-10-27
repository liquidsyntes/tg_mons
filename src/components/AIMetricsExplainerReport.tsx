import React from 'react';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Lightbulb,
  HelpCircle,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';

export type MetricHealthStatus = 'good' | 'normal' | 'warning' | 'critical';

export interface MetricExplainerItem {
  metricName: string;
  metricValue: string;
  status: MetricHealthStatus;
  statusLabel: string;
  whatItMeans: string;
  whatUsersDo: string;
  whatUsersDontDo: string;
  smmAdvice: string;
}

export interface AIMetricsExplainerData {
  overallVerdict?: {
    headline?: string;
    plainExplanation?: string;
    healthBadge?: string;
  };
  audienceBehaviorSummary?: {
    whatTheyDo?: string[];
    whatTheyAvoid?: string[];
  };
  metricsBreakdown?: MetricExplainerItem[];
  topPriorities?: Array<{
    step: string;
    why: string;
    expectedChange: string;
  }>;
}

interface AIMetricsExplainerReportProps {
  data: AIMetricsExplainerData;
}

function getStatusStyles(status?: MetricHealthStatus): {
  badge: string;
  border: string;
  valueColor: string;
} {
  switch (status) {
    case 'good':
      return {
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        border: 'border-emerald-500/30',
        valueColor: 'text-emerald-300',
      };
    case 'warning':
      return {
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        border: 'border-amber-500/30',
        valueColor: 'text-amber-300',
      };
    case 'critical':
      return {
        badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        border: 'border-rose-500/30',
        valueColor: 'text-rose-300',
      };
    default:
      return {
        badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        border: 'border-sky-500/30',
        valueColor: 'text-sky-300',
      };
  }
}

export function AIMetricsExplainerReport({ data }: AIMetricsExplainerReportProps) {
  const verdict = data.overallVerdict;
  const behavior = data.audienceBehaviorSummary;
  const metrics = data.metricsBreakdown || [];
  const priorities = data.topPriorities || [];

  return (
    <div className="bg-[#07111f] rounded-3xl p-5 sm:p-8 border border-amber-500/30 text-[#edf4fb] space-y-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-amber-400/10 blur-[100px] rounded-full pointer-events-none" />

      {/* 1. Общее резюме SMM-щика */}
      <section className="relative z-10 bg-gradient-to-r from-[#241b08] to-[#07111f] border border-amber-500/30 rounded-2xl p-6 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-400">
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs font-bold tracking-widest uppercase">
              Разбор показателей простыми словами
            </span>
          </div>
          {verdict?.healthBadge && (
            <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30">
              {verdict.healthBadge}
            </span>
          )}
        </div>
        {verdict?.headline && (
          <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
            {verdict.headline}
          </h2>
        )}
        {verdict?.plainExplanation && (
          <p className="text-sm text-amber-100/90 leading-relaxed m-0">
            {verdict.plainExplanation}
          </p>
        )}
      </section>

      {/* 2. Сводка поведения аудитории: что делают и чего не делают */}
      {(behavior?.whatTheyDo?.length || behavior?.whatTheyAvoid?.length) ? (
        <section className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Что ваши подписчики реально делают
              </h3>
            </div>
            <ul className="space-y-2 m-0 pl-0 list-none">
              {(behavior?.whatTheyDo || []).map((item, idx) => (
                <li key={idx} className="text-xs sm:text-sm text-emerald-100 flex items-start gap-2">
                  <span className="text-emerald-400 font-bold mt-0.5">+</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-rose-400">
              <XCircle className="w-4 h-4 shrink-0" />
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Чего подписчики НЕ делают
              </h3>
            </div>
            <ul className="space-y-2 m-0 pl-0 list-none">
              {(behavior?.whatTheyAvoid || []).map((item, idx) => (
                <li key={idx} className="text-xs sm:text-sm text-rose-100 flex items-start gap-2">
                  <span className="text-rose-400 font-bold mt-0.5">&minus;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 3. Подробный разбор каждого показателя */}
      {metrics.length > 0 && (
        <section className="relative z-10 space-y-4">
          <div className="flex items-center gap-2 text-amber-300">
            <HelpCircle className="w-5 h-5" />
            <h3 className="text-base sm:text-lg font-bold text-white">
              Показатели канала: что означает каждая цифра
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {metrics.map((item, idx) => {
              const styles = getStatusStyles(item.status);
              return (
                <div
                  key={idx}
                  className={`bg-[#0d1c2f] border ${styles.border} rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-md`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-xs text-slate-400 font-medium">{item.metricName}</div>
                        <div className={`text-xl font-extrabold mt-0.5 ${styles.valueColor}`}>
                          {item.metricValue}
                        </div>
                      </div>
                      {item.statusLabel && (
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border shrink-0 ${styles.badge}`}
                        >
                          {item.statusLabel}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] uppercase font-bold tracking-wider text-amber-400/90 mb-1">
                        Что это значит простыми словами
                      </div>
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed m-0">
                        {item.whatItMeans}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3">
                        <div className="text-[10px] uppercase font-bold text-emerald-400 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Что делают люди
                        </div>
                        <p className="text-xs text-emerald-100/90 leading-relaxed m-0">
                          {item.whatUsersDo}
                        </p>
                      </div>

                      <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3">
                        <div className="text-[10px] uppercase font-bold text-rose-400 mb-1 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Чего НЕ делают
                        </div>
                        <p className="text-xs text-rose-100/90 leading-relaxed m-0">
                          {item.whatUsersDontDo}
                        </p>
                      </div>
                    </div>
                  </div>

                  {item.smmAdvice && (
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex items-start gap-2.5">
                      <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-100 leading-relaxed">
                        <span className="font-bold text-amber-300">Совет SMM-щика: </span>
                        {item.smmAdvice}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Главные шаги от SMM-специалиста */}
      {priorities.length > 0 && (
        <section className="relative z-10 space-y-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Sparkles className="w-5 h-5" />
            <h3 className="text-base sm:text-lg font-bold text-white">
              Что подкрутить в первую очередь (план от SMM-щика)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {priorities.map((p, idx) => (
              <div
                key={idx}
                className="bg-[#141f33] border border-amber-500/25 rounded-2xl p-5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                      Шаг 0{idx + 1}
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-sm font-bold text-white leading-snug">{p.step}</div>
                  <p className="text-xs text-slate-300 leading-relaxed m-0">{p.why}</p>
                </div>
                {p.expectedChange && (
                  <div className="pt-2 border-t border-slate-800 text-xs text-amber-200">
                    <span className="font-semibold text-amber-400">Какая цифра вырастет: </span>
                    {p.expectedChange}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
