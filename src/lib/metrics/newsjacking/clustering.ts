import { calculatePostERR } from '@/lib/metrics/engagement';
import type {
  NewsReactionItem,
  NewsTopicCluster,
  NewsjackingAnalysisResult,
  NewsjackingWindowHours,
} from '@/lib/types';
import {
  HOUR_MS,
  MINUTE_MS,
  type DetectNewsTopicClustersOptions,
  type NewsjackingSourcePost,
  type PreparedPost,
  type WorkingCluster,
} from './types';
import {
  extractNewsFeatures,
  normalizeHandle,
  normalizeIdString,
  roundTo,
  safeTimestamp,
  stableHash,
} from './features';
import { buildChannelReactionSpeedSummary } from './speed';

function buildPostExcerpt(text: string | null | undefined, maxLen = 160): string {
  if (!text) return '';
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 3).trimEnd()}...`;
}

function buildClusterTitle(firstPost: PreparedPost, keywords: readonly string[]): string {
  const text = firstPost.post.text ?? '';
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/https?:\/\/[^\s]+/gi, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 8);

  const firstLine = lines[0] ?? '';
  if (firstLine) {
    const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0] ?? firstLine;
    const candidate = firstSentence.length >= 12 ? firstSentence : firstLine;
    if (candidate.length <= 92) return candidate;
    const clipped = candidate.slice(0, 89);
    const lastSpace = clipped.lastIndexOf(' ');
    return `${(lastSpace > 45 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}...`;
  }

  return keywords.length > 0 ? keywords.join(', ') : `Инфоповод #${firstPost.post.id}`;
}

function buildClusterPostKeys(post: PreparedPost): string[] {
  const keys: string[] = [];
  if (post.channelUsername && post.messageId) {
    keys.push(`u:${post.channelUsername}:${post.messageId}`);
  }
  if (post.channelTgId && post.messageId) {
    keys.push(`tg:${post.channelTgId}:${post.messageId}`);
  }
  return keys;
}

function assignFeatureWeights(posts: PreparedPost[]): Set<string> {
  const docCount = posts.length;
  const docFreq = new Map<string, number>();

  for (const item of posts) {
    for (const token of item.features.tokens) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
    for (const bigram of item.features.bigrams) {
      docFreq.set(bigram, (docFreq.get(bigram) ?? 0) + 1);
    }
  }

  const tooCommonTerms = new Set<string>();
  if (docCount >= 15) {
    const maxAllowedDf = Math.max(4, Math.floor(docCount * 0.45));
    for (const [term, df] of docFreq.entries()) {
      if (df > maxAllowedDf) {
        tooCommonTerms.add(term);
      }
    }
  }

  for (const item of posts) {
    const weights = new Map<string, number>();
    for (const token of item.features.tokens) {
      if (tooCommonTerms.has(token)) continue;
      const df = Math.max(2, docFreq.get(token) ?? 2);
      const idf = 1 + Math.log((docCount + 2) / (df + 0.5));
      const roleBoost = item.features.entities.has(token) ? 1.55 : 1;
      weights.set(token, idf * roleBoost);
    }
    for (const bigram of item.features.bigrams) {
      const df = Math.max(2, docFreq.get(bigram) ?? 2);
      const idf = 1 + Math.log((docCount + 2) / (df + 0.5));
      weights.set(bigram, idf * 1.4);
    }
    item.features.weights = weights;
  }

  return tooCommonTerms;
}

function refreshClusterProfile(cluster: WorkingCluster): void {
  const size = cluster.items.length;
  const minSupport = size <= 2 ? 1 : Math.ceil(size * 0.45);
  const coreWeights = new Map<string, number>();
  let unigramNormSq = 0;

  for (const [feature, count] of cluster.featureDocFreq.entries()) {
    if (count < minSupport) continue;
    let totalWeight = 0;
    for (const item of cluster.items) {
      const w = item.features.weights.get(feature);
      if (w !== undefined) totalWeight += w;
    }
    if (totalWeight > 0) {
      const avgWeight = totalWeight / count;
      coreWeights.set(feature, avgWeight);
      if (!feature.startsWith('bg:')) {
        unigramNormSq += avgWeight * avgWeight;
      }
    }
  }

  cluster.coreWeights = coreWeights;
  cluster.coreNorm = Math.sqrt(unigramNormSq);
}

