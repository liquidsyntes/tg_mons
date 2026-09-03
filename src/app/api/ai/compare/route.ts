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
    const { channelId, days = 7 } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
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
      where: { channelId: targetChannel.id, publishedAt: { gte: dateLimit }, text: { not: null } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    const myPosts = await prisma.post.findMany({
      where: { channelId: myChannel.id, publishedAt: { gte: dateLimit }, text: { not: null } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    if (targetPosts.length === 0 || myPosts.length === 0) {
      return NextResponse.json({ error: 'Недостаточно текстовых постов для сравнения. Убедитесь, что для обоих каналов собраны тексты.' }, { status: 400 });
    }

    const targetContent = targetPosts.map(p => `[${p.publishedAt.toISOString()}] ${p.text}`).join('\n\n---\n\n');
    const myContent = myPosts.map(p => `[${p.publishedAt.toISOString()}] ${p.text}`).join('\n\n---\n\n');

    const prompt = `
Ты опытный маркетолог и аналитик Telegram-каналов с опытом конкурентного анализа и SMM-стратегии.

ЗАДАЧА
Проведи объективный сравнительный анализ двух Telegram-каналов на основе их последних постов. Результат должен помочь владельцу "Моего канала" принять конкретные решения по контент-стратегии.

Канал 1 (Мой канал): "${myChannel.title}"
Канал 2 (Конкурент): "${targetChannel.title}"

--- ПОСТЫ МОЕГО КАНАЛА (ограничено 15 000 символов) ---
${myContent.substring(0, 15000)}

--- ПОСТЫ КАНАЛА КОНКУРЕНТА (ограничено 15 000 символов) ---
${targetContent.substring(0, 15000)}

ПРАВИЛА АНАЛИЗА
- Опирайся только на предоставленные тексты. Не придумывай факты, метрики вовлечения (лайки, просмотры, репосты) или подписчиков, которых нет в тексте постов.
- Если объём или количество постов у каналов сильно различается, укажи это как ограничение в начале ответа.
- Для каждого вывода приводи 1-2 цитаты (в кавычках, с указанием канала) как доказательство.
- Где возможно — количественные оценки (доля постов по темам, доля с CTA, средняя длина постов и т.п.).

ОБЪЕКТИВНОСТЬ (обязательно к соблюдению)
- Анализируй оба канала по единому стандарту. То, что канал 1 принадлежит пользователю, не должно влиять на оценку.
- Если конкурент объективно сильнее по большинству параметров, прямо скажи это, не смягчая формулировки ради поддержки пользователя.
- Избегай шаблонных фраз без доказательств — каждое утверждение подтверждай цитатой или паттерном.
- Раздел "Наши сильные стороны" не обязателен по объёму — если объективных преимуществ мало, честно отрази это.

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке, независимо от языка исходных постов и контента канала.
- Приводимые цитаты из постов оставляй на языке оригинала (как написаны в постах).
- Все заголовки, описания, выводы, рекомендации, метки — только на русском.

ФОРМАТ ОТВЕТА (JSON)
Ответь СТРОГО в формате валидного JSON объекта по следующей схеме (БЕЗ использования markdown-блоков, просто чистый JSON):
{
  "limitations": "Разница в объеме/количестве постов, узкий охват тем и т.д. Если нет ограничений, оставь пустую строку",
  "comparisonTable": [
    { "parameter": "Основные темы", "myChannel": "...", "competitor": "..." },
    { "parameter": "Средняя длина постов", "myChannel": "...", "competitor": "..." },
    { "parameter": "Частота CTA/вопросов", "myChannel": "...", "competitor": "..." },
    { "parameter": "Доля рекламы/промо", "myChannel": "...", "competitor": "..." },
    { "parameter": "Общая тональность", "myChannel": "...", "competitor": "..." }
  ],
  "strategy": {
    "text": "Развернуто о темах, рубриках, форматах.",
    "myQuote": "Цитата из моего канала",
    "competitorQuote": "Цитата из канала конкурента"
  },
  "tone": {
    "text": "Сравнение стиля общения.",
    "winner": "Кто звучит убедительнее и почему (конкретный механизм)"
  },
  "competitorAdvantages": [
    { "title": "Преимущество 1", "description": "Что делает лучше", "isTransferable": "Можно ли перенять на мой канал (Да/Нет/Частично)" }
  ],
  "myStrengths": [
    { "title": "Сильная сторона 1", "description": "В чем мой канал превосходит" }
  ],
  "recommendations": [
    { "recommendation": "Суть рекомендации", "effect": "Что даст (ожидаемый эффект)", "difficulty": "Низкая/Средняя/Высокая" }
  ],
  "conclusion": {
    "summary": "Честная оценка текущего разрыва (в чью пользу и насколько существенно)",
    "priority": "Один главный приоритет на ближайший месяц"
  }
}
`;

    const result = await callOpenRouter(prompt);
    await saveAiReport(Number(channelId), 'compare', result);
    return NextResponse.json({ summary: result });
  } catch (error: any) {
    logger.error('AI Error', undefined, error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Таймаут соединения с API.' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}