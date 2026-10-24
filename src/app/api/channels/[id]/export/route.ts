import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  dailyExportColumns, postExportColumns, serializeCsv, serializeJson, snapshotExportColumns,
  type ExportRow,
} from '@/lib/exportData';

interface RouteContext { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const { id } = await context.params;
  const channelId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(channelId) || channelId > 2147483647) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }
  const dataset = request.nextUrl.searchParams.get('dataset');
  const format = request.nextUrl.searchParams.get('format');
  if (dataset !== 'daily' && dataset !== 'snapshots' && dataset !== 'posts') {
    return NextResponse.json({ error: 'Некорректный набор данных' }, { status: 400 });
  }
  if (format !== 'csv' && format !== 'json') {
    return NextResponse.json({ error: 'Формат должен быть CSV или JSON' }, { status: 400 });
  }

  try {
    if (auth.userId !== null) {
      const access = await prisma.userChannel.findUnique({
        where: { userId_channelId: { userId: auth.userId, channelId } }, select: { channelId: true },
      });
      if (!access) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    } else {
      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
      if (!channel) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    let rows: ExportRow[];
    let columns;
    if (dataset === 'daily') {
      const metrics = await prisma.channelMetricDaily.findMany({
        where: { channelId }, orderBy: { date: 'asc' },
        select: { date: true, followers: true, postsCount: true, avgViews: true, vr: true, err: true },
      });
      rows = metrics.map(metric => ({
        date: metric.date.toISOString().slice(0, 10), followers: metric.followers,
        postsCount: metric.postsCount, avgViews: metric.avgViews, vr: metric.vr, err: metric.err,
      }));
      columns = dailyExportColumns;
    } else if (dataset === 'snapshots') {
      const snapshots = await prisma.snapshot.findMany({
        where: { channelId }, orderBy: { collectedAt: 'desc' }, take: 10_000,
        select: { collectedAt: true, membersCount: true },
      });
      rows = snapshots.map(snapshot => ({
        collectedAt: snapshot.collectedAt.toISOString(), membersCount: snapshot.membersCount,
      }));
      columns = snapshotExportColumns;
    } else {
      const posts = await prisma.post.findMany({
        where: { channelId }, orderBy: { publishedAt: 'desc' }, take: 100,
        select: {
          messageId: true, publishedAt: true, text: true, views: true, reactions: true,
          comments: true, forwards: true, isAd: true, contentType: true,
        },
      });
      rows = posts.map(post => ({
        messageId: post.messageId.toString(), publishedAt: post.publishedAt.toISOString(),
        text: post.text, views: post.views, reactions: post.reactions, comments: post.comments,
        forwards: post.forwards, isAd: post.isAd, contentType: post.contentType,
      }));
      columns = postExportColumns;
    }

    const body = format === 'csv' ? serializeCsv(columns, rows) : serializeJson(rows);
    return new NextResponse(body, {
      headers: {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="tgmon-channel-${channelId}-${dataset}.${format}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    logger.error('GET /api/channels/[id]/export error:', { channelId, dataset }, error);
    return NextResponse.json({ error: 'Не удалось выгрузить данные канала' }, { status: 500 });
  }
}
