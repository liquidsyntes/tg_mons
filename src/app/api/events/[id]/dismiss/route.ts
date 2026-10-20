import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const eventId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(eventId)) {
    return NextResponse.json({ error: 'Некорректный ID события' }, { status: 400 });
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { dismissedAt: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'Событие не найдено' }, { status: 404 });
    }

    if (auth.userId && typeof prisma.userDismissedEvent?.upsert === 'function') {
      await prisma.userDismissedEvent.upsert({
        where: {
          userId_eventId: {
            userId: auth.userId,
            eventId,
          },
        },
        create: {
          userId: auth.userId,
          eventId,
        },
        update: {},
      });
      return NextResponse.json({ success: true });
    }

    if (!event.dismissedAt) {
      await prisma.event.update({
        where: { id: eventId },
        data: { dismissedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('PATCH /api/events/[id]/dismiss error', { eventId }, error);
    return NextResponse.json({ error: 'Не удалось убрать событие из афиши' }, { status: 500 });
  }
}
