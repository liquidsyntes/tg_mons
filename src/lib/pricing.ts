import { prisma } from './prisma';
import { getAdReachCurve } from './metrics/queries';
import type { AdPriceResult, AdPriceSource } from './types';

const CPM_BENCHMARKS: Record<string, number> = {
  general: 200,
  crypto: 500,
  investments: 400,
  it: 300,
  business: 300,
  marketing: 250,
  news: 100,
  entertainment: 60,
  humor: 60,
  education: 200,
};

const DEFAULT_CPM = 150;

export function getNicheCpm(niche: string): number {
  return CPM_BENCHMARKS[niche] ?? DEFAULT_CPM;
}

export interface PriceOverrides {
  customAdPriceUah?: number | null;
  customCpmUah?: number | null;
}

export function priceSource(overrides: PriceOverrides): AdPriceSource {
  if (overrides.customAdPriceUah && overrides.customAdPriceUah > 0) return 'custom_price';
  if (overrides.customCpmUah && overrides.customCpmUah > 0) return 'custom_cpm';
  return 'niche_estimate';
}

export function calculatePlacementPrice(
  views: number | null,
  nicheCpm: number,
  overrides: PriceOverrides,
  nicheEstimatedPrice?: number | null,
): { price: number | null; source: AdPriceSource; cpm: number } {
  const source = priceSource(overrides);
  const cpm = source === 'custom_cpm' ? overrides.customCpmUah ?? nicheCpm : nicheCpm;
  if (source === 'custom_price') return { price: overrides.customAdPriceUah ?? null, source, cpm };
  if (views === null || !Number.isFinite(views) || views <= 0) return { price: null, source, cpm };
  return { price: source === 'niche_estimate' && nicheEstimatedPrice !== undefined
    ? nicheEstimatedPrice : Math.round(views * cpm / 1000), source, cpm };
}

export async function estimateAdPrice(channelId: number, userId: number | null = null): Promise<AdPriceResult | null> {
  let niche: string;
  let overrides: PriceOverrides = {};
  if (userId === null) {
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { niche: true } });
    if (!channel) return null;
    niche = channel.niche;
  } else {
    const subscription = await prisma.userChannel.findUnique({
      where: { userId_channelId: { userId, channelId } },
      select: { niche: true, customAdPriceUah: true, customCpmUah: true },
    });
    if (!subscription) return null;
    niche = subscription.niche;
    overrides = subscription;
  }

  const source = priceSource(overrides);
  const cpm = source === 'custom_cpm' ? overrides.customCpmUah ?? getNicheCpm(niche) : getNicheCpm(niche);
  const fixedPrice = source === 'custom_price' ? overrides.customAdPriceUah ?? null : null;
  const settings = { priceSource: source, customAdPriceUah: overrides.customAdPriceUah ?? null,
    customCpmUah: overrides.customCpmUah ?? null };

  // Find recent ad posts
  const adPosts = await prisma.post.findMany({
    where: { channelId, isAd: true },
    orderBy: { publishedAt: 'desc' },
    take: 30,
    select: { id: true, views: true }
  });

  const confidence = adPosts.length >= 3 ? 'high' : 'low';

  if (adPosts.length === 0) {
    return { estimatedPricePerPost: fixedPrice,
      cpm, confidence, averageAdReach: null, averageReachCurve: [], ...settings };
  }

  let totalReach = 0;
  let validPostsCount = 0;
  const allCurves: { hoursAfterPost: number; views: number }[][] = [];

  for (const post of adPosts) {
    const curve = await getAdReachCurve(post.id);
    
    if (curve.length === 0) {
      if (post.views) {
        totalReach += post.views;
        validPostsCount++;
      }
      continue;
    }

    allCurves.push(curve);

    const pt48 = curve.find((c: any) => c.hoursAfterPost === 48);
    const pt24 = curve.find((c: any) => c.hoursAfterPost === 24);
    const ptMax = curve[curve.length - 1];

    const views = pt48 ? pt48.views : (pt24 ? pt24.views : ptMax.views);
    totalReach += views;
    validPostsCount++;
  }

  if (validPostsCount === 0) {
    return { estimatedPricePerPost: fixedPrice,
      cpm, confidence, averageAdReach: null, averageReachCurve: [], ...settings };
  }

  const averageCurveMap = new Map<number, { sum: number; count: number }>();
  for (const curve of allCurves) {
    for (const pt of curve) {
      const current = averageCurveMap.get(pt.hoursAfterPost) || { sum: 0, count: 0 };
      current.sum += pt.views;
      current.count += 1;
      averageCurveMap.set(pt.hoursAfterPost, current);
    }
  }

  let maxViews = 0;
  const averageReachCurve = Array.from(averageCurveMap.entries())
    .map(([hoursAfterPost, data]) => ({
      hoursAfterPost,
      views: Math.round(data.sum / data.count)
    }))
    .sort((a, b) => a.hoursAfterPost - b.hoursAfterPost)
    .map(pt => {
      if (pt.views > maxViews) maxViews = pt.views;
      else pt.views = maxViews;
      return pt;
    });

  const averageAdReach = totalReach / validPostsCount;
  const estimatedPricePerPost = source === 'custom_price' ? fixedPrice
    : Math.round((averageAdReach / 1000) * cpm);

  return {
    estimatedPricePerPost,
    cpm,
    confidence,
    averageAdReach: Math.round(averageAdReach),
    averageReachCurve,
    ...settings,
  };
}