function scorePostAgainstCluster(
  post: PreparedPost,
  cluster: WorkingCluster,
  tooCommonTerms: ReadonlySet<string>,
): { score: number; directCitation: boolean } {
  for (const ref of post.features.directRefs) {
    if (cluster.postKeys.has(ref)) {
      return { score: 1, directCitation: true };
    }
  }

  for (const clusterItem of cluster.items) {
    for (const ref of clusterItem.features.directRefs) {
      for (const key of buildClusterPostKeys(post)) {
        if (ref === key) {
          return { score: 1, directCitation: true };
        }
      }
    }
  }

  if (post.features.weights.size === 0 || cluster.coreWeights.size === 0 || cluster.coreNorm === 0) {
    return { score: 0, directCitation: false };
  }

  let unigramDot = 0;
  let postUnigramNormSq = 0;
  let sharedUnigrams = 0;
  let sharedEntities = 0;
  let sharedBigrams = 0;

  for (const [feature, wPost] of post.features.weights.entries()) {
    if (!feature.startsWith('bg:')) {
      postUnigramNormSq += wPost * wPost;
    }
    const wCore = cluster.coreWeights.get(feature);
    if (wCore === undefined) continue;
    if (feature.startsWith('bg:')) {
      sharedBigrams++;
    } else if (!tooCommonTerms.has(feature)) {
      unigramDot += wPost * wCore;
      sharedUnigrams++;
      if (post.features.entities.has(feature)) {
        sharedEntities++;
      }
    }
  }

  const postUnigramNorm = Math.sqrt(postUnigramNormSq);
  if (postUnigramNorm === 0) return { score: 0, directCitation: false };

  const hasEnoughOverlap =
    sharedUnigrams >= 2 &&
    (sharedEntities >= 1 || sharedBigrams >= 1 || sharedUnigrams >= 3);

  if (!hasEnoughOverlap) {
    return { score: 0, directCitation: false };
  }

  const cosineUnigram = unigramDot / (postUnigramNorm * cluster.coreNorm);
  const containmentUnigram =
    unigramDot / Math.min(postUnigramNormSq, cluster.coreNorm * cluster.coreNorm);
  const bigramBonus = Math.min(3, sharedBigrams) * 0.08;
  const blended = 0.55 * cosineUnigram + 0.45 * containmentUnigram + bigramBonus;

  return { score: Math.min(1, blended), directCitation: false };
}

function pickClusterKeywords(clusterItems: readonly PreparedPost[], limit = 5): string[] {
  const tokenStats = new Map<string, { score: number; surfaceCount: Map<string, number> }>();

  for (const item of clusterItems) {
    for (const token of item.features.tokens) {
      const weight = item.features.weights.get(token) ?? 0.5;
      const entry = tokenStats.get(token) ?? { score: 0, surfaceCount: new Map<string, number>() };
      entry.score += weight;
      const surface = item.features.surfaceByFeature.get(token) ?? token;
      entry.surfaceCount.set(surface, (entry.surfaceCount.get(surface) ?? 0) + 1);
      tokenStats.set(token, entry);
    }
  }

  return [...tokenStats.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([, stats]) => {
      const [bestSurface] = [...stats.surfaceCount.entries()].sort(
        (a, b) => b[1] - a[1] || b[0].length - a[0].length,
      );
      return bestSurface?.[0] ?? '';
    })
    .filter(Boolean);
}

