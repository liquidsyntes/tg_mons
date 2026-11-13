import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { metricsCache } from '@/lib/cache';
import {
  isAdPlacementFormat,
  isAdPlacementStatus,
  serializeAdPlacementDeal,
} from '@/lib/adAttribution';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

const MAX_PRICE_AMOUNT = 2_147_483_647;
const MAX_INVITE_LINK_LENGTH = 500;
const MAX_NOTES_LENGTH = 1000;
const MAX_CURRENCY_LENGTH = 12;

function parsePositiveId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function parseNonNegativeInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isInteger(num) || num < 0 || num > MAX_PRICE_AMOUNT) return undefined;
  return num;
}

function parseOptionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return undefined;
  return trimmed.length > 0 ? trimmed : null;
}

async function hasChannelAccess(channelIds: number[], userId: number | null): Promise<boolean> {
  const uniqueIds = [...new Set(channelIds)];
  if (uniqueIds.length === 0) return false;
  if (userId === null) {
    const count = await prisma.channel.count({
      where: { id: { in: uniqueIds }, isActive: true },
    });
    return count === uniqueIds.length;
  }
  const count = await prisma.userChannel.count({
    where: { userId, isActive: true, channelId: { in: uniqueIds }, channel: { isActive: true } },
  });
  return count === uniqueIds.length;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const channelId = parsePositiveId(id);
  if (channelId === null) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }

  try {
    const accessible = await hasChannelAccess([channelId], auth.userId);
    if (!accessible) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    const deals = await prisma.adPlacement.findMany({
      where: {
        userId: auth.userId,
        OR: [{ targetChannelId: channelId }, { donorChannelId: channelId }],
      },
      include: {
        targetChannel: { select: { id: true, title: true, username: true } },
        donorChannel: { select: { id: true, title: true, username: true } },
        post: { select: { views: true, publishedAt: true } },
      },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      placements: deals.map(deal =>
        serializeAdPlacementDeal(deal, { postViews: deal.post?.views ?? null, estimatedGain: null }),
      ),
    });
  } catch (error) {
    logger.error('GET /api/channels/[id]/ad-placements error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось загрузить рекламные закупки' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const routeChannelId = parsePositiveId(id);
  if (routeChannelId === null) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;

  const dealId = payload.id !== undefined && payload.id !== null ? parsePositiveId(payload.id) : null;
  if (payload.id !== undefined && payload.id !== null && dealId === null) {
    return NextResponse.json({ error: 'Некорректный ID закупки' }, { status: 400 });
  }

  const targetChannelId = payload.targetChannelId !== undefined && payload.targetChannelId !== null
    ? parsePositiveId(payload.targetChannelId)
    : routeChannelId;
  const donorChannelId = payload.donorChannelId !== undefined && payload.donorChannelId !== null
    ? parsePositiveId(payload.donorChannelId)
    : null;

  if (targetChannelId === null || donorChannelId === null) {
    return NextResponse.json({ error: 'Необходимо указать корректные ID целевого и донорского каналов' }, { status: 400 });
  }
  if (targetChannelId !== routeChannelId && donorChannelId !== routeChannelId) {
    return NextResponse.json({ error: 'Закупка должна относиться к выбранному каналу' }, { status: 400 });
  }
  if (targetChannelId === donorChannelId) {
    return NextResponse.json({ error: 'Целевой канал и канал-донор должны различаться' }, { status: 400 });
  }

  const postId = payload.postId !== undefined && payload.postId !== null
    ? parsePositiveId(payload.postId)
    : null;
  if (payload.postId !== undefined && payload.postId !== null && postId === null) {
    return NextResponse.json({ error: 'Некорректный ID публикации' }, { status: 400 });
  }

  const priceAmount = parseNonNegativeInt(payload.priceAmount);
  if (priceAmount === undefined || priceAmount === null) {
    return NextResponse.json({ error: 'Цена размещения должна быть целым неотрицательным числом' }, { status: 400 });
  }

  const formatRaw = payload.format ?? '1/24';
  if (!isAdPlacementFormat(formatRaw)) {
    return NextResponse.json({ error: 'Недопустимый формат размещения' }, { status: 400 });
  }

  const statusRaw = payload.status ?? 'planned';
  if (!isAdPlacementStatus(statusRaw)) {
    return NextResponse.json({ error: 'Недопустимый статус размещения' }, { status: 400 });
  }

  const currencyRaw = parseOptionalString(payload.currency, MAX_CURRENCY_LENGTH);
  if (payload.currency !== undefined && currencyRaw === undefined) {
    return NextResponse.json({ error: 'Некорректный код валюты' }, { status: 400 });
  }
  const currency = (currencyRaw ?? 'UAH').toUpperCase();

  let scheduledAt: Date | null = null;
  if (payload.scheduledAt !== undefined && payload.scheduledAt !== null && payload.scheduledAt !== '') {
    if (typeof payload.scheduledAt !== 'string') {
      return NextResponse.json({ error: 'Некорректная дата размещения' }, { status: 400 });
    }
    const parsedDate = new Date(payload.scheduledAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Некорректный формат даты размещения' }, { status: 400 });
    }
    scheduledAt = parsedDate;
  }

  const inviteLink = parseOptionalString(payload.inviteLink, MAX_INVITE_LINK_LENGTH);
  if (inviteLink === undefined && payload.inviteLink !== undefined) {
    return NextResponse.json({ error: `Инвайт-ссылка не должна превышать ${MAX_INVITE_LINK_LENGTH} символов` }, { status: 400 });
  }

  const actualJoins = parseNonNegativeInt(payload.actualJoins);
  if (payload.actualJoins !== undefined && actualJoins === undefined) {
    return NextResponse.json({ error: 'Число вступлений должно быть целым неотрицательным числом или null' }, { status: 400 });
  }

  const notes = parseOptionalString(payload.notes, MAX_NOTES_LENGTH);
  if (notes === undefined && payload.notes !== undefined) {
    return NextResponse.json({ error: `Заметка не должна превышать ${MAX_NOTES_LENGTH} символов` }, { status: 400 });
  }

  try {
    const accessible = await hasChannelAccess([targetChannelId, donorChannelId], auth.userId);
    if (!accessible) {
      return NextResponse.json({ error: 'Один из выбранных каналов недоступен' }, { status: 404 });
    }

    if (postId !== null) {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, channelId: true },
      });
      if (!post || post.channelId !== donorChannelId) {
        return NextResponse.json({ error: 'Публикация не найдена в указанном канале-доноре' }, { status: 404 });
      }
    }

    const include = {
      targetChannel: { select: { id: true, title: true, username: true } },
      donorChannel: { select: { id: true, title: true, username: true } },
      post: { select: { views: true, publishedAt: true } },
    } as const;

    let existingId = dealId;
    if (existingId !== null) {
      const existing = await prisma.adPlacement.findUnique({
        where: { id: existingId },
        select: { id: true, userId: true, targetChannelId: true, donorChannelId: true },
      });
      if (!existing || existing.userId !== auth.userId ||
          (existing.targetChannelId !== routeChannelId && existing.donorChannelId !== routeChannelId)) {
        return NextResponse.json({ error: 'Запись о закупке не найдена' }, { status: 404 });
      }
    } else if (postId !== null) {
      const byPost = await prisma.adPlacement.findFirst({
        where: {
          userId: auth.userId,
          targetChannelId,
          donorChannelId,
          postId,
        },
        select: { id: true },
      });
      if (byPost) existingId = byPost.id;
    }

    const data = {
      targetChannelId,
      donorChannelId,
      postId,
      priceAmount,
      currency,
      format: formatRaw,
      status: statusRaw,
      scheduledAt,
      inviteLink: inviteLink ?? null,
      actualJoins: actualJoins ?? null,
      notes: notes ?? null,
    };

    const saved = existingId !== null
      ? await prisma.adPlacement.update({ where: { id: existingId }, data, include })
      : await prisma.adPlacement.create({ data: { userId: auth.userId, ...data }, include });

    metricsCache.invalidate();
    return NextResponse.json(
      {
        placement: serializeAdPlacementDeal(saved, {
          postViews: saved.post?.views ?? null,
          estimatedGain: null,
        }),
      },
      { status: existingId !== null ? 200 : 201 },
    );
  } catch (error) {
    logger.error('POST /api/channels/[id]/ad-placements error:', { channelId: routeChannelId }, error);
    return NextResponse.json({ error: 'Не удалось сохранить рекламную закупку' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const channelId = parsePositiveId(id);
  if (channelId === null) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }

  let dealId = parsePositiveId(request.nextUrl.searchParams.get('id'));
  if (dealId === null) {
    const body = await request.json().catch(() => null);
    if (body && typeof body === 'object' && 'id' in body) {
      dealId = parsePositiveId((body as { id?: unknown }).id);
    }
  }
  if (dealId === null) {
    return NextResponse.json({ error: 'Некорректный ID закупки' }, { status: 400 });
  }

  try {
    const existing = await prisma.adPlacement.findUnique({
      where: { id: dealId },
      select: { id: true, userId: true, targetChannelId: true, donorChannelId: true },
    });
    if (!existing || existing.userId !== auth.userId ||
        (existing.targetChannelId !== channelId && existing.donorChannelId !== channelId)) {
      return NextResponse.json({ error: 'Запись о закупке не найдена' }, { status: 404 });
    }

    await prisma.adPlacement.delete({ where: { id: dealId } });
    metricsCache.invalidate();
    return NextResponse.json({ success: true, id: dealId });
  } catch (error) {
    logger.error('DELETE /api/channels/[id]/ad-placements error:', { channelId, dealId }, error);
    return NextResponse.json({ error: 'Не удалось удалить рекламную закупку' }, { status: 500 });
  }
}
