import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';
import { callOpenRouter } from '@/lib/openrouter';
import { handleAiRouteError, saveAiReport } from '@/lib/ai-reports';

export const dynamic = 'force-dynamic';

interface ChannelCandidate {
  id: number;
  title: string;
  username: string | null;
  niche: string | null;
  isMine?: boolean;
}

interface GapPostRow {
  id: number;
  channelId: number;
  publishedAt: Date;
  text: string | null;
  views: number | null;
  reactions: number | null;
  comments: number | null;
  forwards: number | null;
}

function calculatePostErrPercent(post: GapPostRow): number {
  const views = post.views ?? 0;
  if (views <= 0) return 0;
  const interactions = (post.reactions ?? 0) + (post.comments ?? 0) + (post.forwards ?? 0);
  return Math.round((interactions / views) * 1000) / 10;
}

function calculateMedian(values: number[]): number {
  const positive = values.filter(v => v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return 1;
  const mid = Math.floor(positive.length / 2);
  return positive.length % 2 === 1
    ? positive[mid]
    : (positive[mid - 1] + positive[mid]) / 2;
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;

    const body = (await req.json().catch(() => ({}))) as {
      myChannelId?: unknown;
      days?: unknown;
    };

    const requestedMyChannelId =
      body.myChannelId !== undefined && body.myChannelId !== null && Number.isSafeInteger(Number(body.myChannelId)) && Number(body.myChannelId) > 0
        ? Number(body.myChannelId)
        : null;
    const rawDays = Number(body.days);
    const safeDays = Number.isFinite(rawDays) && rawDays >= 1 ? Math.min(30, Math.floor(rawDays)) : 14;

    let myChannel: ChannelCandidate | null = null;
    let competitorPool: ChannelCandidate[] = [];

    if (authCheck.userId && typeof prisma.userChannel?.findMany === 'function') {
      const subs = await prisma.userChannel.findMany({
        where: {
          userId: authCheck.userId,
          isActive: true,
          channel: { isActive: true },
        },
        select: {
          isMine: true,
          channel: {
            select: { id: true, title: true, username: true, niche: true },
          },
        },
      });

      const targetSub = requestedMyChannelId
        ? subs.find(s => s.channel.id === requestedMyChannelId)
        : subs.find(s => s.isMine);

      myChannel = targetSub?.channel ?? null;
      competitorPool = subs
        .map(s => s.channel)
        .filter(ch => !myChannel || ch.id !== myChannel.id);
    } else {
      const allChannels = await prisma.channel.findMany({
        where: { isActive: true },
        select: { id: true, title: true, username: true, niche: true, isMine: true },
      });

      myChannel = requestedMyChannelId
        ? (allChannels.find(c => c.id === requestedMyChannelId) ?? null)
        : (allChannels.find(c => c.isMine) ?? null);
      competitorPool = allChannels.filter(ch => !myChannel || ch.id !== myChannel.id);
    }

    if (!myChannel) {
      return NextResponse.json(
        { error: 'Сначала назначьте один из каналов "Вашим каналом" на главной странице' },
        { status: 400 },
      );
    }

    if (competitorPool.length === 0) {
      return NextResponse.json(
        { error: 'Добавьте хотя бы один активный канал конкурента для анализа упущенных тем' },
        { status: 400 },
      );
    }

    const sameNicheCompetitors = myChannel.niche
      ? competitorPool.filter(c => c.niche === myChannel.niche)
      : [];
    const selectedCompetitors =
      sameNicheCompetitors.length >= 2 ? sameNicheCompetitors : competitorPool;
    const competitorById = new Map(selectedCompetitors.map(c => [c.id, c]));

    const dateLimit = new Date(Date.now() - safeDays * 24 * 3600 * 1000);
    const [myPostsRaw, competitorPostsRaw] = await Promise.all([
      prisma.post.findMany({
        where: {
          channelId: myChannel.id,
          publishedAt: { gte: dateLimit },
          text: { not: null },
        },
        orderBy: { publishedAt: 'desc' },
        take: 40,
        select: {
          id: true,
          channelId: true,
          publishedAt: true,
          text: true,
          views: true,
          reactions: true,
          comments: true,
          forwards: true,
        },
      }),
      prisma.post.findMany({
        where: {
          channelId: { in: selectedCompetitors.map(c => c.id) },
          publishedAt: { gte: dateLimit },
          text: { not: null },
        },
        orderBy: { publishedAt: 'desc' },
        take: 300,
        select: {
          id: true,
          channelId: true,
          publishedAt: true,
          text: true,
          views: true,
          reactions: true,
          comments: true,
          forwards: true,
        },
      }),
    ]);

    const myPosts = (myPostsRaw as GapPostRow[]).filter(p => Boolean(p.text?.trim()));
    const competitorPosts = (competitorPostsRaw as GapPostRow[]).filter(p => Boolean(p.text?.trim()));

    if (competitorPosts.length === 0) {
      return NextResponse.json(
        { error: 'Недостаточно текстовых постов у конкурентов за выбранный период' },
        { status: 400 },
      );
    }

    const viewsByCompetitor = new Map<number, number[]>();
    for (const post of competitorPosts) {
      const list = viewsByCompetitor.get(post.channelId) ?? [];
      list.push(post.views ?? 0);
      viewsByCompetitor.set(post.channelId, list);
    }
    const medianViewsByCompetitor = new Map<number, number>();
    for (const [channelId, values] of viewsByCompetitor.entries()) {
      medianViewsByCompetitor.set(channelId, calculateMedian(values));
    }

    const topCompetitorPosts = [...competitorPosts]
      .sort((left, right) => {
        const leftMedian = medianViewsByCompetitor.get(left.channelId) ?? 1;
        const rightMedian = medianViewsByCompetitor.get(right.channelId) ?? 1;
        const leftScore = (left.views ?? 0) / leftMedian + calculatePostErrPercent(left) / 10;
        const rightScore = (right.views ?? 0) / rightMedian + calculatePostErrPercent(right) / 10;
        return rightScore - leftScore;
      })
      .slice(0, 60);

    const myPostsContent = myPosts.length > 0
      ? myPosts
          .map(p => {
            const err = calculatePostErrPercent(p);
            return `[${p.publishedAt.toISOString()}] [Просмотры: ${p.views ?? 0}, ERR: ${err}%] ${(p.text ?? '').slice(0, 700)}`;
          })
          .join('\n\n---\n\n')
          .slice(0, 12000)
      : 'За выбранный период в "Моем канале" нет текстовых публикаций.';

    const competitorPostsContent = topCompetitorPosts
      .map(p => {
        const chTitle = competitorById.get(p.channelId)?.title || `Канал #${p.channelId}`;
        const median = medianViewsByCompetitor.get(p.channelId) ?? 1;
        const multiplier = Math.round(((p.views ?? 0) / median) * 10) / 10;
        const err = calculatePostErrPercent(p);
        return `[Канал: ${chTitle}] [${p.publishedAt.toISOString()}] [Просмотры: ${p.views ?? 0} (${multiplier}x к медиане), ERR: ${err}%] ${(p.text ?? '').slice(0, 700)}`;
      })
      .join('\n\n---\n\n')
      .slice(0, 18000);

    const prompt = `
Ты опытный контент-стратег и аналитик Telegram-каналов.

ЗАДАЧА
Проведи анализ упущенных тем (Content Gap) для канала "${myChannel.title}" за последние ${safeDays} дн.
Сопоставь публикации "Моего канала" с самыми успешными по охвату и вовлечённости постами конкурентов и выяви:
1. Темы и форматы, которые дали высокий отклик у конкурентов, но НЕ освещались в "Моем канале" (missingTopics).
2. Темы, которые освещались и у нас, и у конкурентов — сравни, почему у кого-то отклик оказался выше и как нам усилить подачу (coveredTopicsComparison).
3. Три готовые идеи публикаций ("быстрые победы" / quickWins), которые можно выпустить в ближайшие дни.

--- ПОСТЫ МОЕГО КАНАЛА "${myChannel.title}" (до 12 000 символов) ---
${myPostsContent}

--- ЛУЧШИЕ ПОСТЫ КОНКУРЕНТОВ (до 18 000 символов) ---
${competitorPostsContent}

ПРАВИЛА АНАЛИЗА
- Опирайся СТРОГО на предоставленные посты и метрики. Не выдумывай факты или каналы.
- Приводи короткие цитаты из постов конкурентов на языке оригинала.
- Весь аналитический текст, выводы и заголовки формируй СТРОГО на русском языке.

ФОРМАТ ОТВЕТА (JSON)
Ответь СТРОГО в формате валидного JSON объекта по следующей схеме (БЕЗ markdown-обёртки):
{
  "summary": "Краткое резюме контентного разрыва (2-3 предложения: что главного мы упускаем и где точка быстрого роста)",
  "missingTopics": [
    {
      "topic": "Название упущенной темы",
      "whyItWorked": "Почему эта тема дала высокий охват/ERR у конкурентов (триггер, подача, актуальность)",
      "competitorChannels": ["Название канала 1", "Название канала 2"],
      "engagementPotential": "Высокий / Очень высокий (с указанием ориентира по множителю охвата или ERR)",
      "suggestedAngle": "Конкретный угол подачи и формат для публикации в канале «${myChannel.title}»",
      "quote": "Короткая цитата из успешного поста конкурента"
    }
  ],
  "coveredTopicsComparison": [
    {
      "topic": "Общая тема",
      "myPerformance": "Как тема подана у нас и какой дала отклик",
      "competitorPerformance": "Как тема подана у конкурентов и почему сработала иначе",
      "improvementTip": "Конкретный совет по усилению подачи"
    }
  ],
  "quickWins": [
    {
      "headline": "Готовый цепляющий заголовок поста",
      "format": "Формат (например: Разбор кейса / Карточки / Чек-лист / Опрос)",
      "hook": "Первые 2-3 предложения (заход/хук) и структура будущего поста"
    }
  ]
}
`;

    const result = await callOpenRouter(prompt);
    const reportId = await saveAiReport(myChannel.id, 'content-gap', result, authCheck.userId);
    return NextResponse.json({ contentGap: result, reportId });
  } catch (error: unknown) {
    return handleAiRouteError(error);
  }
}
