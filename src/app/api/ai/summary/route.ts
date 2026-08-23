import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { channelId, days = 7 } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY не задан в .env файле' }, { status: 500 });
    }

    // Fetch posts for the last N days with text
    const dateLimit = new Date(Date.now() - days * 24 * 3600 * 1000);
    const posts = await prisma.post.findMany({
      where: {
        channelId: Number(channelId),
        publishedAt: { gte: dateLimit },
        text: { not: null, notIn: [''] },
      },
      orderBy: { publishedAt: 'desc' },
      take: 50, // Limit to 50 posts to avoid huge token usage
    });

    if (posts.length === 0) {
      return NextResponse.json({ error: 'Нет текстовых постов за выбранный период для анализа' }, { status: 404 });
    }

    const channel = await prisma.channel.findUnique({ where: { id: Number(channelId) } });

    // Prepare text for AI
    const contentToAnalyze = posts
      .map(p => `[${p.publishedAt.toISOString()}] ${p.text}`)
      .join('\n\n---\n\n');

    const prompt = `
Ты опытный маркетолог и аналитик Telegram-каналов с опытом контент-стратегии и SMM.

ЗАДАЧА
Проанализируй посты канала "${channel?.title || 'Unknown'}" за последние ${days} дней и составь структурированное саммари его контент-стратегии. Саммари должно быть пригодно для практического использования: чтобы автор канала или SMM-специалист мог принять решения по улучшению контента.

ИСХОДНЫЕ ДАННЫЕ
Посты канала (склеены вместе, ограничено 30 000 символов):
${contentToAnalyze.substring(0, 30000)}

ПРАВИЛА АНАЛИЗА
- Опирайся только на предоставленный текст. Не придумывай факты, цифры или примеры, которых нет в постах.
- Если постов слишком мало (менее 5) или они однотипны, явно укажи это как ограничение анализа в начале ответа.
- Для каждого содержательного пункта приводи 1-2 короткие цитаты из постов (в кавычках) как доказательство вывода.
- Где возможно, давай количественные оценки (например: "из ~20 постов 6 содержат прямой вопрос к аудитории", "рекламные посты составляют примерно 15% от объёма").
- Рекомендации должны быть конкретными и выполнимыми — не "усилить вовлечение", а "добавить закрытый вопрос с вариантами ответа в конце тем, где сейчас нет CTA".

АНТИ-СИКОФАНСИЯ (обязательно к соблюдению)
- Не хвали контент по умолчанию и не пытайся быть "приятным" — твоя ценность в честной, взвешенной оценке, а не в комплиментах.
- На каждый плюс в разделе "Сильные стороны" находи минимум один сопоставимый минус или риск в разделе "Слабые места" — если объективно сильных сторон меньше, чем слабых, отражай это соотношение открыто, а не уравнивай искусственно.
- Избегай общих хвалебных формулировок ("отличный канал", "прекрасно вовлекает аудиторию", "качественный контент") без конкретного доказательства через цитату и объяснение механизма.
- Если канал посредственный, шаблонный или использует избитые приёмы — прямо назови это, даже если тема или ниша выглядит успешной.
- В "Кратком выводе" не сглаживай итог ради вежливости: если приоритет улучшений выше, чем повод для похвалы, отражай это соотношение в тоне вывода.
- Оценивай контент так, как если бы автор не видел этот анализ — не подстраивай выводы под предполагаемые ожидания или самолюбие автора канала.

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
      console.error('OpenRouter Error:', errorData);
      return NextResponse.json({ error: `Ошибка API OpenRouter: ${aiRes.status}` }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || 'Не удалось сгенерировать саммари.';

    if (summary !== 'Не удалось сгенерировать саммари.') {
      try {
        await prisma.aiReport.create({
          data: {
            channelId: Number(channelId),
            type: 'summary',
            content: summary,
          }
        });
      } catch (dbError) {
        console.error('Failed to save AI report to DB:', dbError);
        // We still return the summary even if it fails to save
      }
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('AI Summary Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения. Серверы Google недоступны (возможно, нужна настройка VPN/Прокси)' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error.message || '') }, { status: 500 });
  }
}
