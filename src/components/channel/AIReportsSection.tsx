'use client';

import { useState } from 'react';
import { Sparkles, Layers, Users, Download } from 'lucide-react';
import { AISummaryReport } from '@/components/AISummaryReport';
import { AICompareReport } from '@/components/AICompareReport';
import { AIAudienceReport } from '@/components/AIAudienceReport';
import { AIPersonaReport, aiPersonaToMarkdown } from '@/components/channel/AIPersonaReport';
import { ChannelMetrics } from '@/lib/types';

interface AIReportsSectionProps {
  channelId: string;
  channel: ChannelMetrics;
  myChannel: ChannelMetrics | null;
  period: '24h' | '7d' | '30d';
}

export function AIReportsSection({ channelId, channel, myChannel, period }: AIReportsSectionProps) {
  const isMine = channel.isMine;

  const [aiSummary, setAiSummary] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [aiCompareSummary, setAiCompareSummary] = useState<any | null>(null);
  const [aiCompareLoading, setAiCompareLoading] = useState(false);
  const [aiCompareError, setAiCompareError] = useState<string | null>(null);

  const [aiAudience, setAiAudience] = useState<any | null>(null);
  const [aiAudienceLoading, setAiAudienceLoading] = useState(false);
  const [aiAudienceError, setAiAudienceError] = useState<string | null>(null);

  const [aiPersona, setAiPersona] = useState<any | null>(null);
  const [aiPersonaLoading, setAiPersonaLoading] = useState(false);
  const [aiPersonaError, setAiPersonaError] = useState<string | null>(null);

  const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;

  const downloadMarkdown = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const aiDataToMarkdown = (data: any) => {
    if (!data) return '';
    return `
# Контент-анализ канала

## Ключевые показатели
${data.stats?.map((s: any) => `- **${s.value}**: ${s.label}`).join('\n')}

## 1. Основные темы
${data.themes?.bars?.map((b: any) => `- **${b.label}**: ${b.percent}%`).join('\n')}

> ${data.themes?.quote}

${data.themes?.descriptions?.map((d: any) => `**${d.title}**\n${d.text}`).join('\n\n')}

## 2. Тональность и подача
${data.tone?.map((t: any) => `### ${t.title} (${t.kicker})\n${t.text}`).join('\n\n')}

## 3. Вовлечение
- **Интерактивность**: ${data.engagement?.interactivity?.value} — ${data.engagement?.interactivity?.text}
- **CTA**: ${data.engagement?.cta?.value} — ${data.engagement?.cta?.text}

> **Рекомендация:** ${data.engagement?.recommendation}

## 4. Реклама и промо
${data.promo?.text1}

${data.promo?.text2}

## 5. Сильные стороны
${data.strengths?.map((s: any) => `### ${s.num}. ${s.title}\n${s.text}\n\n> ${s.quote}`).join('\n\n')}

## 6. Слабые места и рекомендации
| Слабое место | Почему это проблема | Конкретная рекомендация |
|---|---|---|
${data.weaknesses?.map((w: any) => `| **${w.weakness}** | ${w.problem} | ${w.recommendation} |`).join('\n')}

## 7. Краткий вывод
**${data.conclusion?.main}**

*Приоритет:* ${data.conclusion?.priority}
    `.trim();
  };

  const aiCompareDataToMarkdown = (data: any, myTitle: string, targetTitle: string) => {
    if (!data) return '';
    return `
# Сравнительный анализ каналов
**Мой канал:** ${myTitle}
**Конкурент:** ${targetTitle}

${data.limitations ? `> **Ограничения:** ${data.limitations}\n` : ''}

## 1. Сводная таблица
| Параметр | Мой канал | Конкурент |
|---|---|---|
${data.comparisonTable?.map((c: any) => `| **${c.parameter}** | ${c.myChannel} | ${c.competitor} |`).join('\n')}

## 2. Различия стратегий
${data.strategy?.text}

> **Мой канал:** ${data.strategy?.myQuote}
> **Конкурент:** ${data.strategy?.competitorQuote}

## 3. Tone of Voice
${data.tone?.text}

**Кто звучит убедительнее:** ${data.tone?.winner}

## 4. Преимущества конкурента
${data.competitorAdvantages?.length ? data.competitorAdvantages.map((a: any) => `### ${a.title}\n${a.description}\n*(Переносимость: ${a.isTransferable})*`).join('\n\n') : '*Преимуществ не обнаружено.*'}

## 5. Наши сильные стороны
${data.myStrengths?.length ? data.myStrengths.map((s: any) => `### ${s.title}\n${s.description}`).join('\n\n') : '*Преимуществ не обнаружено.*'}

## 6. Точки роста (Приоритеты)
| Рекомендация | Ожидаемый эффект | Сложность |
|---|---|---|
${data.recommendations?.map((r: any) => `| **${r.recommendation}** | ${r.effect} | ${r.difficulty} |`).join('\n')}

## 7. Краткий вывод
${data.conclusion?.summary}

**Главный приоритет:** ${data.conclusion?.priority}
    `.trim();
  };

  const aiAudienceToMarkdown = (data: any) => {
    if (!data) return '';
    return `
# Анализ Целевой Аудитории

**Резюме:** ${data.summary}

## Демография
- **Возраст:** ${data.demographics?.age}
- **Пол:** ${data.demographics?.gender}
- **Доход:** ${data.demographics?.income}
- **География:** ${data.demographics?.geo}

## Поведенческие факторы
- **Потребление контента:** ${data.behavior?.contentConsumption}
- **Причина подписки:** ${data.behavior?.engagementReason}

## Психографика
**Интересы:**
${data.psychographics?.interests?.map((i: string) => `- ${i}`).join('\n')}

**Ценности:**
${data.psychographics?.values?.map((v: string) => `- ${v}`).join('\n')}

**Боли и страхи:**
${data.psychographics?.fears?.map((f: string) => `- ${f}`).join('\n')}
    `.trim();
  };

  const fetchAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка генерации');
      if (json.summary) {
        try { setAiSummary(JSON.parse(json.summary)); }
        catch { setAiError('Ошибка парсинга ответа нейросети. Попробуйте еще раз.'); }
      } else { setAiError('Пустой ответ от нейросети.'); }
    } catch (err: any) { setAiError(err.message); }
    finally { setAiLoading(false); }
  };

  const fetchAiCompare = async () => {
    setAiCompareLoading(true);
    setAiCompareError(null);
    try {
      const res = await fetch('/api/ai/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetChannelId: channelId, myChannelId: myChannel?.id, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка генерации');
      if (json.summary) {
        try { setAiCompareSummary(JSON.parse(json.summary)); }
        catch { setAiCompareError('Ошибка парсинга ответа нейросети. Попробуйте еще раз.'); }
      } else { setAiCompareError('Пустой ответ от нейросети.'); }
    } catch (err: any) { setAiCompareError(err.message); }
    finally { setAiCompareLoading(false); }
  };

  const fetchAiAudience = async () => {
    setAiAudienceLoading(true);
    setAiAudienceError(null);
    try {
      const res = await fetch('/api/ai/audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка генерации');
      if (json.audience) {
        try { setAiAudience(JSON.parse(json.audience)); }
        catch { setAiAudienceError('Ошибка парсинга ответа нейросети. Попробуйте еще раз.'); }
      } else { setAiAudienceError('Пустой ответ от нейросети.'); }
    } catch (err: any) { setAiAudienceError(err.message); }
    finally { setAiAudienceLoading(false); }
  };

  const fetchAiPersona = async () => {
    setAiPersonaLoading(true);
    setAiPersonaError(null);
    try {
      const res = await fetch('/api/ai/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка генерации');
      if (json.persona) {
        try { setAiPersona(JSON.parse(json.persona)); }
        catch { setAiPersonaError('Ошибка парсинга ответа нейросети. Попробуйте еще раз.'); }
      } else { setAiPersonaError('Пустой ответ от нейросети.'); }
    } catch (err: any) { setAiPersonaError(err.message); }
    finally { setAiPersonaLoading(false); }
  };

  return (
    <>
      {/* AI Summary Section */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              AI-анализ контента
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Нейросеть проанализирует посты канала и сделает выжимку</p>
          </div>
          <button onClick={fetchAiSummary} disabled={aiLoading}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
            {aiLoading ? 'Анализирую...' : 'Сгенерировать саммари'}
          </button>
        </div>
        {aiError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{aiError}</div>}
        {aiSummary && (
          <div className="space-y-4 mt-6">
            <AISummaryReport data={aiSummary} />
            <div className="flex justify-end">
              <button onClick={() => downloadMarkdown(aiDataToMarkdown(aiSummary), `summary_${channel.username || channel.id}.md`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600 text-xs font-medium" data-pdf-hide>
                <Download className="w-3.5 h-3.5 text-accent" /> Экспорт в MD
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Comparative Section */}
      {!isMine && myChannel && (
        <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" />
                Сравнительный AI-анализ
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Сравнить контент этого канала с вашим («{myChannel.title}»)</p>
            </div>
            <button onClick={fetchAiCompare} disabled={aiCompareLoading}
              className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
              {aiCompareLoading ? 'Сравниваю...' : 'Сравнить каналы'}
            </button>
          </div>
          {aiCompareError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{aiCompareError}</div>}
          {aiCompareSummary && (
            <div className="space-y-4 mt-6">
              <AICompareReport data={aiCompareSummary} myTitle={myChannel.title} targetTitle={channel.title} />
              <div className="flex justify-end">
                <button onClick={() => downloadMarkdown(aiCompareDataToMarkdown(aiCompareSummary, myChannel.title, channel.title), `compare_${channel.username || channel.id}_vs_mine.md`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600 text-xs font-medium" data-pdf-hide>
                  <Download className="w-3.5 h-3.5 text-violet-400" /> Экспорт в MD
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Audience Section */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Анализ Целевой Аудитории
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Предполагаемая аудитория на основе контента канала</p>
          </div>
          <button onClick={fetchAiAudience} disabled={aiAudienceLoading}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
            {aiAudienceLoading ? 'Анализирую...' : 'Сгенерировать отчет'}
          </button>
        </div>
        {aiAudienceError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{aiAudienceError}</div>}
        {aiAudience && (
          <div className="space-y-4 mt-6">
            <AIAudienceReport data={aiAudience} />
            <div className="flex justify-end">
              <button onClick={() => downloadMarkdown(aiAudienceToMarkdown(aiAudience), `audience_${channel.username || channel.id}.md`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600 text-xs font-medium" data-pdf-hide>
                <Download className="w-3.5 h-3.5 text-emerald-400" /> Экспорт в MD
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Persona Section */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4 border-l-4 border-l-rose-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="text-rose-500 text-lg">🎭</span>
              Психологический портрет (Persona)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Глубокий психологический и BDSM профиль автора на основе текстов</p>
          </div>
          <button onClick={fetchAiPersona} disabled={aiPersonaLoading}
            className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
            {aiPersonaLoading ? 'Анализирую...' : 'Сгенерировать портрет'}
          </button>
        </div>
        {aiPersonaError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{aiPersonaError}</div>}
        {aiPersona && (
          <div className="space-y-4 mt-6">
            <AIPersonaReport data={aiPersona} />
            <div className="flex justify-end">
              <button onClick={() => downloadMarkdown(aiPersonaToMarkdown(aiPersona), `persona_${channel.username || channel.id}.md`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600 text-xs font-medium" data-pdf-hide>
                <Download className="w-3.5 h-3.5 text-rose-400" /> Экспорт в MD
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
