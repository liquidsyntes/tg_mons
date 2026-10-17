import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { detectAd } from '@/lib/adDetector';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const channelId = parseInt(url.searchParams.get('channelId') || '0', 10);
    const q = url.searchParams.get('q') || '';
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const minViews = url.searchParams.get('minViews');
    const maxViews = url.searchParams.get('maxViews');
    const type = url.searchParams.get('type') || 'all';
    const limit = parseInt(url.searchParams.get('limit') || '15', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const sortBy = url.searchParams.get('sortBy') || 'date';

    if (!channelId) {
      return NextResponse.json({ error: 'channelId required' }, { status: 400 });
    }

    const where: Prisma.PostWhereInput = { channelId };

    if (q) {
      where.text = { contains: q, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      const publishedAt: Prisma.DateTimeFilter = {};
      if (dateFrom) publishedAt.gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        publishedAt.lte = toDate;
      }
      where.publishedAt = publishedAt;
    }

    if (minViews || maxViews) {
      const views: Prisma.IntNullableFilter = {};
      if (minViews) views.gte = parseInt(minViews, 10);
      if (maxViews) views.lte = parseInt(maxViews, 10);
      where.views = views;
    }

    if (type === 'ads') {
      where.isAd = true;
    } else if (type === 'partners') {
       where.OR = [
        { text: { contains: 'партнер', mode: 'insensitive' } },
        { text: { contains: 'партнёр', mode: 'insensitive' } },
        { text: { contains: 'коллаб', mode: 'insensitive' } },
        { text: { contains: 'совместн', mode: 'insensitive' } },
        { text: { contains: 't.me/', mode: 'insensitive' } }
      ];
    }

    let orderBy: Prisma.PostOrderByWithRelationInput = { publishedAt: 'desc' };
    if (sortBy === 'views_desc') orderBy = { views: 'desc' };
    else if (sortBy === 'views_asc') orderBy = { views: 'asc' };

    const [total, absoluteTotal, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.count({ where: { channelId } }),
      prisma.post.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
      })
    ]);
    
    const enrichedPosts = posts.map(p => ({
        ...p,
        messageId: p.messageId.toString(),
        groupedId: p.groupedId ? p.groupedId.toString() : null,
        ad: detectAd(p.text)
    }));

    return NextResponse.json({
      posts: enrichedPosts,
      total,
      absoluteTotal,
    });
  } catch (error: unknown) {
    logger.error('Search API error:', undefined, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Search failed' }, { status: 500 });
  }
}
