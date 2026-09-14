import { prisma } from './prisma';
import { getAdReachCurve } from './metrics/queries';

const CPM_BENCHMARKS: Record<string, number> = {
  general: 500,
  crypto: 1200,
  investments: 1000,
  it: 800,
  business: 750,
  marketing: 600,
  news: 250,
  entertainment: 150,
  humor: 150,
  education: 500,
};

const DEFAULT_CPM = 350;

export async function estimateAdPrice(channelId: number) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { niche: true }
  });

  if (!channel) return null;

  const cpm = CPM_BENCHMARKS[channel.niche] || DEFAULT_CPM;

  // Find recent ad posts
  const adPosts = await prisma.post.findMany({
    where: { channelId, isAd: true },
    orderBy: { publishedAt: 'desc' },
    take: 30,
    select: { id: true, views: true }
  });

  const confidence = adPosts.length >= 3 ? 'high' : 'low';

  if (adPosts.length === 0) {
    return { estimatedPricePerPost: null, cpm, confidence, averageAdReach: null };
  }

  let totalReach = 0;
  let validPostsCount = 0;

  for (const post of adPosts) {
    const curve = await getAdReachCurve(post.id);
    
    if (curve.length === 0) {
      if (post.views) {
        totalReach += post.views;
        validPostsCount++;
      }
      continue;
    }

    const pt48 = curve.find((c: any) => c.hoursAfterPost === 48);
    const pt24 = curve.find((c: any) => c.hoursAfterPost === 24);
    const ptMax = curve[curve.length - 1];

    const views = pt48 ? pt48.views : (pt24 ? pt24.views : ptMax.views);
    totalReach += views;
    validPostsCount++;
  }

  if (validPostsCount === 0) {
    return { estimatedPricePerPost: null, cpm, confidence, averageAdReach: null };
  }

  const averageAdReach = totalReach / validPostsCount;
  const estimatedPricePerPost = Math.round((averageAdReach / 1000) * cpm);

  return {
    estimatedPricePerPost,
    cpm,
    confidence,
    averageAdReach: Math.round(averageAdReach)
  };
}
