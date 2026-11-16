import { prisma } from '../prisma';
import { getAppTimezone } from '../timezone';
import { performanceCoverage, publicationPerformance, PERFORMANCE_HOURS, type PerformancePost } from './publication-performance';

export interface SummaryWindow {
  hours: number;
  measured: number;
  comparable: number;
  above: number;
  equal: number;
  below: number;
  withoutBaseline: number;
}
export interface PublicationSummary {
  coverage: ReturnType<typeof performanceCoverage>;
  timeZone: string;
  unavailable: number;
  removedLinks: number;
  groups: Array<{ contentType: string; isAd: boolean; publications: number; windows: SummaryWindow[] }>;
}
export function summarizePublications(posts: readonly PerformancePost[], cohort: readonly PerformancePost[], days: number, now = new Date()): PublicationSummary {
  const coverage = performanceCoverage(posts, days, now);
  const selected = [...new Map(posts.filter(p => p.publishedAt >= new Date(coverage.periodStart) && p.publishedAt <= now).map(p => [p.id, p])).values()];
  const groups: PublicationSummary['groups'] = [];
  for (const post of selected) {
    let group = groups.find(g => g.contentType === post.contentType && g.isAd === post.isAd);
    if (!group) {
      group = { contentType: post.contentType, isAd: post.isAd, publications: 0, windows: PERFORMANCE_HOURS.map(hours => ({ hours, measured: 0, comparable: 0, above: 0, equal: 0, below: 0, withoutBaseline: 0 })) };
      groups.push(group);
    }
    group.publications++;
    for (const point of publicationPerformance(post, cohort, now)) {
      const window = group.windows.find(w => w.hours === point.hours)!;
      if (point.state !== 'measured') continue;
      window.measured++;
      if (point.delta === null) { window.withoutBaseline++; continue; }
      window.comparable++;
      if (point.delta > 0) window.above++;
      else if (point.delta < 0) window.below++;
      else window.equal++;
    }
  }
  groups.sort((a, b) => Number(a.isAd) - Number(b.isAd) || a.contentType.localeCompare(b.contentType));
  return { coverage, timeZone: getAppTimezone(), unavailable: 0, removedLinks: 0, groups };
}

// Load metric fields only; the shared selector validates sample age windows.
const select = {
  id: true, channelId: true, publishedAt: true, deletedAt: true, contentType: true, isAd: true,
  performanceCheckpoints: { select: { hoursAfterPost: true, views: true, capturedAt: true } },
  snapshots: { select: { views: true, collectedAt: true } },
} as const;
export async function loadPublicationSummary(userId: number, days: number, now = new Date()): Promise<PublicationSummary> {
  const access = { isActive: true, userChannels: { some: { userId, isActive: true } } };
  const links = await prisma.userSavedPost.findMany({
    where: { userId, post: { channel: access } },
    select: { publishedPostId: true, publicationLinkedAt: true },
  });
  const ids = [...new Set(links.flatMap(l => l.publishedPostId === null ? [] : [l.publishedPostId]))];
  const accessible = ids.length ? await prisma.post.findMany({ where: { id: { in: ids }, channel: access }, select: { id: true } }) : [];
  const accessibleIds = accessible.map(p => p.id);
  const posts = accessibleIds.length ? await prisma.post.findMany({ where: { id: { in: accessibleIds }, channel: access, publishedAt: { gte: new Date(now.getTime() - days * 86400000), lte: now } }, select }) : [];
  const cohort = posts.length ? await prisma.post.findMany({ where: { channel: access, OR: posts.map(p => ({ channelId: p.channelId, contentType: p.contentType, isAd: p.isAd, publishedAt: { gte: new Date(p.publishedAt.getTime() - 30 * 86400000), lt: p.publishedAt } })) }, select }) : [];
  const summary = summarizePublications(posts, cohort, days, now);
  summary.unavailable = ids.length - accessibleIds.length;
  summary.removedLinks = links.filter(l => l.publishedPostId === null && l.publicationLinkedAt !== null).length;
  return summary;
}
