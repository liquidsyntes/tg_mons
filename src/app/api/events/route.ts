import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isClearlyEventDigest } from '@/lib/events/digest';
import { isSameEvent } from '@/lib/events/matching';
import { getActiveSession } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getActiveSession();
    const userId = session.userId;

    let userChannelIds: Set<number> | null = null;
    if (userId && typeof prisma.userChannel?.findMany === 'function') {
      const subs = await prisma.userChannel.findMany({
        where: { userId, isActive: true },
        select: { channelId: true },
      });
      userChannelIds = new Set(subs.map((s) => s.channelId));
    }

    const events = await prisma.event.findMany({
      where: userId
        ? {
            dismissedAt: null,
            dismissedByUsers: { none: { userId } },
          }
        : { dismissedAt: null },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      include: {
        mentions: {
          include: {
            post: {
              include: {
                channel: true,
                image: { select: { postId: true } },
              }
            }
          }
        }
      }
    });

    const filteredEvents = events.flatMap(event => {
      const mentions = event.mentions.filter(mention => {
        if (isClearlyEventDigest(mention.post.text)) return false;
        if (userChannelIds && !userChannelIds.has(mention.post.channelId)) return false;
        return true;
      });
      if (userChannelIds && mentions.length === 0) return [];
      return event.mentions.length > 0 && mentions.length === 0
        ? []
        : [{ ...event, mentions }];
    });

    const visibleEvents: typeof filteredEvents = [];
    for (const event of filteredEvents) {
      const existing = visibleEvents.find(candidate => isSameEvent(candidate, event));
      if (!existing) {
        visibleEvents.push(event);
        continue;
      }
      const linkedPostIds = new Set(existing.mentions.map(mention => mention.postId));
      existing.mentions.push(...event.mentions.filter(mention => !linkedPostIds.has(mention.postId)));
    }

    const eventsWithImages = visibleEvents.map(event => {
      const imagePostId = event.mentions.find(mention => mention.post.image)?.post.id;
      return { ...event, imageUrl: imagePostId ? `/api/posts/${imagePostId}/image` : null };
    });

    const responseBody = JSON.stringify({ events: eventsWithImages }, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );

    return new NextResponse(responseBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    logger.error('Error fetching events:', undefined, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
