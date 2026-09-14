import { NextResponse } from 'next/server';
import { estimateAdPrice } from '@/lib/pricing';
import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const channelId = parseInt(params.id, 10);
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
