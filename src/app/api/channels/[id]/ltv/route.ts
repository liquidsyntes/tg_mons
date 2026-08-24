import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channelId = parseInt(id, 10);
    if (!channelId) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    // Get posts from the last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const posts = await prisma.post.findMany({
      where: { channelId, publishedAt: { gte: twoWeeksAgo } },
      select: { id: true, publishedAt: true, views: true },
    });

    if (posts.length === 0) {
      return NextResponse.json({ ltv: [] });
    }

    const postIds = posts.map(p => p.id);
    
    // Get all snapshots for these posts
    const snapshots = await prisma.postSnapshot.findMany({
      where: { postId: { in: postIds } },
      orderBy: { collectedAt: 'asc' }
    });

    // We want to calculate the average percentage of total views 
    // achieved at hour 1, 2, 3... up to 72 hours.
    
    // Group snapshots by hour elapsed since publication
    const hourlyAverages: { [hour: number]: number[] } = {};
    for (let i = 1; i <= 72; i++) hourlyAverages[i] = [];

    for (const post of posts) {
      if (!post.views) continue;
      const postSnaps = snapshots.filter(s => s.postId === post.id);
      if (postSnaps.length === 0) continue;
      
      const publishedTime = post.publishedAt.getTime();
      const maxViews = post.views; // Assuming current views is the max

      for (const snap of postSnaps) {
         const elapsedHours = Math.round((snap.collectedAt.getTime() - publishedTime) / (1000 * 60 * 60));
         if (elapsedHours >= 1 && elapsedHours <= 72) {
             const percent = Math.min((snap.views / maxViews) * 100, 100);
             hourlyAverages[elapsedHours].push(percent);
         }
      }
    }

    const ltv = [];
    let prevPercent = 0;
    
    for (let i = 1; i <= 72; i++) {
        const values = hourlyAverages[i];
        let avgPercent = prevPercent; // Fallback to previous hour if no data
        if (values.length > 0) {
            avgPercent = values.reduce((a, b) => a + b, 0) / values.length;
        }
        // ensure monotonically increasing
        if (avgPercent < prevPercent) avgPercent = prevPercent;
        
        ltv.push({ hour: i, percent: Math.round(avgPercent * 10) / 10 });
        prevPercent = avgPercent;
    }

    return NextResponse.json({ ltv });
  } catch (error: any) {
    console.error('LTV API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
