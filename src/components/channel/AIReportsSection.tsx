'use client';

import { useState, useCallback, useEffect } from 'react';
import { Sparkles, Layers, Users, Download, Bot, Brain, Loader2 } from 'lucide-react';
import { AILoadingStatus } from '@/components/AILoadingStatus';
import { AISummaryReport, AISummaryData, SummaryPostStats } from '@/components/AISummaryReport';
import { AICompareReport, AICompareData } from '@/components/AICompareReport';
import { AIAudienceReport, AIAudienceData } from '@/components/AIAudienceReport';
import { AIPersonaReport, AIPersonaData, aiPersonaToMarkdown } from '@/components/channel/AIPersonaReport';
import {
  aiAudienceToMarkdown,
  aiCompareDataToMarkdown,
  aiDataToMarkdown,
  downloadMarkdown,
} from '@/lib/ai-markdown';
import { ChannelMetrics } from '@/lib/types';

interface AIReportsSectionProps {
  channelId: string;
  channel: ChannelMetrics;
  myChannel: ChannelMetrics | null;
  period: '24h' | '7d' | '30d';
  recentPosts?: SummaryPostStats[];
  isAdmin?: boolean;
}

function useAiReportRequest<T>(
  endpoint: string,
  responseField: 'summary' | 'audience' | 'persona'
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const run = useCallback(
    async (payload: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          throw new Error(
            typeof json.error === 'string' && json.error ? json.error : 'Ошибка генерации'
          );
        }
        const rawPayload = json[responseField];
        if (typeof rawPayload === 'string' && rawPayload) {
          try {
            setData(JSON.parse(rawPayload) as T);
            setSuccess(true);
          } catch {
            setError('Ошибка парсинга ответа нейросети. Попробуйте еще раз.');
          }
        } else {
          setError('Пустой ответ от нейросети.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Ошибка генерации');
      } finally {
        setLoading(false);
      }
    },
    [endpoint, responseField]
  );

  return { data, loading, error, success, setSuccess, run };
}

