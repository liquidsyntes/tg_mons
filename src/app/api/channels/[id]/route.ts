import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateChannelMetrics } from '@/lib/metrics';
import { verifyBearerToken } from '@/lib/auth';
import { metricsCache, bestTimeCache } from '@/lib/cache';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
    }

    const metrics = await calculateChannelMetrics(channelId);
    if (!metrics) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('GET /api/channels/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
    }

    const body = await req.json();
    const { isActive, isMine } = body;

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If setting this channel as "My Channel", remove isMine from all other channels
      if (isMine === true) {
        await tx.channel.updateMany({
          where: { isMine: true },
          data: { isMine: false },
        });
      }

      return await tx.channel.update({
        where: { id: channelId },
        data: {
          ...(typeof isActive === 'boolean' ? { isActive } : {}),
          ...(typeof isMine === 'boolean' ? { isMine } : {}),
        },
      });
    });

    metricsCache.invalidate();
    bestTimeCache.invalidate();
    const metrics = await calculateChannelMetrics(updated.id);
    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('PATCH /api/channels/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Ошибка обновления канала' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get('permanent') === 'true';

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    if (permanent) {
      // Physical delete (cascades to snapshots and posts)
      await prisma.channel.delete({ where: { id: channelId } });
      metricsCache.invalidate();
      bestTimeCache.invalidate();
      return NextResponse.json({ success: true, message: 'Канал и вся история удалены' });
    } else {
      // Soft removal from active monitoring (history preserved)
      const updated = await prisma.channel.update({
        where: { id: channelId },
        data: { isActive: false },
      });
      metricsCache.invalidate();
      bestTimeCache.invalidate();
      return NextResponse.json({
        success: true,
        message: 'Мониторинг канала отключен (история сохранена)',
        channel: updated,
      });
    }
  } catch (error: any) {
    console.error('DELETE /api/channels/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Ошибка удаления канала' }, { status: 500 });
  }
}
