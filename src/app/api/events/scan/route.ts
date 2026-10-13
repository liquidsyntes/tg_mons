import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callOpenRouter } from '@/lib/openrouter';
import { selectEventCandidatesWithJev } from '@/lib/events/jev';
import { isClearlyEventDigest } from '@/lib/events/digest';
import { isSameEvent } from '@/lib/events/matching';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // 1. Fetch posts from the last 14 days
    const dateLimit = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    
    // Using a simplistic case-insensitive text search approach in JS for now,
    // or we can fetch posts that match in DB.
    // For broader compatibility, let's fetch recent text posts and filter in JS.
    const recentPosts = await prisma.post.findMany({
      where: {
        publishedAt: { gte: dateLimit },
        text: { not: null },
        eventMentions: { none: {} } // Exclude already parsed posts
      },
      include: {
        channel: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 2000
    });

    const textPosts = recentPosts
      .filter(post => typeof post.text === 'string' && post.text.trim().length > 0)
      .map(post => ({ ...post, text: post.text ?? '' }))
      .filter(post => !isClearlyEventDigest(post.text));

    if (textPosts.length === 0) {
      return NextResponse.json({ success: true, savedCount: 0, parsedEvents: [], selectionMode: 'no_candidates' });
    }

    // Jev screens the full recent sample; keywords are only a fallback if it is unavailable.
    const selection = await selectEventCandidatesWithJev(textPosts);
    const keywords = ['вечеринка', 'старт', 'начало', 'билет', 'dj', 'вход', 'line-up', 'мероприятие', 'анонс', 'событие'];
    const selectedPosts = (selection.mode === 'jev'
      ? selection.posts
      : selection.posts.filter(post => keywords.some(keyword => post.text.toLowerCase().includes(keyword)))
    ).slice(0, 100);

    if (selectedPosts.length === 0) {
      return NextResponse.json({ success: true, savedCount: 0, parsedEvents: [], selectionMode: selection.mode });
    }

    // Format selected posts for the existing event extraction step.
    const payloadForAi = selectedPosts.map(p => ({
      id: p.id,
      channel: p.channel.title,
      date: p.publishedAt.toISOString(),
      text: p.text
    }));

    const prompt = `
Твоя задача — извлечь анонсы будущих мероприятий (вечеринки, концерты, лекции и т.д.) из предоставленных постов.

ВХОДНЫЕ ДАННЫЕ (JSON):
${JSON.stringify(payloadForAi)}

ПРАВИЛА:
1. Выбирай посты, главная цель которых пригласить на одно конкретное будущее мероприятие. Обзорная статья, реклама курса или отчёт о прошедшем занятии не становятся анонсом из-за списка будущих дат в конце.
2. Извлеки название (или суть) мероприятия, дату проведения, точное время (например, "с 22:00 до 05:00" или "20:00"), организатора (если указан) и виды/стоимость билетов. 
3. Билеты/цены должны быть массивом строк (например: ["Мужчины - 1000р", "Женщины - бесплатно", "Пары - 1500р"]).
4. ВАЖНО: Дедупликация! Одно и то же мероприятие часто рекламируется в разных каналах. Объедини их в одно событие. В массиве "sourcePostIds" перечисли ID всех постов, которые рекламируют это событие.
5. Возвращай только реальные будущие мероприятия с указанной датой. Разрешай относительную дату относительно даты публикации поста, но не угадывай отсутствующую или неточную дату. Верни дату мероприятия в формате YYYY-MM-DD.
6. Дайджесты и подборки нескольких самостоятельных мероприятий не обрабатывай: не создавай из них события и не включай их ID в sourcePostIds. Программа одного мероприятия, например фестиваля, дайджестом не считается.
7. Помимо даты в посте должна быть хотя бы одна конкретная деталь участия в том же мероприятии: время, место, онлайн-площадка, билет, регистрация или контакт. Одного тизера с датой недостаточно.

ФОРМАТ ОТВЕТА (JSON):
{
  "events": [
    {
      "title": "Название мероприятия",
      "date": "2026-09-01",
      "timeStr": "22:00 - 05:00",
      "organizer": "Имя или название (или null)",
      "prices": ["Категория 1: 500р", "Категория 2: 1000р"],
      "sourcePostIds": [101, 105, 203]
    }
  ]
}
`;

    const aiResponse = await callOpenRouter(prompt, { timeoutMs: 120000 });
    
    // Extract JSON in case AI wrapped it in markdown or added text
    let cleanResponse = aiResponse.trim();
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[0];
    }
    
    const parsed = JSON.parse(cleanResponse);
    const events = parsed.events || [];
    const selectedPostIds = new Set(selectedPosts.map(post => post.id));

    let savedCount = 0;

    // Keep dismissed events in the match set so new mentions cannot bring them back to the calendar.
    const recentDbEvents = await prisma.event.findMany({
      where: { date: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } }
    });

    // Save to DB
    for (const evt of events) {
      const sourcePostIds: number[] = Array.isArray(evt.sourcePostIds)
        ? evt.sourcePostIds.filter((id: unknown): id is number =>
            typeof id === 'number' && Number.isSafeInteger(id) && selectedPostIds.has(id))
        : [];
      if (!evt.title || !evt.date || sourcePostIds.length === 0) continue;
      
      const eventDate = new Date(evt.date);
      
      // Try to find if this event already exists
      let targetEvent = recentDbEvents.find(dbEvt => isSameEvent(dbEvt, {
        title: evt.title,
        date: eventDate,
        timeStr: typeof evt.timeStr === 'string' ? evt.timeStr : null,
        organizer: typeof evt.organizer === 'string' ? evt.organizer : null,
      }));

      if (!targetEvent) {
        targetEvent = await prisma.event.create({
          data: {
            title: evt.title,
            date: eventDate,
            timeStr: evt.timeStr,
            organizer: evt.organizer,
            prices: evt.prices ? evt.prices : [],
          }
        });
        recentDbEvents.push(targetEvent);
        savedCount++;
      } else {
        // If event exists, we might want to update prices if they were missing, but for now just link it
      }

      for (const pid of sourcePostIds) {
        try {
          await prisma.eventMention.upsert({
            where: { eventId_postId: { eventId: targetEvent.id, postId: pid } },
            create: { eventId: targetEvent.id, postId: pid },
            update: {}
          });
        } catch (err) {
          logger.warn('Could not link mention', undefined, err);
        }
      }
    }

    return NextResponse.json({ success: true, savedCount, parsedEvents: events, selectionMode: selection.mode });
  } catch (error: any) {
    logger.error('Error scanning events:', undefined, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