export function AIReportsSection({ channelId, channel, myChannel, period, recentPosts, isAdmin }: AIReportsSectionProps) {
  const isMine = channel.isMine;
  const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
  const [resolvedIsAdmin, setResolvedIsAdmin] = useState<boolean>(Boolean(isAdmin));

  useEffect(() => {
    if (isAdmin !== undefined) {
      setResolvedIsAdmin(isAdmin);
      return;
    }
    let active = true;
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then((data: { user?: { role?: string } } | null) => {
        if (active) setResolvedIsAdmin(data?.user?.role === 'ADMIN');
      })
      .catch(() => {
        if (active) setResolvedIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const {
    data: aiSummary,
    loading: aiLoading,
    error: aiError,
    success: aiSuccess,
    setSuccess: setAiSuccess,
    run: runAiSummary,
  } = useAiReportRequest<AISummaryData>('/api/ai/summary', 'summary');

  const {
    data: aiSuperSummary,
    loading: aiSuperLoading,
    error: aiSuperError,
    success: aiSuperSuccess,
    setSuccess: setAiSuperSuccess,
    run: runAiSuperSummary,
  } = useAiReportRequest<AISummaryData>('/api/ai/super-report', 'summary');

  const {
    data: aiCompareSummary,
    loading: aiCompareLoading,
    error: aiCompareError,
    success: aiCompareSuccess,
    setSuccess: setAiCompareSuccess,
    run: runAiCompare,
  } = useAiReportRequest<AICompareData>('/api/ai/compare', 'summary');

  const {
    data: aiAudience,
    loading: aiAudienceLoading,
    error: aiAudienceError,
    success: aiAudienceSuccess,
    setSuccess: setAiAudienceSuccess,
    run: runAiAudience,
  } = useAiReportRequest<AIAudienceData>('/api/ai/audience', 'audience');

  const {
    data: aiPersona,
    loading: aiPersonaLoading,
    error: aiPersonaError,
    success: aiPersonaSuccess,
    setSuccess: setAiPersonaSuccess,
    run: runAiPersona,
  } = useAiReportRequest<AIPersonaData>('/api/ai/persona', 'persona');

  const fetchAiSummary = () => runAiSummary({ channelId, days });
  const fetchAiSuperSummary = () => runAiSuperSummary({ channelId });
  const fetchAiCompare = () => runAiCompare({ channelId, days });
  const fetchAiAudience = () => runAiAudience({ channelId, days });
  const fetchAiPersona = () => runAiPersona({ channelId });

  return (
    <>
      {/* AI Summary Section */}
      <div className="bg-surface border border-accent/30 rounded-2xl p-5 sm:p-6 space-y-4 border-l-4 border-l-accent shadow-[0_0_15px_rgba(56,189,248,0.15)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Bot className="w-4 h-4 text-accent" />
              Экспресс-отчёт на основе контента
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Нейросеть проанализирует посты канала и сделает выжимку</p>
          </div>
          <button onClick={fetchAiSummary} disabled={aiLoading}
            className="w-[220px] justify-center py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
            {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin"/> Формирую...</> : 'Сгенерировать саммари'}
          </button>
        </div>
        <AILoadingStatus isRunning={aiLoading} success={aiSuccess} onSuccessClear={() => setAiSuccess(false)} messages={['Сбор публикаций канала...', 'Анализ тональности и контекста...', 'Нейросеть формирует саммари...', 'Почти готово...']} />
        {aiError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{aiError}</div>}
        {aiSummary && (
          <div className="space-y-4 mt-6">
            <AISummaryReport data={aiSummary} recentPosts={recentPosts} />
            <div className="flex justify-end">
              <button onClick={() => downloadMarkdown(aiDataToMarkdown(aiSummary), `summary_${channel.username || channel.id}.md`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600 text-xs font-medium" data-pdf-hide>
                <Download className="w-3.5 h-3.5 text-accent" /> Экспорт в MD
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Super Report Section */}
      <div className="bg-surface border border-orange-500/30 rounded-2xl p-5 sm:p-6 space-y-4 border-l-4 border-l-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-500" />
              Супер Отчет (50 постов)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Глубокий анализ контента по последним 50 постам</p>
          </div>
          <button onClick={fetchAiSuperSummary} disabled={aiSuperLoading}
            className="w-[220px] justify-center py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
            {aiSuperLoading ? <><Loader2 className="w-4 h-4 animate-spin"/> Формирую...</> : 'Супер Отчет'}
          </button>
        </div>
        <AILoadingStatus isRunning={aiSuperLoading} success={aiSuperSuccess} onSuccessClear={() => setAiSuperSuccess(false)} messages={['Сбор архива постов (последние 50 шт)...', 'Анализ долгосрочных трендов...', 'Нейросеть формирует глубокий отчет...', 'Структурируем выводы...', 'Почти готово...']} />
        {aiSuperError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{aiSuperError}</div>}
        {aiSuperSummary && (
          <div className="space-y-4 mt-6">
            <AISummaryReport data={aiSuperSummary} recentPosts={recentPosts} />
            <div className="flex justify-end">
              <button onClick={() => downloadMarkdown(aiDataToMarkdown(aiSuperSummary), `super_summary_${channel.username || channel.id}.md`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-border hover:border-slate-600 text-xs font-medium" data-pdf-hide>
                <Download className="w-3.5 h-3.5 text-orange-500" /> Экспорт в MD
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Comparative Section */}
      {!isMine && myChannel && (
        <div className="bg-surface border border-violet-500/30 rounded-2xl p-5 sm:p-6 space-y-4 border-l-4 border-l-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" />
                Сравнительный AI-анализ
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Сравнить контент этого канала с вашим («{myChannel.title}»)</p>
            </div>
            <button onClick={fetchAiCompare} disabled={aiCompareLoading}
              className="w-[220px] justify-center py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
              {aiCompareLoading ? <><Loader2 className="w-4 h-4 animate-spin"/> Сравниваю...</> : 'Сравнить каналы'}
            </button>
          </div>
          <AILoadingStatus isRunning={aiCompareLoading} success={aiCompareSuccess} onSuccessClear={() => setAiCompareSuccess(false)} messages={['Сбор данных обоих каналов...', 'Сравнение стилистики и метрик...', 'Нейросеть выявляет ключевые отличия...', 'Формируем таблицу...', 'Почти готово...']} />
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
      <div className="bg-surface border border-emerald-500/30 rounded-2xl p-5 sm:p-6 space-y-4 border-l-4 border-l-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Анализ предполагаемой целевой аудитории
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Предполагаемая аудитория на основе контента канала</p>
          </div>
          <button onClick={fetchAiAudience} disabled={aiAudienceLoading}
            className="w-[220px] justify-center py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
            {aiAudienceLoading ? <><Loader2 className="w-4 h-4 animate-spin"/> Анализирую...</> : 'Сгенерировать отчет'}
          </button>
        </div>
        <AILoadingStatus isRunning={aiAudienceLoading} success={aiAudienceSuccess} onSuccessClear={() => setAiAudienceSuccess(false)} messages={['Анализируем язык и стиль постов...', 'Вычисляем демографические маркеры...', 'Нейросеть составляет портрет читателя...', 'Почти готово...']} />
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

      {/* AI Persona Section (Admin only) */}
      {resolvedIsAdmin && (
        <div className="bg-surface border border-rose-500/30 rounded-2xl p-5 sm:p-6 space-y-4 border-l-4 border-l-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-rose-500" />
                Психологический портрет
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Глубокий психологический профиль автора на основе текстов</p>
            </div>
            <button onClick={fetchAiPersona} disabled={aiPersonaLoading}
              className="w-[220px] justify-center py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
              {aiPersonaLoading ? <><Loader2 className="w-4 h-4 animate-spin"/> Анализирую...</> : 'Сгенерировать портрет'}
            </button>
          </div>
          <AILoadingStatus isRunning={aiPersonaLoading} success={aiPersonaSuccess} onSuccessClear={() => setAiPersonaSuccess(false)} messages={['Анализируем психологические паттерны...', 'Определяем архетипы и BDSM-профиль...', 'Нейросеть составляет глубокий портрет...', 'Почти готово...']} />
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
      )}
    </>
  );
}
