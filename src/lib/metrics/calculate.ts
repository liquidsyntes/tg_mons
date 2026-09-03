export function calculateDeltaFromData(
  snapshots: { collectedAt: Date; membersCount: number }[],
  dateLimit: Date,
  currentMembers: number | null
): { abs: number | null; percent: number | null } {
  let baseline: { membersCount: number } | null = null;
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
    return { abs: null, percent: null };
  }

  const abs = currentMembers - baseline.membersCount;
  const percent = Number(((abs / baseline.membersCount) * 100).toFixed(2));
  return { abs, percent };
}

export function calculateDelta(
  dailyMetrics: any[],
  dateLimit: Date,
  currentMembers: number | null
): { abs: number | null; percent: number | null } {
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
  
  if (currentMembers === null || !baseline || baseline.followers === 0) return { abs: null, percent: null };
  const abs = currentMembers - baseline.followers;
  const percent = Number(((abs / baseline.followers) * 100).toFixed(2));
  return { abs, percent };
}

export function calculateVr(avgViews: number | null, currentMembers: number | null): number | null {
  if (currentMembers && currentMembers > 0 && avgViews !== null) {
    return Number(((avgViews / currentMembers) * 100).toFixed(2));
  }
  return null;
}
