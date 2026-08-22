import React from 'react';

export interface AISummaryData {
  stats: { value: string; label: string }[];
  themes: {
    bars: { label: string; percent: number }[];
    quote: string;
    descriptions: { title: string; text: string }[];
  };
  tone: { kicker: string; title: string; text: string }[];
  engagement: {
    interactivity: { value: string; text: string };
    cta: { value: string; text: string };
    recommendation: string;
  };
  promo: {
    text1: string;
    text2: string;
  };
  strengths: { num: string; title: string; text: string; quote?: string }[];
  weaknesses: { weakness: string; problem: string; recommendation: string }[];
  conclusion: { main: string; priority: string };
}

interface Props {
  data: AISummaryData;
}

export function AISummaryReport({ data }: Props) {
  return (
    <div className="bg-[#07111f] rounded-3xl p-6 sm:p-10 border border-[#1b3552] text-[#edf4fb] space-y-12">
      {/* 4 Key stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.stats.slice(0, 4).map((stat, i) => (
          <div key={i} className="bg-gradient-to-b from-[#0d1c2f] to-[#0a1829] border border-[#1b3552] rounded-2xl p-5 shadow-lg">
            <div className="text-3xl font-extrabold tracking-tight">{stat.value}</div>
            <div className="text-[#91a6bc] text-sm mt-1">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* 1. Themes */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0">1. Основные темы</h2>
          <div className="text-[#91a6bc] text-sm">Структура контента</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1.15fr_0.85fr] gap-5">
          <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg">
            <div className="grid gap-4">
              {data.themes.bars.map((bar, i) => (
                <div key={i} className="grid gap-2">
                  <div className="flex justify-between text-sm">
                    <span>{bar.label}</span>
                    <strong className="font-bold">{bar.percent}%</strong>
                  </div>
                  <div className="h-2 bg-[#14283f] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#3f7fbd] to-[#75b5ee] rounded-full" style={{ width: `${bar.percent}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
            {data.themes.quote && (
              <div className="mt-5 p-4 border-l-2 border-[#5c9ee8] bg-[#183b62]/20 rounded-r-xl text-[#d9e8f7]">
                «{data.themes.quote.replace(/«|»/g, '')}»
              </div>
            )}
          </div>
          <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg space-y-4">
            {data.themes.descriptions.map((desc, i) => (
              <div key={i}>
                <p className="font-bold mb-1">{desc.title}</p>
                <p className="text-[#91a6bc] text-sm leading-relaxed m-0">{desc.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Tone */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0">2. Тональность и подача</h2>
          <div className="text-[#91a6bc] text-sm">Как звучит канал</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {data.tone.map((item, i) => (
            <div key={i} className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg">
              <div className="text-xs uppercase tracking-[0.12em] text-[#79abd6] font-bold mb-2">{item.kicker}</div>
              <h3 className="text-lg font-bold mb-2">{item.title}</h3>
              <p className="text-[#91a6bc] text-sm leading-relaxed m-0">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Engagement */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0">3. Вовлечение</h2>
          <div className="text-[#91a6bc] text-sm">Главная зона роста</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg">
            <div className="text-3xl font-extrabold mb-1">{data.engagement.interactivity.value}</div>
            <p className="font-bold mb-1">Интерактивность</p>
            <p className="text-[#91a6bc] text-sm m-0">{data.engagement.interactivity.text}</p>
          </div>
          <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg">
            <div className="text-3xl font-extrabold mb-1">{data.engagement.cta.value}</div>
            <p className="font-bold mb-1">CTA</p>
            <p className="text-[#91a6bc] text-sm m-0">{data.engagement.cta.text}</p>
          </div>
        </div>
        <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg">
          <div className="p-4 border-l-2 border-[#5c9ee8] bg-[#183b62]/20 rounded-r-xl text-[#d9e8f7] m-0">
            {data.engagement.recommendation}
          </div>
        </div>
      </section>

      {/* 4. Promo */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0">4. Реклама и промо</h2>
        </div>
        <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg space-y-4">
          <p className="m-0 leading-relaxed">{data.promo.text1}</p>
          <p className="text-[#91a6bc] text-sm leading-relaxed m-0">{data.promo.text2}</p>
        </div>
      </section>

      {/* 5. Strengths */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0">5. Сильные стороны</h2>
          <div className="text-[#91a6bc] text-sm">Что уже работает</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {data.strengths.map((item, i) => (
            <div key={i} className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg">
              <div className="text-xs uppercase tracking-[0.12em] text-[#79abd6] font-bold mb-2">{item.num}</div>
              <h3 className="text-lg font-bold mb-2">{item.title}</h3>
              <p className="text-[#91a6bc] text-sm leading-relaxed mb-4">{item.text}</p>
              {item.quote && (
                <div className="p-4 border-l-2 border-[#5c9ee8] bg-[#183b62]/20 rounded-r-xl text-[#d9e8f7]">
                  «{item.quote.replace(/«|»/g, '')}»
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 6. Weaknesses */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0">6. Слабые места и рекомендации</h2>
          <div className="text-[#91a6bc] text-sm">Приоритеты</div>
        </div>
        <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="p-4 text-[#9fb5cc] text-xs tracking-wider uppercase border-b border-[#1b3552] font-semibold w-1/3">Слабое место</th>
                <th className="p-4 text-[#9fb5cc] text-xs tracking-wider uppercase border-b border-[#1b3552] font-semibold w-1/3">Почему это проблема</th>
                <th className="p-4 text-[#9fb5cc] text-xs tracking-wider uppercase border-b border-[#1b3552] font-semibold w-1/3">Конкретная рекомендация</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1b3552]">
              {data.weaknesses.map((item, i) => (
                <tr key={i}>
                  <td className="p-4 text-sm text-[#dce8f3] align-top"><strong className="font-bold">{item.weakness}</strong></td>
                  <td className="p-4 text-sm text-[#dce8f3] align-top">{item.problem}</td>
                  <td className="p-4 text-sm text-[#dce8f3] align-top">{item.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. Conclusion */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-bold tracking-tight m-0">7. Краткий вывод</h2>
          <div className="text-[#91a6bc] text-sm">Главный инсайт</div>
        </div>
        <div className="bg-[#0d1c2f] border border-[#1b3552] rounded-2xl p-6 shadow-lg space-y-4">
          <p className="text-lg m-0 leading-relaxed max-w-4xl">{data.conclusion.main}</p>
          <p className="text-[#91a6bc] text-sm leading-relaxed m-0">{data.conclusion.priority}</p>
        </div>
      </section>
    </div>
  );
}
