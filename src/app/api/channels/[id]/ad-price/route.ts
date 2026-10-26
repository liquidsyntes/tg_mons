import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { estimateAdPrice, priceSource } from '@/lib/pricing';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

function parseChannelId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

function priceValue(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647);
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const { id } = await context.params;
  const channelId = parseChannelId(id);
  if (channelId === null) return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });

  try {
    const result = await estimateAdPrice(channelId, auth.userId);
    if (!result) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    return NextResponse.json({ ...result, canEdit: auth.userId !== null });
  } catch (error) {
    logger.error('GET /api/channels/[id]/ad-price error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось рассчитать цену рекламы' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.userId === null) return NextResponse.json({ error: 'Нужен личный список каналов' }, { status: 403 });
  const { id } = await context.params;
  const channelId = parseChannelId(id);
  if (channelId === null) return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Некорректные настройки цены' }, { status: 400 });
  }
  const values = body as Record<string, unknown>;
  const fields = Object.keys(values);
  if (fields.length === 0 || fields.some(field => field !== 'customAdPriceUah' && field !== 'customCpmUah') ||
      fields.some(field => !priceValue(values[field]))) {
    return NextResponse.json({ error: 'Цена и CPM должны быть целыми неотрицательными числами или null' }, { status: 400 });
  }
  const data: { customAdPriceUah?: number | null; customCpmUah?: number | null } = {};
  if ('customAdPriceUah' in values && priceValue(values.customAdPriceUah)) data.customAdPriceUah = values.customAdPriceUah;
  if ('customCpmUah' in values && priceValue(values.customCpmUah)) data.customCpmUah = values.customCpmUah;

  const where = { userId_channelId: { userId: auth.userId, channelId } };
  try {
    const subscription = await prisma.userChannel.findUnique({ where, select: { id: true } });
    if (!subscription) return NextResponse.json({ error: 'Канал не найден в вашем списке' }, { status: 404 });
    const updated = await prisma.userChannel.update({ where, data,
      select: { customAdPriceUah: true, customCpmUah: true },
    });
    return NextResponse.json({ success: true, ...updated, priceSource: priceSource(updated) });
  } catch (error) {
    logger.error('PATCH /api/channels/[id]/ad-price error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось сохранить цену рекламы' }, { status: 500 });
  }
}
