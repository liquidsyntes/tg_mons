export interface AdShareResult {
  percent: number;
  level: 'none' | 'low' | 'medium' | 'high';
}

export function calculateAdShare(
  posts: { isAd?: boolean | null; publishedAt: Date }[],
  periodDays: number,
  now: Date = new Date()
): AdShareResult {
  const cutoff = new Date(now.getTime() - periodDays * 24 * 3600 * 1000);
  const periodPosts = posts.filter(p => p.publishedAt.getTime() >= cutoff.getTime());

  if (periodPosts.length === 0) {
    return { percent: 0, level: 'none' };
  }

  let adCount = 0;
  for (const p of periodPosts) {
    if (p.isAd) adCount++;
  }

  const percent = Math.round((adCount / periodPosts.length) * 100);

  let level: 'none' | 'low' | 'medium' | 'high';
  if (percent < 10) {
    level = 'low';
  } else if (percent <= 30) {
    level = 'medium';
  } else {
    level = 'high';
  }

  return { percent, level };
}
