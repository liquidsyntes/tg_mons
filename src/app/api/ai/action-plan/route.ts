import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { reportId } = await req.json();

    if (!reportId) {
      return NextResponse.json({ error: 'Необходимо указать ID отчета.' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY не задан в .env файле' }, { status: 500 });
    }

    const baseReport = await prisma.aiReport.findUnique({ 
      where: { id: Number(reportId) }, 
      include: { channel: true } 
    });

    if (!baseReport) {
      return NextResponse.json({ error: 'Отчет не найден.' }, { status: 404 });
    }

    const prompt = `
Ты опытный SMM-менеджер, продюсер Telegram-каналов и проектный руководитель.

ЗАДАЧА
На основе предоставленного аналитического отчета о Telegram-канале "${baseReport.channel.title}" составь четкое, пошаговое руководство к действию (Action Plan).
Руководство должно состоять максимум из 10 конкретных шагов. Это не абстрактные советы, а инструкция в формате "Бери и делай", которую можно сразу отдать контент-мейкеру.

ОТЧЕТ ДЛЯ АНАЛИЗА:
${baseReport.content}

ПРАВИЛА
- Не больше 10 шагов. Выбери только самое важное.
- Строго на основе уязвимостей, точек роста и рекомендаций из предоставленного отчета.
- Каждый шаг должен быть предельно конкретным (что сделать, как сделать, какой формат или рубрику внедрить).
- Избегай воды и банальностей ("делайте качественный контент", "изучайте аудиторию"). Пиши конкретные задачи ("Добавить 2 поста в неделю в формате X", "Сократить среднюю длину текста на 30%").

ФОРМАТ ОТВЕТА (JSON)
Ответь СТРОГО в формате валидного JSON объекта по следующей схеме (БЕЗ markdown):
{
  "title": "Цепляющий заголовок плана (например, 'План по выводу канала из стагнации' или 'Стратегия отстройки от конкурента')",
  "estimatedTime": "Ориентировочное время на полное внедрение плана (например, '2-3 недели')",
  "steps": [
    {
      "stepNumber": 1,
      "title": "Что сделать (конкретное действие, до 5-6 слов)",
      "description": "Как именно это реализовать на практике (развернуто, с примером)",
      "expectedResult": "На что это повлияет (ожидаемый эффект)"
    }
  ]
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
      console.error('OpenRouter Action Plan Error:', errorData);
      return NextResponse.json({ error: `Ошибка API OpenRouter: ${aiRes.status}` }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || 'Не удалось сгенерировать план.';

    let savedReport = null;
    if (summary !== 'Не удалось сгенерировать план.') {
      try {
        savedReport = await prisma.aiReport.create({
          data: {
            channelId: baseReport.channelId,
            type: 'action_plan',
            content: summary,
          }
        });
      } catch (dbError) {
        console.error('Failed to save AI report to DB:', dbError);
      }
    }

    return NextResponse.json({ summary, reportId: savedReport?.id });
  } catch (error: any) {
    console.error('AI Action Plan Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error.message || '') }, { status: 500 });
  }
}
