import { prisma } from './prisma';
import { getOverviewStats } from './metrics';
import { subDays, format, startOfDay } from 'date-fns';

export interface DashboardStats {
  totalChannels: number;
  totalSubscribers: number;
  totalPosts30d: number;
  avgGrowthRate: number;
  avgErr: number;
  avgScore?: number;
  topGainers: Array<{
    id: number;
    title: string;
    username: string | null;
    currentMembers: number;
    delta7d: number;
    percent7d: number;
  }>;
  topLosers: Array<{
    id: number;
    title: string;
    username: string | null;
    currentMembers: number;
    delta7d: number;
    percent7d: number;
  }>;
  postsTimeline: Array<{ date: string; count: number }>;
  subscribersTimeline: Array<{ date: string; count: number }>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const overview = await getOverviewStats();
  
  // Combine all active channels
  const allMetrics = [...overview.channels];
  if (overview.myChannel && !allMetrics.find(c => c.id === overview.myChannel!.id)) {
    allMetrics.push(overview.myChannel);
  }

  const totalChannels = overview.totalChannels;
  const totalSubscribers = allMetrics.reduce((sum, c) => sum + (c.currentMembers || 0), 0);
  const totalPosts30d = allMetrics.reduce((sum, c) => sum + (c.posts30d || 0), 0);

  // average growth rate 7d
  const validGrowth = allMetrics.filter(c => c.delta7d.percent !== null);
  const avgGrowthRate = validGrowth.length > 0 
    ? validGrowth.reduce((sum, c) => sum + c.delta7d.percent!, 0) / validGrowth.length 
    : 0;

  // average err 7d
  const validErr = allMetrics.filter(c => c.err7d !== null);
  const avgErr = validErr.length > 0 
    ? validErr.reduce((sum, c) => sum + c.err7d!, 0) / validErr.length 
    : 0;

  const validScore = allMetrics.filter(c => c.contentScore !== undefined);
  const avgScore = validScore.length > 0
    ? validScore.reduce((sum, c) => sum + c.contentScore!, 0) / validScore.length
    : undefined;

  const gainers = [...allMetrics]
    .filter(c => (c.delta7d.abs || 0) > 0)
    .sort((a, b) => (b.delta7d.abs || 0) - (a.delta7d.abs || 0))
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      title: c.title,
      username: c.username,
      currentMembers: c.currentMembers || 0,
      delta7d: c.delta7d.abs || 0,
      percent7d: c.delta7d.percent || 0
    }));

  const losers = [...allMetrics]
    .filter(c => (c.delta7d.abs || 0) < 0)
    .sort((a, b) => (a.delta7d.abs || 0) - (b.delta7d.abs || 0))
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      title: c.title,
      username: c.username,
      currentMembers: c.currentMembers || 0,
      delta7d: c.delta7d.abs || 0,
      percent7d: c.delta7d.percent || 0
    }));

  const startDate30 = subDays(new Date(), 30);
  
  // Posts timeline
  const posts = await prisma.post.findMany({
    where: { publishedAt: { gte: startDate30 } },
    select: { publishedAt: true }
  });

  const postsByDate: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = subDays(new Date(), 29 - i);
    postsByDate[format(d, 'yyyy-MM-dd')] = 0;
  }
  
  posts.forEach(p => {
    const d = format(p.publishedAt, 'yyyy-MM-dd');
    if (postsByDate[d] !== undefined) {
      postsByDate[d]++;
    }
  });

  const postsTimeline = Object.keys(postsByDate)
    .sort()
    .map((date) => ({ date: format(new Date(date), 'dd MMM'), count: postsByDate[date] }));

  // Subscribers timeline
  const snapshots = await prisma.snapshot.findMany({
    where: { collectedAt: { gte: startDate30 } },
    select: { channelId: true, membersCount: true, collectedAt: true },
    orderBy: { collectedAt: 'asc' }
  });

  const channelLastMembers: Record<number, number> = {};
  
  // Get baseline
  const baselineSnapshots = await prisma.snapshot.findMany({
    where: { collectedAt: { lt: startDate30 } },
    orderBy: { collectedAt: 'desc' },
  });
  
  for (const s of baselineSnapshots) {
    if (!channelLastMembers[s.channelId]) {
      channelLastMembers[s.channelId] = s.membersCount;
    }
  }

  const subByDate: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const dDate = subDays(new Date(), 29 - i);
    const start = startOfDay(dDate);
    const end = new Date(start.getTime() + 24 * 3600 * 1000);

    const daySnaps = snapshots.filter(s => s.collectedAt >= start && s.collectedAt < end);
    for (const s of daySnaps) {
      channelLastMembers[s.channelId] = s.membersCount;
    }
    
    const totalDaySubscribers = Object.values(channelLastMembers).reduce((sum, count) => sum + count, 0);
    subByDate[format(dDate, 'yyyy-MM-dd')] = totalDaySubscribers;
  }

  const subscribersTimeline = Object.keys(subByDate)
    .sort()
    .map((date) => ({ date: format(new Date(date), 'dd MMM'), count: subByDate[date] }));

  return {
    totalChannels,
    totalSubscribers,
    totalPosts30d,
    avgGrowthRate,
    avgErr,
    topGainers: gainers,
    topLosers: losers,
    postsTimeline,
    subscribersTimeline
  };
}
