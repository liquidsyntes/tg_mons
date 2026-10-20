import { NextResponse } from 'next/server';
import { logger } from './logger';
import { prisma } from './prisma';

export type AiReportType =
  | 'summary'
  | 'compare'
  | 'trend'
  | 'audience'
  | 'evolution'
  | 'action_plan'
  | 'persona'
  | 'super_report';

export interface TimestampedPost {
  publishedAt: Date;
  text: string | null;
}

export interface ChannelContentSummaryPromptOptions {
  channelTitle: string;
  scopeDescription: string;
  contentToAnalyze: string;
  maxChars: number;
  charLimitLabel: string;
}

/**
 * Saves an AI-generated report to the database.
 * Returns the ID of the created report, or null if save failed.
 */
export async function saveAiReport(
  channelId: number | null,
  type: AiReportType,
  content: string,
  userId?: number | null
): Promise<number | null> {
  try {
    const report = await prisma.aiReport.create({
      data: {
        channelId,
        type,
        content,
        ...(userId ? { userId } : {}),
      },
    });
    return report.id;
  } catch (dbError) {
    console.error('Failed to save AI report to DB:', dbError);
    return null;
  }
}

export function formatTimestampedPosts(posts: ReadonlyArray<TimestampedPost>): string {
  return posts
    .map((p) => `[${p.publishedAt.toISOString()}] ${p.text}`)
    .join('\n\n---\n\n');
}

export function buildChannelContentSummaryPrompt({
  channelTitle,
  scopeDescription,
  contentToAnalyze,
  maxChars,
  charLimitLabel,
}: ChannelContentSummaryPromptOptions): string {
  return `
Ты опытный маркетолог и аналитик Telegram-каналов с опытом контент-стратегии и SMM.

ЗАДАЧА
Проанализируй ${scopeDescription} канала "${channelTitle}" и составь структурированное саммари его контент-стратегии. Саммари должно быть пригодно для практического использования: чтобы автор канала или SMM-специалист мог принять решения по улучшению контента.

ИСХОДНЫЕ ДАННЫЕ
Посты канала (склеены вместе, ограничено ${charLimitLabel} символов):
${contentToAnalyze.substring(0, maxChars)}

ПРАВИЛА АНАЛИЗА
- Опирайся только на предоставленный текст. Не придумывай факты, цифры или примеры, которых нет в постах.
- Если постов слишком мало (менее 5) или они однотипны, явно укажи это как ограничение анализа в начале ответа.
- Для каждого содержательного пункта приводи 1-2 короткие цитаты из постов (в кавычках) как доказательство вывода.
- Где возможно, давай количественные оценки (например: "из ~20 постов 6 содержат прямой вопрос к аудитории", "рекламные посты составляют примерно 15% от объёма").
- Рекомендации должны быть конкретными и выполнимыми - не "усилить вовлечение", а "добавить закрытый вопрос с вариантами ответа в конце тем, где сейчас нет CTA".

АНТИ-СИКОФАНСИЯ (обязательно к соблюдению)
- Не хвали контент по умолчанию и не пытайся быть "приятным" - твоя ценность в честной, взвешенной оценке, а не в комплиментах.
- На каждый плюс в разделе "Сильные стороны" находи минимум один сопоставимый минус или риск в разделе "Слабые места" - если объективно сильных сторон меньше, чем слабых, отражай это соотношение открыто, а не уравнивай искусственно.
- Избегай общих хвалебных формулировок ("отличный канал", "прекрасно вовлекает аудиторию", "качественный контент") без конкретного доказательства через цитату и объяснение механизма.
- Если канал посредственный, шаблонный или использует избитые приёмы - прямо назови это, даже если тема или ниша выглядит успешной.
- В "Кратком выводе" не сглаживай итог ради вежливости: если приоритет улучшений выше, чем повод для похвалы, отражай это соотношение в тоне вывода.
- Оценивай контент так, как если бы автор не видел этот анализ - не подстраивай выводы под предполагаемые ожидания или самолюбие автора канала.

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке, независимо от языка исходных постов и контента канала.
- Приводимые цитаты из постов оставляй на языке оригинала (как написаны в постах).
- Все заголовки, описания, выводы, рекомендации, метки - только на русском.

ФОРМАТ ОТВЕТА (JSON)
Ответь СТРОГО в формате валидного JSON объекта по следующей схеме (БЕЗ использования markdown-блоков, просто чистый JSON):
{
  "stats": [
    { "value": "Значение (например, '60%')", "label": "Подпись" }, // Ровно 4 элемента. Например: доля экспертного контента, рекламного, постов с интерактивом, постов с CTA.
  ],
  "themes": {
    "bars": [
      { "label": "Название темы", "percent": 60 } // Доли основных тем
    ],
    "quote": "Цитата из текста, иллюстрирующая основную тему",
    "descriptions": [
      { "title": "Название блока темы", "text": "Краткое описание" }
    ]
  },
  "tone": [
    { "kicker": "Стиль", "title": "...", "text": "..." },
    { "kicker": "Лексика", "title": "...", "text": "..." },
    { "kicker": "Формат", "title": "...", "text": "..." },
    { "kicker": "Визуал", "title": "...", "text": "..." }
  ],
  "engagement": {
    "interactivity": { "value": "0%", "text": "Зафиксировано N из 5 постов с опросами..." },
    "cta": { "value": "60%", "text": "Призывы присутствуют в N из 5..." },
    "recommendation": "Рекомендуемый финал поста: ..."
  },
  "promo": {
    "text1": "Общее заключение по рекламе.",
    "text2": "Детали и характер рекламных постов."
  },
  "strengths": [
    { "num": "01", "title": "Сильная сторона", "text": "Описание", "quote": "Цитата-подтверждение" },
    { "num": "02", "title": "...", "text": "...", "quote": "..." }
  ],
  "weaknesses": [
    { "weakness": "Слабое место", "problem": "Почему это проблема", "recommendation": "Конкретная рекомендация" }
  ],
  "conclusion": {
    "main": "Общее впечатление от канала (честно).",
    "priority": "Главный приоритет для улучшения на ближайший месяц."
  }
}
`;
}

export function handleAiRouteError(error: unknown): NextResponse {
  logger.error('AI Error', undefined, error);
  if (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError')
  ) {
    return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Внутренняя ошибка сервера';
  return NextResponse.json({ error: message }, { status: 500 });
}
