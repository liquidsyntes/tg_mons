'use client';

/**
 * Секция AI-отчетов на странице детального анализа канала (/channel/[id]).
 * Содержит блоки для генерации и просмотра аналитики от нейросети:
 * SMM-разбор метрик, саммари контента, сравнение с конкурентом,
 * анализ аудитории, поиск упущенных тем и психологический портрет автора.
 */

import { useState, useCallback, useEffect } from 'react';
import { Sparkles, Layers, Users, Bot, Brain, Target, BarChart3 } from 'lucide-react';
import { AIReportCardShell } from './AIReportCardShell';
import { AISummaryReport, AISummaryData, SummaryPostStats } from '@/components/AISummaryReport';
import { AICompareReport, AICompareData } from '@/components/AICompareReport';
import { AIAudienceReport, AIAudienceData } from '@/components/AIAudienceReport';
import { AIContentGapReport, AIContentGapData } from '@/components/AIContentGapReport';
import { AIMetricsExplainerReport, AIMetricsExplainerData } from '@/components/AIMetricsExplainerReport';
import { AIPersonaReport, AIPersonaData, aiPersonaToMarkdown } from '@/components/channel/AIPersonaReport';
import {
  aiAudienceToMarkdown,
  aiCompareDataToMarkdown,
  aiContentGapToMarkdown,
  aiDataToMarkdown,
  aiMetricsExplainerToMarkdown,
  downloadMarkdown,
} from '@/lib/ai-markdown';
import { ChannelMetrics } from '@/lib/types';

/** Пропсы секции отчетов: данные целевого канала, эталонного канала, период и посты */
interface AIReportsSectionProps {
  channelId: string;
  channel: ChannelMetrics;
  myChannel: ChannelMetrics | null;
  period: '24h' | '7d' | '30d';
  recentPosts?: SummaryPostStats[];
  isAdmin?: boolean;
}

/**
 * Универсальный хук для отправки запроса к AI API.
 * Управляет состояниями загрузки, ошибки, успеха и парсингом входящего JSON-ответа.
 */
