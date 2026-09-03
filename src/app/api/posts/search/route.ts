import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { detectAd } from '@/lib/adDetector';

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

    const where: any = { channelId };

    if (q) {
      where.text = { contains: q, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      where.publishedAt = {};
      if (dateFrom) where.publishedAt.gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        where.publishedAt.lte = toDate;
      }
    }

    if (minViews || maxViews) {
      where.views = {};
      if (minViews) where.views.gte = parseInt(minViews, 10);
      if (maxViews) where.views.lte = parseInt(maxViews, 10);
    }

    if (type === 'ads') {
      where.OR = [
        { text: { contains: 'реклам', mode: 'insensitive' } },
        { text: { contains: 'erid', mode: 'insensitive' } },
        { text: { contains: 'promo', mode: 'insensitive' } },
        { text: { contains: '#ad', mode: 'insensitive' } },
        { text: { contains: 'спонсор', mode: 'insensitive' } }
      ];
    } else if (type === 'partners') {
       where.OR = [
        { text: { contains: 'партнер', mode: 'insensitive' } },
        { text: { contains: 'партнёр', mode: 'insensitive' } },
        { text: { contains: 'коллаб', mode: 'insensitive' } },
        { text: { contains: 'совместн', mode: 'insensitive' } },
        { text: { contains: 't.me/', mode: 'insensitive' } }
      ];
    }

    let orderBy: any = { publishedAt: 'desc' };
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
  } catch (error: any) {
    logger.error('Search API error:', undefined, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
