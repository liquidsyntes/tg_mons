import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const events = await prisma.event.findMany({
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

    const responseBody = JSON.stringify({ events }, (key, value) =>
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