function useAiReportRequest<T>(
  endpoint: string,
  responseField: 'summary' | 'audience' | 'persona' | 'contentGap' | 'explainer'
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
  // Преобразование строкового периода в количество дней для выборки постов
  const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
  const [resolvedIsAdmin, setResolvedIsAdmin] = useState<boolean>(Boolean(isAdmin));

  // Если флаг isAdmin не передан явно из родителя, запрашиваем роль текущего пользователя через API
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

  // 1. Отчет: Понятный SMM-разбор метрик канала
  const {
    data: aiExplainer,
    loading: aiExplainerLoading,
    error: aiExplainerError,
    success: aiExplainerSuccess,
    setSuccess: setAiExplainerSuccess,
    run: runAiExplainer,
  } = useAiReportRequest<AIMetricsExplainerData>('/api/ai/metrics-explainer', 'explainer');

  // 2. Отчет: Экспресс-саммари по контенту
  const {
    data: aiSummary,
    loading: aiLoading,
    error: aiError,
    success: aiSuccess,
    setSuccess: setAiSuccess,
    run: runAiSummary,
  } = useAiReportRequest<AISummaryData>('/api/ai/summary', 'summary');

  // 3. Отчет: Супер-отчет на основе 50 постов
  const {
    data: aiSuperSummary,
    loading: aiSuperLoading,
    error: aiSuperError,
    success: aiSuperSuccess,
    setSuccess: setAiSuperSuccess,
    run: runAiSuperSummary,
  } = useAiReportRequest<AISummaryData>('/api/ai/super-report', 'summary');

  // 4. Отчет: Сравнение с каналом пользователя
  const {
    data: aiCompareSummary,
    loading: aiCompareLoading,
    error: aiCompareError,
    success: aiCompareSuccess,
    setSuccess: setAiCompareSuccess,
    run: runAiCompare,
  } = useAiReportRequest<AICompareData>('/api/ai/compare', 'summary');

  // 5. Отчет: Анализ целевой аудитории
  const {
    data: aiAudience,
    loading: aiAudienceLoading,
    error: aiAudienceError,
    success: aiAudienceSuccess,
    setSuccess: setAiAudienceSuccess,
    run: runAiAudience,
  } = useAiReportRequest<AIAudienceData>('/api/ai/audience', 'audience');

  // 6. Отчет: Психологический портрет автора (только для ADMIN)
  const {
    data: aiPersona,
    loading: aiPersonaLoading,
    error: aiPersonaError,
    success: aiPersonaSuccess,
    setSuccess: setAiPersonaSuccess,
    run: runAiPersona,
  } = useAiReportRequest<AIPersonaData>('/api/ai/persona', 'persona');

  // 7. Отчет: Упущенные темы конкурентов (Content Gap)
  const {
    data: aiContentGap,
    loading: aiContentGapLoading,
    error: aiContentGapError,
    success: aiContentGapSuccess,
    setSuccess: setAiContentGapSuccess,
    run: runAiContentGap,
  } = useAiReportRequest<AIContentGapData>('/api/ai/content-gap', 'contentGap');

  // Обработчики запуска генерации отчетов с передачей соответствующих параметров
  const fetchAiExplainer = () => runAiExplainer({ channelId, period });
  const fetchAiSummary = () => runAiSummary({ channelId, days });
  const fetchAiSuperSummary = () => runAiSuperSummary({ channelId });
  const fetchAiCompare = () => runAiCompare({ channelId, days });
  const fetchAiAudience = () => runAiAudience({ channelId, days });
  const fetchAiPersona = () => runAiPersona({ channelId });
  const fetchAiContentGap = () =>
    runAiContentGap({
      myChannelId: isMine ? channel.id : myChannel?.id,
      days: days === 1 ? 14 : days,
    });

  return (
    <>
      <AIReportCardShell
        containerClassName="border-amber-400/30 border-l-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.15)]"
        buttonClassName="bg-amber-400 hover:bg-amber-300 text-slate-950"
        accentClassName="text-amber-400"
        icon={<BarChart3 className="w-4 h-4 text-amber-400" />}
        title="Разбор показателей канала простыми словами"
        description="Опытный SMM-специалист объяснит каждую метрику (ERR, VR, ER, CR и др.): что делают и чего не делают ваши подписчики"
        buttonLabel="Разобрать показатели"
        loadingLabel="Разбираю метрики..."
        loading={aiExplainerLoading}
        success={aiExplainerSuccess}
        onSuccessClear={() => setAiExplainerSuccess(false)}
        onGenerate={fetchAiExplainer}
        messages={[
          'Собираем все показатели канала (ERR, VR, ER, CR, охваты)...',
          'Сравниваем метрики с поведением аудитории...',
          'SMM-эксперт переводит цифры на простой человеческий язык...',
          'Почти готово...',
        ]}
        error={aiExplainerError}
        result={aiExplainer ? <AIMetricsExplainerReport data={aiExplainer} /> : null}
        onDownload={() => downloadMarkdown(
          aiMetricsExplainerToMarkdown(aiExplainer, channel.title),
          `metrics_explainer_${channel.username || channel.id}.md`,
        )}
      />

      <AIReportCardShell
        containerClassName="border-accent/30 border-l-accent shadow-[0_0_15px_rgba(56,189,248,0.15)]"
        buttonClassName="bg-accent hover:bg-accent-hover text-slate-950"
        accentClassName="text-accent"
        icon={<Bot className="w-4 h-4 text-accent" />}
        title="Экспресс-отчёт на основе контента"
        description="Нейросеть проанализирует посты канала и сделает выжимку"
        buttonLabel="Сгенерировать саммари"
        loadingLabel="Формирую..."
        loading={aiLoading}
        success={aiSuccess}
        onSuccessClear={() => setAiSuccess(false)}
        onGenerate={fetchAiSummary}
        messages={['Сбор публикаций канала...', 'Анализ тональности и контекста...', 'Нейросеть формирует саммари...', 'Почти готово...']}
        error={aiError}
        result={aiSummary ? <AISummaryReport data={aiSummary} recentPosts={recentPosts} /> : null}
        onDownload={() => downloadMarkdown(aiDataToMarkdown(aiSummary), `summary_${channel.username || channel.id}.md`)}
      />

      <AIReportCardShell
        containerClassName="border-orange-500/30 border-l-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.15)]"
        buttonClassName="bg-orange-500 hover:bg-orange-600 text-white"
        accentClassName="text-orange-500"
        icon={<Sparkles className="w-4 h-4 text-orange-500" />}
        title="Супер Отчет (50 постов)"
        description="Глубокий анализ контента по последним 50 постам"
        buttonLabel="Супер Отчет"
        loadingLabel="Формирую..."
        loading={aiSuperLoading}
        success={aiSuperSuccess}
        onSuccessClear={() => setAiSuperSuccess(false)}
        onGenerate={fetchAiSuperSummary}
        messages={['Сбор архива постов (последние 50 шт)...', 'Анализ долгосрочных трендов...', 'Нейросеть формирует глубокий отчет...', 'Структурируем выводы...', 'Почти готово...']}
        error={aiSuperError}
        result={aiSuperSummary ? <AISummaryReport data={aiSuperSummary} recentPosts={recentPosts} /> : null}
        onDownload={() => downloadMarkdown(aiDataToMarkdown(aiSuperSummary), `super_summary_${channel.username || channel.id}.md`)}
      />

      {!isMine && myChannel && (
        <AIReportCardShell
          containerClassName="border-violet-500/30 border-l-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
          buttonClassName="bg-violet-500 hover:bg-violet-600 text-white"
          accentClassName="text-violet-400"
          icon={<Layers className="w-4 h-4 text-violet-400" />}
          title="Сравнительный AI-анализ"
          description={<>Сравнить контент этого канала с вашим («{myChannel.title}»)</>}
          buttonLabel="Сравнить каналы"
          loadingLabel="Сравниваю..."
          loading={aiCompareLoading}
          success={aiCompareSuccess}
          onSuccessClear={() => setAiCompareSuccess(false)}
          onGenerate={fetchAiCompare}
          messages={['Сбор данных обоих каналов...', 'Сравнение стилистики и метрик...', 'Нейросеть выявляет ключевые отличия...', 'Формируем таблицу...', 'Почти готово...']}
          error={aiCompareError}
          result={aiCompareSummary ? <AICompareReport data={aiCompareSummary} myTitle={myChannel.title} targetTitle={channel.title} /> : null}
          onDownload={() => downloadMarkdown(aiCompareDataToMarkdown(aiCompareSummary, myChannel.title, channel.title), `compare_${channel.username || channel.id}_vs_mine.md`)}
        />
      )}

      {(isMine || myChannel) && (
        <AIReportCardShell
          containerClassName="border-cyan-500/30 border-l-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
          buttonClassName="bg-cyan-500 hover:bg-cyan-600 text-slate-950"
          accentClassName="text-cyan-400"
          icon={<Target className="w-4 h-4 text-cyan-400" />}
          title="Упущенные темы конкурентов (AI Content Gap)"
          description={<>Темы и форматы с высоким охватом у конкурентов, которые ещё не выходили в канале «{isMine ? channel.title : myChannel?.title}»</>}
          buttonLabel="Найти упущенные темы"
          loadingLabel="Ищу темы..."
          loading={aiContentGapLoading}
          success={aiContentGapSuccess}
          onSuccessClear={() => setAiContentGapSuccess(false)}
          onGenerate={fetchAiContentGap}
          messages={[
            'Собираем топ-публикации конкурентов...',
            'Сравниваем с темами вашего канала...',
            'Нейросеть находит упущенные темы и быстрые победы...',
            'Почти готово...',
          ]}
          error={aiContentGapError}
          result={aiContentGap ? <AIContentGapReport data={aiContentGap} /> : null}
          onDownload={() => downloadMarkdown(
            aiContentGapToMarkdown(aiContentGap, isMine ? channel.title : myChannel?.title),
            `content_gap_${channel.username || channel.id}.md`,
          )}
        />
      )}

      <AIReportCardShell
        containerClassName="border-emerald-500/30 border-l-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
        buttonClassName="bg-emerald-500 hover:bg-emerald-600 text-slate-950"
        accentClassName="text-emerald-400"
        icon={<Users className="w-4 h-4 text-emerald-400" />}
        title="Анализ предполагаемой целевой аудитории"
        description="Предполагаемая аудитория на основе контента канала"
        buttonLabel="Сгенерировать отчет"
        loadingLabel="Анализирую..."
        loading={aiAudienceLoading}
        success={aiAudienceSuccess}
        onSuccessClear={() => setAiAudienceSuccess(false)}
        onGenerate={fetchAiAudience}
        messages={['Анализируем язык и стиль постов...', 'Вычисляем демографические маркеры...', 'Нейросеть составляет портрет читателя...', 'Почти готово...']}
        error={aiAudienceError}
        result={aiAudience ? <AIAudienceReport data={aiAudience} /> : null}
        onDownload={() => downloadMarkdown(aiAudienceToMarkdown(aiAudience), `audience_${channel.username || channel.id}.md`)}
      />

      {resolvedIsAdmin && (
        <AIReportCardShell
          containerClassName="border-rose-500/30 border-l-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
          buttonClassName="bg-rose-500 hover:bg-rose-600 text-white"
          accentClassName="text-rose-400"
          icon={<Brain className="w-4 h-4 text-rose-500" />}
          title="Психологический портрет"
          description="Глубокий психологический профиль автора на основе текстов"
          buttonLabel="Сгенерировать портрет"
          loadingLabel="Анализирую..."
          loading={aiPersonaLoading}
          success={aiPersonaSuccess}
          onSuccessClear={() => setAiPersonaSuccess(false)}
          onGenerate={fetchAiPersona}
          messages={['Анализируем психологические паттерны...', 'Определяем архетипы и BDSM-профиль...', 'Нейросеть составляет глубокий портрет...', 'Почти готово...']}
          error={aiPersonaError}
          result={aiPersona ? <AIPersonaReport data={aiPersona} /> : null}
          onDownload={() => downloadMarkdown(aiPersonaToMarkdown(aiPersona), `persona_${channel.username || channel.id}.md`)}
        />
      )}
    </>
  );
}
