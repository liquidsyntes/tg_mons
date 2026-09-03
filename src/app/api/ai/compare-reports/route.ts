import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';
import { callOpenRouter } from '@/lib/openrouter';
import { saveAiReport } from '@/lib/ai-reports';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { reportId1, reportId2 } = await req.json();

    if (!reportId1 || !reportId2) {
      return NextResponse.json({ error: 'Необходимо указать два ID отчетов для сравнения.' }, { status: 400 });
    }


    const [report1, report2] = await Promise.all([
      prisma.aiReport.findUnique({ where: { id: Number(reportId1) }, include: { channel: true } }),
      prisma.aiReport.findUnique({ where: { id: Number(reportId2) }, include: { channel: true } })
    ]);

    if (!report1 || !report2) {
      return NextResponse.json({ error: 'Один или оба отчета не найдены.' }, { status: 404 });
    }

    // Sort by date so older is first
    const [olderReport, newerReport] = report1.createdAt.getTime() < report2.createdAt.getTime() 
      ? [report1, report2] 
      : [report2, report1];

    const prompt = `
Ты опытный маркетолог и аналитик Telegram-каналов с опытом SMM-аудита и трекинга прогресса.

ЗАДАЧА
Проведи объективный анализ динамики (эволюции) контент-стратегии канала "${olderReport.channel?.title || 'канала'}" на основе двух исторических отчетов, сделанных в разное время. 
Твоя цель — понять, какие из прошлых рекомендаций были внедрены, что изменилось в лучшую или худшую сторону, и какой прогресс совершил канал.

СТАРЫЙ ОТЧЕТ (от ${olderReport.createdAt.toISOString()}):
${olderReport.content}

НОВЫЙ ОТЧЕТ (от ${newerReport.createdAt.toISOString()}):
${newerReport.content}

ПРАВИЛА АНАЛИЗА
- Опирайся ТОЛЬКО на предоставленные JSON-отчеты. Не выдумывай факты.
- Сравнивай метрики (если есть), изменения в тональности, сильные и слабые стороны.
- ОСОБОЕ ВНИМАНИЕ: проанализируй рекомендации из СТАРОГО отчета. Проверь, исчезли ли проблемы из НОВОГО отчета. Если проблема исчезла или появилась новая сильная сторона, связанная с рекомендацией — значит, она внедрена. Если проблема осталась в новом отчете — значит, рекомендация проигнорирована.
- Будь предельно объективен и честен (АНТИ-СИКОФАНСИЯ). Если канал не сделал ничего из рекомендованного и стагнирует — прямо скажи об этом.

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке, независимо от языка исходных постов и контента канала.
- Приводимые цитаты из постов оставляй на языке оригинала (как написаны в постах).
- Все заголовки, описания, выводы, рекомендации, метки — только на русском.

ФОРМАТ ОТВЕТА (JSON)
Ответь СТРОГО в формате валидного JSON объекта по следующей схеме (БЕЗ markdown):
{
  "progressScore": "Оценка от 1 до 10",
  "summary": "Краткое резюме общих изменений между отчетами (2-3 предложения. Стало лучше, хуже или без изменений?)",
  "metricsComparison": [
    { "metric": "Название метрики (например, 'Доля экспертного контента')", "oldValue": "Значение из старого отчета", "newValue": "Значение из нового", "trend": "positive | negative | neutral" }
  ],
  "implementedRecommendations": [
    { "recommendation": "Что советовали в прошлом", "result": "Как это было исправлено (доказательство из нового отчета)" }
  ],
  "ignoredRecommendations": [
    { "recommendation": "Что советовали, но проблема осталась", "impact": "Как это продолжает вредить" }
  ],
  "newStrengths": [
    { "title": "Новая сильная сторона", "description": "Что появилось хорошего в новом отчете, чего не было раньше" }
  ],
  "newWeaknesses": [
    { "title": "Новая проблема", "description": "Что стало хуже или какие новые уязвимости появились" }
  ],
  "nextSteps": {
    "priority": "Самый главный приоритет на следующий период",
    "action": "Конкретное действие (с учетом того, что они уже проигнорировали или сделали)"
  }
}
`;

    const result = await callOpenRouter(prompt);
    await saveAiReport(olderReport.channelId, 'evolution', result);
    return NextResponse.json({ summary: result });
  } catch (error: any) {
    logger.error('AI Error', undefined, error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}