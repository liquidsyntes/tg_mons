import { serializeBigInt } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateChannelMetrics } from '@/lib/metrics';
import { extractRequestSession, verifyBearerToken } from '@/lib/auth';
import { normalizeChannelTags } from '@/lib/tags';
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

    const session = await extractRequestSession(req);
    const metrics = session.userId
      ? await calculateChannelMetrics(channelId, new Date(), session.userId)
      : await calculateChannelMetrics(channelId);
    if (!metrics) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    return NextResponse.json(serializeBigInt(metrics));
  } catch (error: any) {
    logger.error('GET /api/channels/[id] error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const authCheck = await verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
    }

    const body = await req.json();
    const { isActive, isMine, tags } = body;

    let normalizedTags: string[] | undefined;
    if (tags !== undefined) {
      const parsed = normalizeChannelTags(tags);
      if (parsed === null) {
        return NextResponse.json(
          { error: 'Некорректный формат тегов (максимум 10 тегов до 30 символов)' },
          { status: 400 }
        );
      }
      if (!authCheck.userId) {
        return NextResponse.json(
          { error: 'Персональные теги доступны только для авторизованного пользователя' },
          { status: 400 }
        );
      }
      normalizedTags = parsed;
    }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    if (authCheck.userId && typeof prisma.userChannel?.findUnique === 'function') {
      const userId = authCheck.userId;
      const userSub = await prisma.userChannel.findUnique({
        where: { userId_channelId: { userId, channelId } },
      });
      if (!userSub) {
        return NextResponse.json({ error: 'Канал не найден в вашем списке' }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        if (isMine === true) {
          await tx.userChannel.updateMany({
            where: { userId, isMine: true },
            data: { isMine: false },
          });
        }

        await tx.userChannel.update({
          where: { userId_channelId: { userId, channelId } },
          data: {
            ...(typeof isActive === 'boolean' ? { isActive } : {}),
            ...(typeof isMine === 'boolean' ? { isMine } : {}),
            ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
          },
        });

        if (isActive === true) {
          await tx.channel.update({
            where: { id: channelId },
            data: { isActive: true },
          });
        } else if (isActive === false) {
          const activeRemaining = await tx.userChannel.count({
            where: { channelId, isActive: true },
          });
          if (activeRemaining === 0) {
            await tx.channel.update({
              where: { id: channelId },
              data: { isActive: false },
            });
          }
        }
      });

      metricsCache.invalidate();
      bestTimeCache.invalidate();
      const metrics = await calculateChannelMetrics(channelId, new Date(), userId);
      return NextResponse.json(serializeBigInt(metrics));
    }

    const updated = await prisma.$transaction(async (tx) => {
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
    return NextResponse.json(serializeBigInt(metrics));
  } catch (error: any) {
    logger.error('PATCH /api/channels/[id] error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Ошибка обновления канала' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authCheck = await verifyBearerToken(req);
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

    if (authCheck.userId && typeof prisma.userChannel?.findUnique === 'function') {
      const userId = authCheck.userId;
      const userSub = await prisma.userChannel.findUnique({
        where: { userId_channelId: { userId, channelId } },
      });
      if (!userSub) {
        return NextResponse.json({ error: 'Канал не найден в вашем списке' }, { status: 404 });
      }

      if (permanent) {
        await prisma.$transaction(async (tx) => {
          await tx.userChannel.delete({
            where: { userId_channelId: { userId, channelId } },
          });
          const remainingSubs = await tx.userChannel.count({
            where: { channelId },
          });
          if (remainingSubs === 0) {
            await tx.channel.delete({ where: { id: channelId } });
          }
        });
        metricsCache.invalidate();
        bestTimeCache.invalidate();
        return NextResponse.json({ success: true, message: 'Канал удален из вашего списка' });
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.userChannel.update({
            where: { userId_channelId: { userId, channelId } },
            data: { isActive: false },
          });
          const activeRemaining = await tx.userChannel.count({
            where: { channelId, isActive: true },
          });
          if (activeRemaining === 0) {
            await tx.channel.update({
              where: { id: channelId },
              data: { isActive: false },
            });
          }
        });
        metricsCache.invalidate();
        bestTimeCache.invalidate();
        return NextResponse.json({
          success: true,
          message: 'Мониторинг канала отключен (история сохранена)',
          channel: serializeBigInt({ ...channel, isActive: false }),
        });
      }
    }

    if (permanent) {
      await prisma.channel.delete({ where: { id: channelId } });
      metricsCache.invalidate();
      bestTimeCache.invalidate();
      return NextResponse.json({ success: true, message: 'Канал и вся история удалены' });
    } else {
      const updated = await prisma.channel.update({
        where: { id: channelId },
        data: { isActive: false },
      });
      metricsCache.invalidate();
      bestTimeCache.invalidate();
      return NextResponse.json({
        success: true,
        message: 'Мониторинг канала отключен (история сохранена)',
        channel: serializeBigInt(updated),
      });
    }
  } catch (error: any) {
    logger.error('DELETE /api/channels/[id] error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Ошибка удаления канала' }, { status: 500 });
  }
}
