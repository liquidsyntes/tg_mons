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

    // Find the target channel
    const targetChannel = await prisma.channel.findUnique({ where: { id: Number(channelId) } });
    if (!targetChannel) {
      return NextResponse.json({ error: 'Целевой канал не найден' }, { status: 404 });
    }

    // Find "my channel"
    const myChannel = await prisma.channel.findFirst({ where: { isMine: true } });
    if (!myChannel) {
      return NextResponse.json({ error: 'Сначала назначьте один из каналов "Вашим каналом" на главной странице' }, { status: 400 });
    }

    if (myChannel.id === targetChannel.id) {
      return NextResponse.json({ error: 'Нельзя сравнивать канал с самим собой' }, { status: 400 });
    }

    // Fetch posts for both channels
    const dateLimit = new Date(Date.now() - days * 24 * 3600 * 1000);
    
    const targetPosts = await prisma.post.findMany({
      where: { channelId: targetChannel.id, publishedAt: { gte: dateLimit }, text: { not: null, notIn: [''] } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    const myPosts = await prisma.post.findMany({
      where: { channelId: myChannel.id, publishedAt: { gte: dateLimit }, text: { not: null, notIn: [''] } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    if (targetPosts.length === 0 || myPosts.length === 0) {
      return NextResponse.json({ error: 'Недостаточно текстовых постов для сравнения. Убедитесь, что для обоих каналов собраны тексты.' }, { status: 400 });
    }

    const targetContent = targetPosts.map(p => `[${p.publishedAt.toISOString()}] ${p.text}`).join('\n\n---\n\n');
    const myContent = myPosts.map(p => `[${p.publishedAt.toISOString()}] ${p.text}`).join('\n\n---\n\n');

    const prompt = `
Ты опытный маркетолог и аналитик Telegram-каналов.
Твоя задача — провести глубокий сравнительный анализ двух Telegram-каналов на основе их последних постов.

Канал 1 (Мой канал): "${myChannel.title}"
Канал 2 (Конкурент): "${targetChannel.title}"

--- ПОСТЫ МОЕГО КАНАЛА ---
${myContent.substring(0, 15000)}

--- ПОСТЫ КАНАЛА КОНКУРЕНТА ---
${targetContent.substring(0, 15000)}

Сделай сравнительный анализ в формате Markdown по следующей структуре:
1. **Различия в контент-стратегии**: Чем кардинально отличаются подходы к созданию постов (темы, рубрики, длина текстов).
2. **Tone of Voice (Тональность)**: Сравнение стиля общения с аудиторией у обоих каналов. Кто звучит выигрышнее и почему?
3. **Преимущества конкурента**: Что канал конкурента делает лучше, чем "Мой канал"? Какие фишки стоит у него перенять?
4. **Наши сильные стороны**: В чем "Мой канал" однозначно превосходит конкурента?
5. **Точки роста и советы**: 3-5 конкретных рекомендаций для "Моего канала", как улучшить контент и обойти конкурента.
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
      console.error('OpenRouter Compare Error:', errorData);
      return NextResponse.json({ error: `Ошибка API OpenRouter: ${aiRes.status}` }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || 'Не удалось сгенерировать сравнение.';

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('AI Compare Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error.message || '') }, { status: 500 });
  }
}