export function detectNewsTopicClusters(
  posts: readonly NewsjackingSourcePost[],
  options: DetectNewsTopicClustersOptions = {},
): NewsjackingAnalysisResult {
  const windowHours: NewsjackingWindowHours = options.windowHours ?? 48;
  const nowMs = (options.now ?? new Date()).getTime();
  const windowStartMs = nowMs - windowHours * HOUR_MS;
  const minChannels = Math.max(2, options.minChannels ?? 2);
  const minTextLength = Math.max(8, options.minTextLength ?? 15);
  const similarityThreshold = options.similarityThreshold ?? 0.28;
  const maxClusters = options.maxClusters ?? 30;

  if (posts.length === 0) {
    return {
      windowHours,
      analyzedPostsCount: 0,
      totalClusters: 0,
      uncoveredByMyChannelCount: 0,
      clusters: [],
      speedLeaderboard: [],
    };
  }

  const prepared: PreparedPost[] = [];

  for (const post of posts) {
    if (post.isAd) continue;
    const ts = safeTimestamp(post.publishedAt);
    if (!Number.isFinite(ts) || ts < windowStartMs || ts > nowMs) continue;

    const features = extractNewsFeatures(post.text, {
      ownUsername: post.channelUsername,
      ownTgId: post.channelTgId,
      mentions: post.mentions,
    });

    if (features.normalizedLength < minTextLength || features.tokens.size < 3) {
      continue;
    }

    const rawErr = calculatePostERR({
      views: post.views,
      reactions: post.reactions,
      comments: post.comments,
      forwards: post.forwards,
    });

    prepared.push({
      post,
      ts,
      messageId: normalizeIdString(post.messageId) ?? String(post.id),
      channelUsername: normalizeHandle(post.channelUsername),
      channelTgId: normalizeIdString(post.channelTgId),
      err: rawErr === null ? null : roundTo(rawErr, 2),
      excerpt: buildPostExcerpt(post.text),
      features,
    });
  }

  if (prepared.length === 0) {
    return {
      windowHours,
      analyzedPostsCount: 0,
      totalClusters: 0,
      uncoveredByMyChannelCount: 0,
      clusters: [],
      speedLeaderboard: [],
    };
  }

  prepared.sort((left, right) => left.ts - right.ts || left.post.id - right.post.id);

  const tooCommonTerms = assignFeatureWeights(prepared);

  const clusters: WorkingCluster[] = [];
  const featureToClusters = new Map<string, Set<number>>();
  const refKeyToCluster = new Map<string, number>();

  for (const item of prepared) {
    const candidateClusterIds = new Set<number>();

    for (const ref of item.features.directRefs) {
      const idx = refKeyToCluster.get(ref);
      if (idx !== undefined) candidateClusterIds.add(idx);
    }

    for (const feature of item.features.weights.keys()) {
      const list = featureToClusters.get(feature);
      if (!list) continue;
      for (const idx of list) {
        candidateClusterIds.add(idx);
      }
    }

    let bestClusterIdx = -1;
    let bestScore = -1;
    let bestWasCitation = false;

    for (const idx of candidateClusterIds) {
      const cluster = clusters[idx];
      const { score, directCitation } = scorePostAgainstCluster(item, cluster, tooCommonTerms);
      if ((directCitation || score >= similarityThreshold) && score > bestScore) {
        bestScore = score;
        bestClusterIdx = idx;
        bestWasCitation = directCitation;
        if (bestWasCitation) break;
      }
    }

    if (bestClusterIdx >= 0) {
      const target = clusters[bestClusterIdx];
      target.items.push(item);
      target.channelIds.add(item.post.channelId);

      for (const feature of item.features.weights.keys()) {
        target.featureDocFreq.set(feature, (target.featureDocFreq.get(feature) ?? 0) + 1);
        const set = featureToClusters.get(feature) ?? new Set<number>();
        set.add(bestClusterIdx);
        featureToClusters.set(feature, set);
      }
      for (const key of buildClusterPostKeys(item)) {
        target.postKeys.add(key);
        refKeyToCluster.set(key, bestClusterIdx);
      }
      refreshClusterProfile(target);
    } else {
      const newIdx = clusters.length;
      const featureDocFreq = new Map<string, number>();
      const postKeys = new Set<string>();

      for (const feature of item.features.weights.keys()) {
        featureDocFreq.set(feature, 1);
        const set = featureToClusters.get(feature) ?? new Set<number>();
        set.add(newIdx);
        featureToClusters.set(feature, set);
      }
      for (const key of buildClusterPostKeys(item)) {
        postKeys.add(key);
        refKeyToCluster.set(key, newIdx);
      }

      const created: WorkingCluster = {
        items: [item],
        channelIds: new Set([item.post.channelId]),
        featureDocFreq,
        coreWeights: new Map(),
        coreNorm: 0,
        postKeys,
      };
      refreshClusterProfile(created);
      clusters.push(created);
    }
  }

  const formattedClusters: NewsTopicCluster[] = [];

  for (const cluster of clusters) {
    if (cluster.channelIds.size < minChannels) continue;

    const sortedItems = [...cluster.items].sort(
      (left, right) => left.ts - right.ts || left.post.id - right.post.id,
    );
    const firstItem = sortedItems[0];
    const firstMs = firstItem.ts;
    const lastMs = sortedItems[sortedItems.length - 1].ts;

    const peakItem = sortedItems.reduce((best, current) => {
      const bestErr = best.err ?? -1;
      const currErr = current.err ?? -1;
      if (currErr !== bestErr) return currErr > bestErr ? current : best;
      const bestViews = best.post.views ?? -1;
      const currViews = current.post.views ?? -1;
      if (currViews !== bestViews) return currViews > bestViews ? current : best;
      if (current.ts !== best.ts) return current.ts < best.ts ? current : best;
      return current.post.id < best.post.id ? current : best;
    }, sortedItems[0]);

    const timeline: NewsReactionItem[] = sortedItems.map((entry, idx) => ({
      postId: entry.post.id,
      messageId: entry.messageId,
      channelId: entry.post.channelId,
      channelTitle: entry.post.channelTitle,
      channelUsername: entry.channelUsername,
      isMine: Boolean(entry.post.isMine),
      publishedAt: new Date(entry.ts).toISOString(),
      delayMinutes: Math.max(0, Math.round((entry.ts - firstMs) / MINUTE_MS)),
      isFirst: idx === 0,
      isPeak: entry.post.id === peakItem.post.id,
      views: entry.post.views ?? null,
      err: entry.err,
      reactions: entry.post.reactions ?? null,
      comments: entry.post.comments ?? null,
      forwards: entry.post.forwards ?? null,
      excerpt: entry.excerpt,
    }));

    const keywords = pickClusterKeywords(sortedItems, 5);
    const title = buildClusterTitle(firstItem, keywords);

    let totalViews = 0;
    let errSum = 0;
    let errCount = 0;
    let coveredByMyChannel = false;
    let myChannelDelayMinutes: number | null = null;

    for (const item of timeline) {
      totalViews += item.views ?? 0;
      if (item.err !== null) {
        errSum += item.err;
        errCount++;
      }
      if (item.isMine) {
        coveredByMyChannel = true;
        if (myChannelDelayMinutes === null || item.delayMinutes < myChannelDelayMinutes) {
          myChannelDelayMinutes = item.delayMinutes;
        }
      }
    }

    const firstReaction = timeline[0];
    const peakReaction = timeline.find((entry) => entry.isPeak) ?? firstReaction;
    const topicSeed = `${firstItem.post.channelId}:${firstItem.post.id}:${keywords.join(',')}`;

    formattedClusters.push({
      topicId: stableHash(topicSeed),
      title,
      keywords,
      firstPublishedAt: new Date(firstMs).toISOString(),
      lastPublishedAt: new Date(lastMs).toISOString(),
      firstPost: firstReaction,
      peakPost: peakReaction,
      channelsCount: cluster.channelIds.size,
      postsCount: timeline.length,
      totalViews,
      avgErr: errCount > 0 ? roundTo(errSum / errCount, 2) : null,
      coveredByMyChannel,
      myChannelDelayMinutes,
      timeline,
    });
  }

  formattedClusters.sort((left, right) => (
    right.channelsCount - left.channelsCount ||
    right.totalViews - left.totalViews ||
    new Date(right.firstPublishedAt).getTime() - new Date(left.firstPublishedAt).getTime() ||
    left.topicId.localeCompare(right.topicId)
  ));

  const limitedClusters = formattedClusters.slice(0, maxClusters);
  const uncoveredByMyChannelCount = limitedClusters.filter((cluster) => !cluster.coveredByMyChannel).length;
  const speedLeaderboard = buildChannelReactionSpeedSummary(limitedClusters);

  return {
    windowHours,
    analyzedPostsCount: prepared.length,
    totalClusters: limitedClusters.length,
    uncoveredByMyChannelCount,
    clusters: limitedClusters,
    speedLeaderboard,
  };
}
