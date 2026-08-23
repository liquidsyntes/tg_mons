import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY не задан в .env файле' }, { status: 500 });
    }

    // Ищем каналы из Watchlist и свой канал
    const channels = await prisma.channel.findMany({
      where: {
        OR: [
          { isFavorite: true },
          { isMine: true }
        ],
        isActive: true
      },
      select: {
        id: true,
        title: true,
        username: true
      }
    });

    if (channels.length === 0) {
      return NextResponse.json({ error: 'Нет отслеживаемых каналов для анализа' }, { status: 404 });
    }

    const channelIds = channels.map(c => c.id);

    // Fetch posts for the last 48 hours with text
    const dateLimit = new Date(Date.now() - 48 * 3600 * 1000);
    const posts = await prisma.post.findMany({
      where: {
        channelId: { in: channelIds },
        publishedAt: { gte: dateLimit },
        text: { not: null, notIn: [''] },
      },
      orderBy: { publishedAt: 'desc' },
      take: 100, // Limit to avoid huge context token usage
      include: {
        channel: {
          select: { title: true }
        }
      }
    });

    if (posts.length === 0) {
      return NextResponse.json({ error: 'Нет текстовых постов за последние 48 часов для анализа' }, { status: 404 });
    }

    // Prepare text for AI, grouped by channel or just linear
    const contentToAnalyze = posts
      .map(p => `[Канал: ${p.channel.title}] [${p.publishedAt.toISOString()}] ${p.text}`)
      .join('\n\n---\n\n');

    const prompt = `
Ты опытный аналитик трендов и маркетолог в Telegram.

ЗАДАЧА
Проанализируй недавние посты из нескольких Telegram-каналов за последние 48 часов и выяви общие, пересекающиеся темы (тренды), о которых пишут сразу несколько авторов.

ИСХОДНЫЕ ДАННЫЕ
Посты каналов (склеены вместе, ограничено 30 000 символов):
${contentToAnalyze.substring(0, 30000)}

ПРАВИЛА АНАЛИЗА
- Ищи темы, которые обсуждаются как минимум в ДВУХ разных каналах.
- Если ярких пересечений нет, выдели просто самые важные и обсуждаемые темы (но укажи, что пишет об этом один канал).
- Опирайся только на предоставленный текст.
- Выдели РОВНО 4 главных тренда (ни больше, ни меньше), чтобы сетка карточек на дашборде выглядела симметрично. Если очевидных трендов меньше, выдели дополнительные интересные темы как тренды.

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке, независимо от языка исходных постов и контента канала.
- Приводимые цитаты из постов оставляй на языке оригинала (как написаны в постах).
- Все заголовки, описания, выводы, рекомендации, метки — только на русском.

ФОРМАТ ОТВЕТА (JSON)
Ответь СТРОГО в формате валидного JSON объекта по следующей схеме (БЕЗ использования markdown-блоков, просто чистый JSON):
{
  "trends": [
    {
      "topic": "Краткое название тренда",
      "description": "О чем именно пишут каналы, в чем суть обсуждения",
      "channels": ["Название Канала 1", "Название Канала 2"],
      "quote": "Короткая цитата из любого поста, иллюстрирующая тренд"
    }
  ],
  "summary": "Краткий вывод о ситуации в нише на основе этих данных (2-3 предложения)"
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
    const resultJsonStr = aiData.choices?.[0]?.message?.content || '{}';

    let parsedResult;
    try {
      parsedResult = JSON.parse(resultJsonStr);
    } catch (e) {
      console.error('Failed to parse AI JSON', e, resultJsonStr);
      return NextResponse.json({ error: 'ИИ вернул невалидный JSON' }, { status: 500 });
    }

    try {
      await prisma.aiReport.create({
        data: {
          channelId: null, // Глобальный отчет
          type: 'trend',
          content: resultJsonStr,
        }
      });
    } catch (dbError) {
      console.error('Failed to save AI report to DB:', dbError);
    }

    return NextResponse.json(parsedResult);
  } catch (error: any) {
    console.error('AI Trends Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error.message || '') }, { status: 500 });
  }
}
