export interface ActivitySnapshot {
  collectedAt: Date;
  membersCount: number;
}

export interface ActivityPost {
  id: number;
  messageId: bigint;
  publishedAt: Date;
  isForwarded: boolean;
}

export interface ActivityEngagement {
  hourStart: Date;
  reactionsAdded: number;
  forwardsAdded: number;
}

export interface HourlyActivityRow {
  hourStart: string;
  sampledAt: string | null;
  membersCount: number | null;
  membersDelta: number | null;
  posts: Array<{ id: number; messageId: string; isForwarded: boolean }>;
  reactionsAdded: number;
  forwardsAdded: number;
}

const HOUR_MS = 60 * 60 * 1000;
export const ACTIVITY_HOURS = 48;

export function buildHourlyActivity(
  now: Date,
  snapshots: ActivitySnapshot[],
  posts: ActivityPost[],
  engagement: ActivityEngagement[],
  previousSnapshot: ActivitySnapshot | null,
): HourlyActivityRow[] {
  const currentHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const firstHour = currentHour - (ACTIVITY_HOURS - 1) * HOUR_MS;
  const latestByHour = new Map<number, ActivitySnapshot>();
  for (const snapshot of snapshots) {
    const hour = Math.floor(snapshot.collectedAt.getTime() / HOUR_MS) * HOUR_MS;
    if (hour < firstHour || hour > currentHour) continue;
    const previous = latestByHour.get(hour);
    if (!previous || snapshot.collectedAt > previous.collectedAt) latestByHour.set(hour, snapshot);
  }

  const postsByHour = new Map<number, HourlyActivityRow['posts']>();
  for (const post of posts) {
    const hour = Math.floor(post.publishedAt.getTime() / HOUR_MS) * HOUR_MS;
    if (hour < firstHour || hour > currentHour) continue;
    const list = postsByHour.get(hour) ?? [];
    list.push({ id: post.id, messageId: post.messageId.toString(), isForwarded: post.isForwarded });
    postsByHour.set(hour, list);
  }

  const engagementByHour = new Map<number, { reactionsAdded: number; forwardsAdded: number }>();
  for (const entry of engagement) {
    const hour = entry.hourStart.getTime();
    if (hour < firstHour || hour > currentHour) continue;
    const totals = engagementByHour.get(hour) ?? { reactionsAdded: 0, forwardsAdded: 0 };
    totals.reactionsAdded += entry.reactionsAdded;
    totals.forwardsAdded += entry.forwardsAdded;
    engagementByHour.set(hour, totals);
  }

  const rows: HourlyActivityRow[] = [];
  let previous = previousSnapshot && Math.floor(previousSnapshot.collectedAt.getTime() / HOUR_MS) * HOUR_MS === firstHour - HOUR_MS
    ? previousSnapshot : null;
  for (let hour = firstHour; hour <= currentHour; hour += HOUR_MS) {
    const sample = latestByHour.get(hour) ?? null;
    const totals = engagementByHour.get(hour);
    rows.push({
      hourStart: new Date(hour).toISOString(),
      sampledAt: sample?.collectedAt.toISOString() ?? null,
      membersCount: sample?.membersCount ?? null,
      membersDelta: sample && previous ? sample.membersCount - previous.membersCount : null,
      posts: postsByHour.get(hour) ?? [],
      reactionsAdded: totals?.reactionsAdded ?? 0,
      forwardsAdded: totals?.forwardsAdded ?? 0,
    });
    previous = sample;
  }
  return rows.reverse();
}
