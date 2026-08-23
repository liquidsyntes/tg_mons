import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { channelId, days = 7 } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: 'channelId обязателен' }, { status: 400 });
    }

    // Достаем посты канала за последние X дней
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const posts = await prisma.post.findMany({
      where: {
        channelId: Number(channelId),
        publishedAt: { gte: dateLimit },
        text: { not: null, not: '' }
      },
      orderBy: { publishedAt: 'desc' },
      take: 20
    });

    if (posts.length === 0) {
      return NextResponse.json({ error: 'Нет текстовых постов для анализа' }, { status: 400 });
    }

    const postsText = posts.map(p => p.text).join('\n---\n');

    const prompt = `
Проанализируй контент этого Telegram-канала и составь подробный портрет его предполагаемой целевой аудитории.

Тексты последних постов:
${postsText}

Твоя задача — выяснить, ДЛЯ КОГО пишется этот контент, какие у этих людей боли, интересы, уровень дохода и возраст.

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке, независимо от языка исходных постов и контента канала.
- Приводимые цитаты из постов оставляй на языке оригинала (как написаны в постах).
- Все заголовки, описания, выводы, рекомендации, метки — только на русском.

Ответь строго в формате JSON, используя следующую структуру:
{
  "demographics": {
    "age": "Примерный возраст",
    "gender": "Преобладающий пол (если есть)",
    "income": "Уровень дохода (предполагаемый)",
    "geo": "География (если прослеживается)"
  },
  "psychographics": {
    "interests": ["Интерес 1", "Интерес 2", "Интерес 3"],
    "values": ["Ценность 1", "Ценность 2"],
    "fears": ["Страх/Боль 1", "Страх/Боль 2"]
  },
  "behavior": {
    "contentConsumption": "Как они потребляют контент (на бегу, вдумчиво читают лонгриды, ищут мемы и т.д.)",
    "engagementReason": "Почему они подписаны на этот канал? Что он им дает?"
  },
  "summary": "Краткое резюме (1-2 предложения) — кто этот типичный подписчик."
}
`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY не задан в .env файле' }, { status: 500 });
    }

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'TG Monitor',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-pro',
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: 'Ты профессиональный маркетолог. Ты должен выдать ответ строго в JSON формате согласно запрошенной структуре.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      throw new Error(`OpenRouter API Error: ${errText}`);
    }

    const aiData = await openRouterRes.json();
    let contentStr = aiData.choices?.[0]?.message?.content || '{}';
    
    // Clean up potential markdown formatting in response
    if (contentStr.startsWith('```json')) {
      contentStr = contentStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }

    const parsedResponse = JSON.parse(contentStr);

    // Сохраняем отчет в БД
    const report = await prisma.aiReport.create({
      data: {
        channelId: Number(channelId),
        type: 'audience',
        content: JSON.stringify(parsedResponse)
      }
    });

    return NextResponse.json({
      success: true,
      reportId: report.id,
      audience: JSON.stringify(parsedResponse)
    });

  } catch (error: any) {
    console.error('AI Audience Analysis error:', error);
    return NextResponse.json({ error: error.message || 'Ошибка генерации отчета' }, { status: 500 });
  }
}
