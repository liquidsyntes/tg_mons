import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { reportId1, reportId2 } = await req.json();

    if (!reportId1 || !reportId2) {
      return NextResponse.json({ error: 'Необходимо указать два ID отчетов для сравнения.' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY не задан в .env файле' }, { status: 500 });
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
Проведи объективный анализ динамики (эволюции) контент-стратегии канала "${olderReport.channel.title}" на основе двух исторических отчетов, сделанных в разное время. 
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const aiRes = await fetch(`https://openrouter.ai/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-pro',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      }),
    });
    
    clearTimeout(timeoutId);

    if (!aiRes.ok) {
      const errorData = await aiRes.text();
      console.error('OpenRouter Evolution Error:', errorData);
      return NextResponse.json({ error: `Ошибка API OpenRouter: ${aiRes.status}` }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || 'Не удалось сгенерировать сравнение.';

    let savedReport = null;
    if (summary !== 'Не удалось сгенерировать сравнение.') {
      try {
        savedReport = await prisma.aiReport.create({
          data: {
            channelId: olderReport.channelId,
            type: 'evolution',
            content: summary,
          }
        });
      } catch (dbError) {
        console.error('Failed to save AI report to DB:', dbError);
      }
    }

    return NextResponse.json({ summary, reportId: savedReport?.id });
  } catch (error: any) {
    console.error('AI Evolution Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error.message || '') }, { status: 500 });
  }
}
