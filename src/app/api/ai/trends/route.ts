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

    // Ищем каналы из Watchlist и свой канал
    let channels: Array<{ id: number; title: string; username: string | null }>;
    if (authCheck.userId && typeof prisma.userChannel?.findMany === 'function') {
      const subs = await prisma.userChannel.findMany({
        where: {
          userId: authCheck.userId,
          isActive: true,
          OR: [{ isFavorite: true }, { isMine: true }],
          channel: { isActive: true },
        },
        select: {
          channel: { select: { id: true, title: true, username: true } },
        },
      });
      if (subs.length > 0) {
        channels = subs.map((s) => s.channel);
      } else {
        const allUserSubs = await prisma.userChannel.findMany({
          where: { userId: authCheck.userId, isActive: true, channel: { isActive: true } },
          select: { channel: { select: { id: true, title: true, username: true } } },
        });
        channels = allUserSubs.map((s) => s.channel);
      }
    } else {
      channels = await prisma.channel.findMany({
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
    }

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
        text: { not: null },
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