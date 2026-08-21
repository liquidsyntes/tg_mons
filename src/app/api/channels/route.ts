import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateChannelMetrics, getOverviewStats } from '@/lib/metrics';
import { addChannelByInput, collectChannelData } from '@/worker/collector';
import { getTelegramClient } from '@/worker/client';

export async function GET() {
  try {
    const overview = await getOverviewStats();
    return NextResponse.json(overview.channels);
  } catch (error: any) {
    console.error('GET /api/channels error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input, isMine } = body;

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Параметр input (username или ссылка) обязателен' },
        { status: 400 }
      );
    }

    // Add channel to DB via MTProto resolve
    const channel = await addChannelByInput(input, Boolean(isMine));

    // Run immediate backfill in background or synchronously
    try {
      const client = await getTelegramClient();
      await collectChannelData(client, channel.id, true);
    } catch (backfillErr: any) {
      console.warn(`Initial backfill failed for channel ${channel.id}:`, backfillErr.message);
      await prisma.channel.update({
        where: { id: channel.id },
        data: { lastError: backfillErr.message },
      });
    }

    const metrics = await calculateChannelMetrics(channel.id);
    return NextResponse.json(metrics, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/channels error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка добавления канала' },
      { status: 400 }
    );
  }
}
