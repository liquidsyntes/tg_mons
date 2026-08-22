import React from 'react';

export interface AICompareData {
  limitations?: string;
  comparisonTable: { parameter: string; myChannel: string; competitor: string }[];
  strategy: { text: string; myQuote: string; competitorQuote: string };
  tone: { text: string; winner: string };
  competitorAdvantages: { title: string; description: string; isTransferable: string }[];
  myStrengths: { title: string; description: string }[];
  recommendations: { recommendation: string; effect: string; difficulty: string }[];
  conclusion: { summary: string; priority: string };
}

interface Props {
  data: AICompareData;
  myTitle: string;
  targetTitle: string;
}

export function AICompareReport({ data, myTitle, targetTitle }: Props) {
  return (
    <div className="bg-[#07111f] rounded-3xl p-6 sm:p-10 border border-[#231b52] text-[#edf4fb] space-y-12">
      {/* 0. Limitations (if any) */}
      {data.limitations && data.limitations.trim() !== '' && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-rose-200 text-sm">
          <strong>Ограничения анализа:</strong> {data.limitations}
        </div>
      )}

      {/* 1. Comparison Table */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0 text-violet-100">1. Сводная таблица</h2>
        </div>
        <div className="bg-[#100d2f] border border-[#231b52] rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="p-4 text-[#a39fcc] text-xs tracking-wider uppercase border-b border-[#231b52] font-semibold w-1/4">Параметр</th>
                <th className="p-4 text-accent text-xs tracking-wider uppercase border-b border-[#231b52] font-bold w-3/8">Мой канал ({myTitle})</th>
                <th className="p-4 text-violet-400 text-xs tracking-wider uppercase border-b border-[#231b52] font-bold w-3/8">Конкурент ({targetTitle})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#231b52]">
              {data.comparisonTable.map((item, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-sm text-[#b1acd9] font-medium align-top">{item.parameter}</td>
                  <td className="p-4 text-sm text-[#dce8f3] align-top">{item.myChannel}</td>
                  <td className="p-4 text-sm text-[#dce8f3] align-top">{item.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Strategy */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0 text-violet-100">2. Различия стратегий</h2>
        </div>
        <div className="bg-[#100d2f] border border-[#231b52] rounded-2xl p-6 shadow-lg space-y-5">
          <p className="m-0 leading-relaxed text-sm text-[#dce8f3]">{data.strategy.text}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.strategy.myQuote && (
              <div className="p-4 border-l-2 border-accent bg-accent/10 rounded-r-xl text-sm">
                <strong className="block text-accent mb-1 text-xs uppercase tracking-wider">Мой канал:</strong>
                <span className="italic text-[#d9e8f7]">«{data.strategy.myQuote.replace(/«|»/g, '')}»</span>
              </div>
            )}
            {data.strategy.competitorQuote && (
              <div className="p-4 border-l-2 border-violet-400 bg-violet-400/10 rounded-r-xl text-sm">
                <strong className="block text-violet-400 mb-1 text-xs uppercase tracking-wider">Конкурент:</strong>
                <span className="italic text-[#d9e8f7]">«{data.strategy.competitorQuote.replace(/«|»/g, '')}»</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Tone */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0 text-violet-100">3. Tone of Voice</h2>
        </div>
        <div className="bg-[#100d2f] border border-[#231b52] rounded-2xl p-6 shadow-lg space-y-4">
          <p className="m-0 leading-relaxed text-sm text-[#dce8f3]">{data.tone.text}</p>
          <div className="p-4 bg-[#07111f] border border-[#231b52] rounded-xl text-sm text-[#a39fcc]">
            <strong className="text-white block mb-1">Кто звучит убедительнее:</strong> {data.tone.winner}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 4. Competitor Advantages */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4 text-violet-400 flex items-center gap-2">
            Преимущества конкурента
          </h2>
          <div className="space-y-4">
            {data.competitorAdvantages.length > 0 ? data.competitorAdvantages.map((adv, i) => (
              <div key={i} className="bg-[#100d2f] border border-[#231b52] rounded-2xl p-5 shadow-lg">
                <h3 className="font-bold text-white mb-2">{adv.title}</h3>
                <p className="text-sm text-[#a39fcc] mb-3 leading-relaxed">{adv.description}</p>
                <div className="inline-block px-2.5 py-1 rounded bg-violet-500/20 text-violet-300 text-[10px] uppercase font-bold tracking-wider">
                  Переносимость: {adv.isTransferable}
                </div>
              </div>
            )) : (
              <div className="text-sm text-[#a39fcc] italic">Явных преимуществ не обнаружено.</div>
            )}
          </div>
        </section>

        {/* 5. My Strengths */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4 text-accent flex items-center gap-2">
            Наши сильные стороны
          </h2>
          <div className="space-y-4">
            {data.myStrengths.length > 0 ? data.myStrengths.map((str, i) => (
              <div key={i} className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-5 shadow-lg">
                <h3 className="font-bold text-white mb-2">{str.title}</h3>
                <p className="text-sm text-[#91a6bc] leading-relaxed m-0">{str.description}</p>
              </div>
            )) : (
              <div className="text-sm text-[#91a6bc] italic">Объективных преимуществ перед конкурентом не выявлено.</div>
            )}
          </div>
        </section>
      </div>

      {/* 6. Recommendations */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0 text-violet-100">6. Точки роста (Приоритеты)</h2>
        </div>
        <div className="bg-[#100d2f] border border-[#231b52] rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="p-4 text-[#a39fcc] text-xs tracking-wider uppercase border-b border-[#231b52] font-semibold w-1/3">Рекомендация</th>
                <th className="p-4 text-[#a39fcc] text-xs tracking-wider uppercase border-b border-[#231b52] font-semibold w-1/3">Ожидаемый эффект</th>
                <th className="p-4 text-[#a39fcc] text-xs tracking-wider uppercase border-b border-[#231b52] font-semibold w-1/3">Сложность</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#231b52]">
              {data.recommendations.map((item, i) => {
                let difficultyColor = 'text-amber-400';
                if (item.difficulty.toLowerCase().includes('низкая')) difficultyColor = 'text-emerald-400';
                if (item.difficulty.toLowerCase().includes('высокая')) difficultyColor = 'text-rose-400';
                return (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 text-sm text-[#dce8f3] align-top"><strong className="font-bold">{item.recommendation}</strong></td>
                    <td className="p-4 text-sm text-[#a39fcc] align-top">{item.effect}</td>
                    <td className="p-4 text-sm align-top font-bold uppercase tracking-wider text-[10px]"><span className={difficultyColor}>{item.difficulty}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. Conclusion */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0 text-violet-100">7. Краткий вывод</h2>
        </div>
        <div className="bg-gradient-to-r from-violet-900/40 to-[#07111f] border border-violet-500/30 rounded-2xl p-6 shadow-lg space-y-4">
          <p className="text-lg m-0 leading-relaxed max-w-4xl text-white">{data.conclusion.summary}</p>
          <div className="inline-block px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-200 text-sm font-medium border border-violet-500/20">
            <strong>Главный приоритет:</strong> {data.conclusion.priority}
          </div>
        </div>
      </section>
    </div>
  );
}
