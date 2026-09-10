export function calculateDeltaFromData(
  snapshots: { collectedAt: Date; membersCount: number }[],
  dateLimit: Date,
  currentMembers: number | null,
  now: Date = new Date()
): { abs: number | null; percent: number | null; coverageDays: number | null } {
  let baseline: { collectedAt: Date; membersCount: number } | null = null;
  for (const s of snapshots) {
    if (s.collectedAt.getTime() <= dateLimit.getTime()) {
      baseline = s;
      break;
    }
  }

  if (!baseline) {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].collectedAt.getTime() >= dateLimit.getTime()) {
        baseline = snapshots[i];
        break;
      }
    }
  }

  if (currentMembers === null || !baseline || baseline.membersCount === 0) {
    return { abs: null, percent: null, coverageDays: null };
  }

  const abs = currentMembers - baseline.membersCount;
  const percent = Number(((abs / baseline.membersCount) * 100).toFixed(2));
  const coverageDays = Math.round((now.getTime() - baseline.collectedAt.getTime()) / (1000 * 3600 * 24));
  return { abs, percent, coverageDays };
}

export function calculateDelta(
  dailyMetrics: any[],
  dateLimit: Date,
  currentMembers: number | null,
  now: Date = new Date()
): { abs: number | null; percent: number | null; coverageDays: number | null } {
  let baseline = null;
  for (const m of dailyMetrics) {
    if (new Date(m.date).getTime() <= dateLimit.getTime()) {
      baseline = m;
      break;
    }
  }
  if (!baseline && dailyMetrics.length > 0) {
    baseline = dailyMetrics[dailyMetrics.length - 1];
  }
  
  if (currentMembers === null || !baseline || baseline.followers === 0) return { abs: null, percent: null, coverageDays: null };
  const abs = currentMembers - baseline.followers;
  const percent = Number(((abs / baseline.followers) * 100).toFixed(2));
  const coverageDays = Math.round((now.getTime() - new Date(baseline.date).getTime()) / (1000 * 3600 * 24));
  return { abs, percent, coverageDays };
}

export function calculateVr(avgViews: number | null, currentMembers: number | null): number | null {
  if (currentMembers && currentMembers > 0 && avgViews !== null) {
    return Number(((avgViews / currentMembers) * 100).toFixed(2));
  }
  return null;
}

export function computeAvgViews24h(
  posts: { publishedAt: Date; views: number | null }[],
  now: Date
): number | null {
  const t24h = now.getTime() - 24 * 3600 * 1000;
  const t48h = t24h - 24 * 3600 * 1000;
  const t7d = now.getTime() - 7 * 24 * 3600 * 1000;

  let totalViews24h = 0;
  let viewPosts24h = 0;
  let totalViews7d = 0;
  let viewPosts7d = 0;

  for (const p of posts) {
    const pt = p.publishedAt.getTime();
    if (pt >= t7d && pt < t24h) {
      if (p.views !== null) {
        totalViews7d += p.views;
        viewPosts7d++;
        if (pt >= t48h) {
          totalViews24h += p.views;
          viewPosts24h++;
        }
      }
    }
  }

  if (viewPosts24h === 0 && viewPosts7d > 0) {
    totalViews24h = totalViews7d;
    viewPosts24h = viewPosts7d;
  }

  return viewPosts24h > 0 ? Math.round(totalViews24h / viewPosts24h) : null;
}
