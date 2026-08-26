import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const lastJob = await prisma.syncJob.findFirst({
      orderBy: { startedAt: 'desc' }
    });

    if (!lastJob) {
      return NextResponse.json({ status: 'error', message: 'no sync jobs found' }, { status: 503 });
    }

    const now = new Date().getTime();
    const startedAt = lastJob.startedAt.getTime();
    
    // Thresholds
    const STUCK_THRESHOLD_MS = parseInt(process.env.HEALTH_STUCK_THRESHOLD_MINUTES || '120', 10) * 60 * 1000;
    const STALE_THRESHOLD_MS = parseInt(process.env.HEALTH_STALE_THRESHOLD_MINUTES || '720', 10) * 60 * 1000; // default 12 hours
    
    if (!lastJob.endedAt) {
      // Still running
      if (now - startedAt > STUCK_THRESHOLD_MS) {
        return NextResponse.json({ status: 'error', message: 'sync job stuck' }, { status: 503 });
      }
    } else {
      // Completed
      const endedAt = lastJob.endedAt.getTime();
      if (now - endedAt > STALE_THRESHOLD_MS) {
        return NextResponse.json({ status: 'error', message: 'sync job stale' }, { status: 503 });
      }
    }

    return NextResponse.json({
      status: 'ok',
      lastSyncStatus: lastJob.status,
      lastSyncEndedAt: lastJob.endedAt,
      channelsSucceeded: lastJob.channelsSucceeded,
      channelsFailed: lastJob.channelsFailed,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Health API error:', error);
    return NextResponse.json({ status: 'error', message: 'internal server error' }, { status: 500 });
  }
}
