import { NextResponse } from 'next/server';
import { estimateAdPrice } from '@/lib/pricing';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Invalid channel ID' }, { status: 400 });
    }

    const priceData = await estimateAdPrice(channelId);
    if (!priceData) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    return NextResponse.json(priceData);
  } catch (error: any) {
    logger.error('GET /api/channels/[id]/ad-price error:', undefined, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
