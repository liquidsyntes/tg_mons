import { prisma } from './prisma';

export async function materializeDailyMetrics(channelId: number, days: number = 7) {
  const now = new Date();
  
  const periodStart = new Date(now.getTime() - days * 24 * 3600 * 1000);
  
  const snapshots = await prisma.snapshot.findMany({
    where: { channelId, collectedAt: { gte: periodStart } },
    orderBy: { collectedAt: 'asc' },
  });
  
  const baseline = await prisma.snapshot.findFirst({
    where: { channelId, collectedAt: { lt: periodStart } },
    orderBy: { collectedAt: 'desc' }
  });
  
  const earliest = await prisma.snapshot.findFirst({
    where: { channelId },
    orderBy: { collectedAt: 'asc' }
  });
  
  let currentMembers = baseline?.membersCount || earliest?.membersCount || 0;
  let snapshotIndex = 0;
  
  for (let i = days - 1; i >= 0; i--) {
    const targetDate = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const dayStr = targetDate.toISOString().slice(0, 10);
    const dayStart = new Date(dayStr + 'T00:00:00.000Z');
    const dayEnd = new Date(dayStr + 'T23:59:59.999Z');
    
    let dayMembers = currentMembers;
    for (let j = snapshotIndex; j < snapshots.length; j++) {
      if (snapshots[j].collectedAt <= dayEnd) {
        dayMembers = snapshots[j].membersCount;
        snapshotIndex = j + 1;
      } else {
        break;
      }
    }
    currentMembers = dayMembers;
    
    const posts = await prisma.post.findMany({
      where: { channelId, publishedAt: { gte: dayStart, lte: dayEnd } }
    });
    
    let totalViews = 0;
    let viewPostsCount = 0;
    let trueTotalEngagement = 0;
    let trueViewsForEngagement = 0;
    
    for (const p of posts) {
      if (p.views !== null) {
        totalViews += p.views;
        viewPostsCount++;
        trueViewsForEngagement += p.views;
        trueTotalEngagement += (p.reactions || 0) + (p.comments || 0) + (p.forwards || 0);
      }
    }
    
    const postsCount = posts.length;
    const avgViews = viewPostsCount > 0 ? Math.round(totalViews / viewPostsCount) : 0;
    const vr = dayMembers > 0 && avgViews > 0 ? Number(((avgViews / dayMembers) * 100).toFixed(2)) : 0;
    const err = trueViewsForEngagement > 0 ? Number(((trueTotalEngagement / trueViewsForEngagement) * 100).toFixed(2)) : 0;
    
    await prisma.channelMetricDaily.upsert({
      where: { channelId_date: { channelId, date: dayStart } },
      update: { followers: dayMembers, avgViews, vr, err, postsCount },
      create: { channelId, date: dayStart, followers: dayMembers, avgViews, vr, err, postsCount }
    });
  }
}
