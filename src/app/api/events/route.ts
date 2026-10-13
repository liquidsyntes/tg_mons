import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isClearlyEventDigest } from '@/lib/events/digest';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const events = await prisma.event.findMany({
      where: { dismissedAt: null },
      orderBy: { date: 'asc' },
      include: {
        mentions: {
          include: {
            post: {
              include: {
                channel: true,
              }
            }
          }
        }
      }
    });

    const visibleEvents = events.flatMap(event => {
      const mentions = event.mentions.filter(mention => !isClearlyEventDigest(mention.post.text));
      return event.mentions.length > 0 && mentions.length === 0
        ? []
        : [{ ...event, mentions }];
    });

    const responseBody = JSON.stringify({ events: visibleEvents }, (key, value) =>
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
