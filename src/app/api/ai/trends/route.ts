import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';
import { callOpenRouter } from '@/lib/openrouter';
import { handleAiRouteError, saveAiReport } from '@/lib/ai-reports';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;

    // Анализируем все активные каналы из списка пользователя.
    let channels: Array<{ id: number; title: string; username: string | null }>;
    if (authCheck.userId && typeof prisma.userChannel?.findMany === 'function') {
      const subs = await prisma.userChannel.findMany({
        where: {
          userId: authCheck.userId,
          isActive: true,
          channel: { isActive: true },
        },
        select: {
          channel: { select: { id: true, title: true, username: true } },
        },
      });
      channels = subs.map((s) => s.channel);
    } else {
      channels = await prisma.channel.findMany({
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          username: true
        }
      });
    }

    if (channels.length === 0) {
      return NextResponse.json({ error: 'Нет отслеживаемых каналов для анализа' }, { status: 404 });
    }

    const channelIds = channels.map(c => c.id);

    // Fetch posts for the last 48 hours with text
    const dateLimit = new Date(Date.now() - 48 * 3600 * 1000);
    const postsByChannel = await Promise.all(channelIds.map(channelId => prisma.post.findMany({
      where: { channelId, publishedAt: { gte: dateLimit }, text: { not: null } },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      select: { publishedAt: true, text: true },
    })));

    if (postsByChannel.every(posts => posts.length === 0)) {
      return NextResponse.json({ error: 'Нет текстовых постов за последние 48 часов для анализа' }, { status: 404 });
    }

    // Чередуем каналы, чтобы поток постов одного канала не занял весь контекст.
    const excerpts: string[] = [];
    let remaining = 30000;
    const excerptLength = Math.min(1500, Math.max(100, Math.floor(27000 / channels.length) - 100));
    for (let index = 0; index < 10 && remaining > 0; index++) {
      for (let channelIndex = 0; channelIndex < channels.length && remaining > 0; channelIndex++) {
        const post = postsByChannel[channelIndex][index];
        if (!post?.text?.trim()) continue;
        const excerpt = `[Канал: ${channels[channelIndex].title}] [${post.publishedAt.toISOString()}] ${post.text.slice(0, excerptLength)}`;
        const available = remaining - (excerpts.length ? 7 : 0);
        if (available <= 0) break;
        excerpts.push(excerpt.slice(0, available));
        remaining -= Math.min(excerpt.length, available) + (excerpts.length > 1 ? 7 : 0);
      }
    }
    const contentToAnalyze = excerpts.join('\n\n---\n\n');

    const prompt = `
Ты опытный аналитик трендов и маркетолог в Telegram.

ЗАДАЧА
Проанализируй недавние посты из нескольких Telegram-каналов за последние 48 часов и выяви общие, пересекающиеся темы (тренды), о которых пишут сразу несколько авторов.

ИСХОДНЫЕ ДАННЫЕ
Посты каналов (склеены вместе, ограничено 30 000 символов):
${contentToAnalyze}

ПРАВИЛА АНАЛИЗА
- Ищи темы, которые обсуждаются как минимум в ДВУХ разных каналах.
- Если ярких пересечений нет, выдели просто самые важные и обсуждаемые темы (но укажи, что пишет об этом один канал).
- Опирайся только на предоставленный текст.
- Выдели до 4 главных тем. Если данных мало, верни меньше тем; не придумывай дополнительные новости ради количества карточек.

ЯЗЫК ОТВЕТА (ОБЯЗАТЕЛЬНО)
- Весь отчёт формируй СТРОГО на русском языке, независимо от языка исходных постов и контента канала.
- Приводимые цитаты из постов оставляй на языке оригинала (как написаны в постах).
- Все заголовки, описания, выводы, рекомендации, метки - только на русском.

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

    const result = await callOpenRouter(prompt);
    await saveAiReport(null, 'trend', result, authCheck.userId);
    try {
      const parsed = JSON.parse(result);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: 'ИИ вернул невалидный JSON' }, { status: 500 });
    }
  } catch (error: unknown) {
    return handleAiRouteError(error);
  }
}
