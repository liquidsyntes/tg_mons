import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';
import { callOpenRouter } from '@/lib/openrouter';
import { saveAiReport } from '@/lib/ai-reports';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { reportId } = await req.json();

    if (!reportId) {
      return NextResponse.json({ error: 'Необходимо указать ID отчета.' }, { status: 400 });
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

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке, независимо от языка исходных постов и контента канала.
- Приводимые цитаты из постов оставляй на языке оригинала (как написаны в постах).
- Все заголовки, описания, выводы, рекомендации, метки — только на русском.

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

    const result = await callOpenRouter(prompt);
    await saveAiReport(baseReport.channelId, 'action_plan', result);
    return NextResponse.json({ summary: result });
  } catch (error: any) {
    console.error('AI Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}