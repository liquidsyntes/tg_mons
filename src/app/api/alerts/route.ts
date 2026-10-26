import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyBearerToken } from '@/lib/auth';
import { ALERT_METRICS, isAlertMetric, isAlertOperator, normalizeKeywordQuery } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

async function readObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export async function GET(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  try {
    const userId = auth.userId;
    const [rules, channels] = await Promise.all([
      prisma.alertRule.findMany({
        ...(userId ? { where: { userId } } : {}),
        orderBy: { createdAt: 'desc' },
      }),
      userId && typeof prisma.userChannel?.findMany === 'function'
        ? prisma.userChannel
            .findMany({
              where: { userId },
              include: { channel: { select: { id: true, title: true, username: true, isActive: true } } },
              orderBy: { channel: { title: 'asc' } },
            })
            .then((subs) =>
              subs.map((s) => ({
                id: s.channel.id,
                title: s.channel.title,
                username: s.channel.username,
                isActive: s.isActive && s.channel.isActive,
              })),
            )
        : prisma.channel.findMany({
            select: { id: true, title: true, username: true, isActive: true },
            orderBy: { title: 'asc' },
          }),
    ]);
    const metrics = Object.entries(ALERT_METRICS).map(([value, description]) => ({ value, ...description }));
    return NextResponse.json({
      rules, channels, metrics,
      deliveryConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    });
  } catch (error) {
    logger.error('GET /api/alerts error:', undefined, error);
    return NextResponse.json({ error: 'Ошибка загрузки правил' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  const body = await readObject(req);
  if (!body) return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });

  const channelId = body.channelId === undefined ? null : body.channelId;
  if ((channelId !== null && !isId(channelId)) || !isAlertMetric(body.metric) ||
      (body.enabled !== undefined && typeof body.enabled !== 'boolean')) {
    return NextResponse.json({ error: 'Некорректные параметры правила' }, { status: 400 });
  }

  const isKeywordRule = body.metric === 'keyword';
  const isViralPostRule = body.metric === 'viralPostMultiplier';
  let operator: 'gt' | 'lt';
  let threshold: number;
  let keywordQuery: string | null = null;

  if (isKeywordRule) {
    keywordQuery = normalizeKeywordQuery(body.keywordQuery);
    if (!keywordQuery ||
        (body.operator !== undefined && !isAlertOperator(body.operator)) ||
        (body.threshold !== undefined && (typeof body.threshold !== 'number' || !Number.isFinite(body.threshold)))) {
      return NextResponse.json({ error: 'Некорректные параметры правила' }, { status: 400 });
    }
    operator = body.operator ?? 'gt';
    threshold = body.threshold ?? 0;
  } else if (isViralPostRule) {
    if ((body.operator !== undefined && body.operator !== 'gt') ||
        typeof body.threshold !== 'number' || !Number.isFinite(body.threshold) || body.threshold <= 0) {
      return NextResponse.json({ error: 'Некорректные параметры правила' }, { status: 400 });
    }
    operator = 'gt';
    threshold = body.threshold;
  } else {
    if (!isAlertOperator(body.operator) || typeof body.threshold !== 'number' || !Number.isFinite(body.threshold)) {
      return NextResponse.json({ error: 'Некорректные параметры правила' }, { status: 400 });
    }
    operator = body.operator;
    threshold = body.threshold;
  }

  try {
    const userId = auth.userId;
    if (channelId !== null) {
      if (userId && typeof prisma.userChannel?.findUnique === 'function') {
        const sub = await prisma.userChannel.findUnique({
          where: { userId_channelId: { userId, channelId } },
          select: { id: true },
        });
        if (!sub) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
      } else {
        const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
        if (!channel) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
      }
    }
    const existing = await prisma.alertRule.findFirst({
      where: isKeywordRule
        ? {
          ...(userId ? { userId } : {}),
          channelId,
          metric: body.metric,
          keywordQuery,
        }
        : {
          ...(userId ? { userId } : {}),
          channelId,
          metric: body.metric,
          operator,
          threshold,
        },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: 'Такое правило уже существует' }, { status: 409 });
    const rule = await prisma.alertRule.create({
      data: {
        ...(userId ? { userId } : {}),
        channelId,
        metric: body.metric,
        operator,
        threshold,
        ...(isKeywordRule ? { keywordQuery } : {}),
        enabled: body.enabled ?? true,
      },
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    logger.error('POST /api/alerts error:', undefined, error);
    return NextResponse.json({ error: 'Ошибка сохранения правила' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  const body = await readObject(req);
  if (!body || !isId(body.id) || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Некорректные параметры правила' }, { status: 400 });
  }
  try {
    const where = auth.userId ? { id: body.id, userId: auth.userId } : { id: body.id };
    const updated = await prisma.alertRule.updateMany({ where, data: { enabled: body.enabled } });
    if (updated.count === 0) return NextResponse.json({ error: 'Правило не найдено' }, { status: 404 });
    const rule = await prisma.alertRule.findUnique({ where: { id: body.id } });
    if (!rule) return NextResponse.json({ error: 'Правило не найдено' }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (error) {
    logger.error('PATCH /api/alerts error:', undefined, error);
    return NextResponse.json({ error: 'Ошибка обновления правила' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  const body = await readObject(req);
  if (!body || !isId(body.id)) return NextResponse.json({ error: 'Некорректный ID правила' }, { status: 400 });
  try {
    const where = auth.userId ? { id: body.id, userId: auth.userId } : { id: body.id };
    const deleted = await prisma.alertRule.deleteMany({ where });
    if (deleted.count === 0) return NextResponse.json({ error: 'Правило не найдено' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/alerts error:', undefined, error);
    return NextResponse.json({ error: 'Ошибка удаления правила' }, { status: 500 });
  }
}
