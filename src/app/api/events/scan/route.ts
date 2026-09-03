import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callOpenRouter } from '@/lib/openrouter';

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

    const keywords = ['вечеринка', 'старт', 'начало', 'билет', 'dj', 'вход', 'line-up', 'мероприятие', 'анонс', 'событие'];
    
    // Filter posts that contain any of the keywords
    const candidatePosts = recentPosts.filter(p => {
      if (!p.text) return false;
      const lower = p.text.toLowerCase();
      return keywords.some(kw => lower.includes(kw));
    });

    if (candidatePosts.length === 0) {
      return NextResponse.json({ message: 'No new candidate posts found to scan.' });
    }

    // Format posts for AI
    const payloadForAi = candidatePosts.map(p => ({
      id: p.id,
      channel: p.channel.title,
      date: p.publishedAt.toISOString(),
      text: p.text
    }));

    // If there are too many candidate posts, we limit to avoid token limits
    const limitedPayload = payloadForAi.slice(0, 100);

    const prompt = `
Твоя задача — извлечь анонсы будущих мероприятий (вечеринки, концерты, лекции и т.д.) из предоставленных постов.

ВХОДНЫЕ ДАННЫЕ (JSON):
${JSON.stringify(limitedPayload)}

ПРАВИЛА:
1. Найди все посты, где анонсируется конкретное мероприятие.
2. Извлеки название (или суть) мероприятия, дату проведения, точное время (например, "с 22:00 до 05:00" или "20:00"), организатора (если указан) и виды/стоимость билетов. 
3. Билеты/цены должны быть массивом строк (например: ["Мужчины - 1000р", "Женщины - бесплатно", "Пары - 1500р"]).
4. ВАЖНО: Дедупликация! Одно и то же мероприятие часто рекламируется в разных каналах. Объедини их в одно событие. В массиве "sourcePostIds" перечисли ID всех постов, которые рекламируют это событие.
5. Возвращай только реальные будущие мероприятия, описанные в тексте. Высчитай год/месяц исходя из даты публикации поста (дата поста есть в поле date). Верни дату мероприятия в формате YYYY-MM-DD. Если дата неточная, попытайся угадать ближайшую к публикации.

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

    let savedCount = 0;

    // Pre-fetch recent events from DB to deduplicate across scan runs
    const recentDbEvents = await prisma.event.findMany({
      where: { date: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } }
    });

    // Save to DB
    for (const evt of events) {
      if (!evt.title || !evt.date) continue;
      
      const eventDate = new Date(evt.date);
      
      // Try to find if this event already exists
      let targetEvent = recentDbEvents.find(dbEvt => {
        if (dbEvt.date.getTime() !== eventDate.getTime()) return false;
        const t1 = dbEvt.title.toLowerCase();
        const t2 = evt.title.toLowerCase();
        return t1 === t2 || t1.includes(t2) || t2.includes(t1);
      });

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

      if (evt.sourcePostIds && Array.isArray(evt.sourcePostIds)) {
        for (const pid of evt.sourcePostIds) {
          // Verify post exists in our candidate list
          const exists = candidatePosts.find(p => p.id === pid);
          if (exists) {
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
      }
    }

    return NextResponse.json({ success: true, savedCount, parsedEvents: events });
  } catch (error: any) {
    logger.error('Error scanning events:', undefined, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
