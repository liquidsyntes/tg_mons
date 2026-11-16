import { buildExtractionPrompt } from '@/lib/events/extraction';
import { keywordCandidate } from '@/lib/events/decisions';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';
import { callOpenRouter } from '@/lib/openrouter';
import { selectEventCandidatesWithJev } from '@/lib/events/jev';
import { isClearlyEventDigest } from '@/lib/events/digest';
import { isSameEvent, mergeDuplicateEventsInDb } from '@/lib/events/matching';

export const dynamic = 'force-dynamic';

async function markPostsScanned(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.post.updateMany({
    where: { id: { in: ids }, eventsScannedAt: null },
    data: { eventsScannedAt: new Date() },
  });
}

export async function POST(request: NextRequest) {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
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
        eventsScannedAt: null,
        eventMentions: { none: {} } // Exclude already parsed posts
      },
      include: {
        channel: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 2000
    });

    const ignoredPosts = recentPosts.filter(post =>
      !post.text?.trim() || isClearlyEventDigest(post.text));
    await markPostsScanned(ignoredPosts.map(post => post.id));

    const textPosts = recentPosts
      .filter(post => typeof post.text === 'string' && post.text.trim().length > 0)
      .map(post => ({ ...post, text: post.text ?? '' }))
      .filter(post => !isClearlyEventDigest(post.text));

    if (textPosts.length === 0) {
      await mergeDuplicateEventsInDb();
      return NextResponse.json({ success: true, savedCount: 0, parsedEvents: [], selectionMode: 'no_candidates' });
    }

    // Jev screens the full recent sample; keywords are only a fallback if it is unavailable.
    const selection = await selectEventCandidatesWithJev(textPosts);
    if (selection.mode !== 'keyword_fallback') {
      const selectedIds = new Set(selection.posts.map(post => post.id));
      await markPostsScanned(textPosts.filter(post => !selectedIds.has(post.id)).map(post => post.id));
    }
    const selectedPosts = (selection.mode !== 'keyword_fallback'
      ? selection.posts
      : selection.posts.filter(post => keywordCandidate(post.text))
    ).slice(0, 100);

    if (selectedPosts.length === 0) {
      await mergeDuplicateEventsInDb();
      return NextResponse.json({ success: true, savedCount: 0, parsedEvents: [], selectionMode: selection.mode });
    }

    // Format selected posts for the existing event extraction step.
    const payloadForAi = selectedPosts.map(p => ({
      id: p.id,
      channel: p.channel.title,
      date: p.publishedAt.toISOString(),
      text: p.text
    }));

    const prompt = buildExtractionPrompt(payloadForAi);

    const aiResponse = await callOpenRouter(prompt, { timeoutMs: 120000 });
    
    // Extract JSON in case AI wrapped it in markdown or added text
    let cleanResponse = aiResponse.trim();
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[0];
    }
    
    const parsed: unknown = JSON.parse(cleanResponse);
    if (!parsed || typeof parsed !== 'object' || !('events' in parsed) || !Array.isArray(parsed.events)) {
      throw new Error('Некорректный ответ модели при извлечении событий');
    }
    const events = parsed.events;
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
          throw err;
        }
      }
    }

    await mergeDuplicateEventsInDb();
    await markPostsScanned(selectedPosts.map(post => post.id));
    return NextResponse.json({ success: true, savedCount, parsedEvents: events, selectionMode: selection.mode });
  } catch (error: unknown) {
    logger.error('Error scanning events:', undefined, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не удалось выполнить сканирование' }, { status: 500 });
  }
}
