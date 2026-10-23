export type ChannelSilenceStatus = 'активен' | 'замедлился' | 'молчит';

export interface SilencePeriod {
  startDate: string;
  endDate: string;
  durationDays: number;
}

export interface SilencePostInput {
  publishedAt: Date | string;
}

export interface SilenceChannelInput {
  posts?: SilencePostInput[];
  recentPosts?: SilencePostInput[];
  lastPostAt?: Date | string | null;
}

export interface DetectSilenceOptions {
  maxGapDays?: number; // default 7
  periodDays?: number; // default 90
  now?: Date | string; // default new Date()
}

export interface SilenceDetectionResult {
  periods: SilencePeriod[];
  status: ChannelSilenceStatus;
  lastPostAt: string | null;
  daysSinceLastPost: number | null;
}

/**
 * Calculates publishing activity status from a post date.
 * - < 3 days ago: "активен"
 * - 3-7 days ago: "замедлился"
 * - > 7 days ago or null: "молчит"
 */
export function calculateSilenceStatus(
  lastPostAt: Date | string | null | undefined,
  now: Date = new Date()
): ChannelSilenceStatus {
  if (!lastPostAt) {
    return 'молчит';
  }

  const postDate = lastPostAt instanceof Date ? lastPostAt : new Date(lastPostAt);
  if (isNaN(postDate.getTime())) {
    return 'молчит';
  }

  const diffMs = Math.max(0, now.getTime() - postDate.getTime());
  const diffDays = diffMs / (24 * 3600 * 1000);

  if (diffDays < 3) {
    return 'активен';
  }
  if (diffDays <= 7) {
    return 'замедлился';
  }
  return 'молчит';
}

/**
 * Detects prolonged silence periods between posts (longer than maxGapDays, default 7)
 * over the specified period (default 90 days).
 *
 * Returns:
 * - periods: Array<{ startDate, endDate, durationDays }>
 * - status: "активен" (< 3 days), "замедлился" (3-7 days), "молчит" (> 7 days)
 */
export function detectSilencePeriods(
  channel?: SilenceChannelInput | SilencePostInput[] | null,
  options?: DetectSilenceOptions
): SilenceDetectionResult {
  const maxGapDays = options?.maxGapDays ?? 7;
  const periodDays = options?.periodDays ?? 90;
  const now = options?.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  const windowStartMs = nowMs - periodDays * 24 * 3600 * 1000;
  const windowStart = new Date(windowStartMs);

  // Extract posts from input
  let rawPosts: SilencePostInput[] = [];
  if (Array.isArray(channel)) {
    rawPosts = channel;
  } else if (channel && typeof channel === 'object') {
    if (Array.isArray(channel.posts)) {
      rawPosts = channel.posts;
    } else if (Array.isArray(channel.recentPosts)) {
      rawPosts = channel.recentPosts;
    }
  }

  // Parse and sort posts chronologically
  const parsedPosts = rawPosts
    .map((p) => {
      const d = p.publishedAt instanceof Date ? p.publishedAt : new Date(p.publishedAt);
      return { publishedAt: d };
    })
    .filter((p) => !isNaN(p.publishedAt.getTime()))
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  // Handle case with no posts at all
  if (parsedPosts.length === 0) {
    const wholePeriodSilence: SilencePeriod = {
      startDate: windowStart.toISOString(),
      endDate: now.toISOString(),
      durationDays: periodDays,
    };
    return {
      periods: [wholePeriodSilence],
      status: 'молчит',
      lastPostAt: null,
      daysSinceLastPost: null,
    };
  }

  // Latest post across all known posts
  const latestPost = parsedPosts[parsedPosts.length - 1];
  const lastPostAt = latestPost.publishedAt.toISOString();
  const diffFromLastMs = Math.max(0, nowMs - latestPost.publishedAt.getTime());
  const daysSinceLastPost = Math.round((diffFromLastMs / (24 * 3600 * 1000)) * 10) / 10;
  const status = calculateSilenceStatus(latestPost.publishedAt, now);

  // Filter posts within the window
  const windowPosts = parsedPosts.filter(
    (p) => p.publishedAt.getTime() >= windowStartMs && p.publishedAt.getTime() <= nowMs
  );

  const periods: SilencePeriod[] = [];

  if (windowPosts.length === 0) {
    // Has older posts, but none in the last N days
    periods.push({
      startDate: windowStart.toISOString(),
      endDate: now.toISOString(),
      durationDays: periodDays,
    });
  } else {
    // 1. Check intervals between consecutive posts in window
    for (let i = 0; i < windowPosts.length - 1; i++) {
      const p1 = windowPosts[i];
      const p2 = windowPosts[i + 1];
      const gapMs = p2.publishedAt.getTime() - p1.publishedAt.getTime();
      const gapDays = gapMs / (24 * 3600 * 1000);
      if (gapDays > maxGapDays) {
        periods.push({
          startDate: p1.publishedAt.toISOString(),
          endDate: p2.publishedAt.toISOString(),
          durationDays: Math.round(gapDays),
        });
      }
    }

    // 2. Check ongoing gap between the latest post and now
    const lastInWindow = windowPosts[windowPosts.length - 1];
    const tailGapMs = nowMs - lastInWindow.publishedAt.getTime();
    const tailGapDays = tailGapMs / (24 * 3600 * 1000);
    if (tailGapDays > maxGapDays) {
      periods.push({
        startDate: lastInWindow.publishedAt.toISOString(),
        endDate: now.toISOString(),
        durationDays: Math.round(tailGapDays),
      });
    }
  }

  return {
    periods,
    status,
    lastPostAt,
    daysSinceLastPost,
  };
}
