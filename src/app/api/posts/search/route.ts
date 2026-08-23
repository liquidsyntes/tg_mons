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
      where.text = { contains: q };
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
        { text: { contains: 'реклам' } },
        { text: { contains: 'erid' } },
        { text: { contains: 'promo' } },
        { text: { contains: '#ad' } },
        { text: { contains: 'спонсор' } }
      ];
    } else if (type === 'partners') {
       where.OR = [
        { text: { contains: 'партнер' } },
        { text: { contains: 'партнёр' } },
        { text: { contains: 'коллаб' } },
        { text: { contains: 'совместн' } },
        { text: { contains: 't.me/' } }
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
        ad: detectAd(p.text)
    }));

    return NextResponse.json({
      posts: enrichedPosts,
      total,
      absoluteTotal,
    });
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
