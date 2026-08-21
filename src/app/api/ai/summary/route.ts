import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
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
Ты опытный маркетолог и аналитик Telegram-каналов.
Проанализируй последние посты канала "${channel?.title || 'Unknown'}" и составь краткое, структурированное саммари (выжимку) их контент-стратегии.

Посты канала:
${contentToAnalyze.substring(0, 30000)} // Ограничиваем длину

Ответь в формате Markdown по следующей структуре:
1. **Основные темы**: О чем чаще всего пишет канал за последнее время.
2. **Тональность и подача**: Как автор общается с аудиторией (формально, с юмором, агрессивно, экспертно).
3. **Вовлечение**: Используются ли призывы к действию (CTA), опросы, вопросы к аудитории.
4. **Реклама и промо**: Есть ли рекламные посты или самопиар.
5. **Сильные стороны**: Что канал делает действительно хорошо и почему это цепляет аудиторию.
6. **Советы по улучшению**: Слабые места контента и конкретные рекомендации, что можно было бы усилить или изменить.
7. **Краткий вывод**: Общее впечатление от канала.
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
        model: 'google/gemini-3.7-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
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

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('AI Summary Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения. Серверы Google недоступны (возможно, нужна настройка VPN/Прокси)' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error.message || '') }, { status: 500 });
  }
}
