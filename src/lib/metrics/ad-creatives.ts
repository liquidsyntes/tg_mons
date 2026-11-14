import type { AdCreativeCluster, AdCreativePostItem, AdCreativeSortBy } from '@/lib/types';

export interface ClusterAdCreativesOptions {
  similarityThreshold?: number;
  sortBy?: AdCreativeSortBy;
  limit?: number;
}

const STOP_WORDS = new Set([
  'на', 'по', 'за', 'от', 'до', 'из', 'не', 'ни', 'но', 'да', 'ли', 'бы', 'же',
  'то', 'во', 'со', 'об', 'ко', 'мы', 'вы', 'он', 'ты', 'их', 'его', 'ее',
  'для', 'при', 'про', 'без', 'под', 'над', 'как', 'что', 'это', 'все', 'уже',
  'или', 'если', 'еще', 'тут', 'там', 'где',
  'in', 'on', 'at', 'to', 'of', 'for', 'is', 'it', 'or', 'an', 'as', 'by',
  'the', 'and', 'with', 'from', 'this', 'that', 'are', 'you',
]);

const IGNORED_DOMAINS = new Set([
  't.me',
  'telegram.me',
  'telegram.org',
  'telegra.ph',
]);

function extractNormalizedHandle(value: string): string | null {
  const clean = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{3,32}$/.test(clean) ? clean : null;
}

/**
 * Strips URLs, UTM query parameters, handles, hashtags, emojis, and punctuation
 * so identical ad creatives placed with different tracking links normalize equally.
 */
export function normalizeCreativeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/https?:\/\/[^\s<>")]+/gi, ' ')
    .replace(/(?:^|[\s(])(?:t\.me|telegram\.me)\/[^\s<>")]+/gi, ' ')
    .replace(/(?:^|[\s(])www\.[^\s<>")]+/gi, ' ')
    .replace(/(^|\s)@[a-zA-Z0-9_]{3,}\b/g, ' ')
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCreativeShingles(normalizedText: string): Set<string> {
  const shingles = new Set<string>();
  if (!normalizedText) return shingles;

  const words = normalizedText
    .split(' ')
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));

  for (const word of words) {
    shingles.add(`w:${word}`);
  }

  for (let i = 0; i < words.length - 1; i++) {
    shingles.add(`b:${words[i]}_${words[i + 1]}`);
  }

  if (words.length < 4) {
    const compact = normalizedText.replace(/\s+/g, '');
    if (compact.length >= 4) {
      for (let i = 0; i <= compact.length - 4; i++) {
        shingles.add(`c:${compact.slice(i, i + 4)}`);
      }
    }
  }

  return shingles;
}

function jaccardSimilarity(setA: ReadonlySet<string>, setB: ReadonlySet<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let intersection = 0;
  for (const item of smaller) {
    if (larger.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function calculateTextSimilarity(
  textA: string | null | undefined,
  textB: string | null | undefined,
): number {
  const normA = normalizeCreativeText(textA);
  const normB = normalizeCreativeText(textB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const shinglesA = extractCreativeShingles(normA);
  const shinglesB = extractCreativeShingles(normB);
  let score = jaccardSimilarity(shinglesA, shinglesB);

  const minLen = Math.min(normA.length, normB.length);
  const maxLen = Math.max(normA.length, normB.length);
  if (minLen >= 40 && maxLen > 0 && minLen / maxLen >= 0.55) {
    const [shorter, longer] = normA.length <= normB.length ? [normA, normB] : [normB, normA];
    if (longer.includes(shorter)) {
      score = Math.max(score, 0.78);
    }
  }

  return Number(score.toFixed(4));
}

export function extractCreativeAdvertisers(
  text: string | null | undefined,
  mentions: readonly string[] = [],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (value: string) => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  };

  for (const mention of mentions) {
    const handle = extractNormalizedHandle(mention);
    if (handle) pushUnique(`@${handle}`);
  }

  if (text) {
    const inlineHandles = text.matchAll(/(?:^|[\s(])@([a-zA-Z0-9_]{4,32})\b/g);
    for (const match of inlineHandles) {
      const handle = extractNormalizedHandle(match[1]);
      if (handle) pushUnique(`@${handle}`);
    }

    const urlMatches = text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
    for (const match of urlMatches) {
      const domain = match[1].toLowerCase().replace(/^www\./, '');
      if (domain && !IGNORED_DOMAINS.has(domain)) {
        pushUnique(domain);
      }
    }
  }

  return result;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `cr_${(hash >>> 0).toString(36)}`;
}

function safeTimestamp(value: string | Date): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toIsoString(value: string | Date): string {
  const ms = safeTimestamp(value);
  return ms > 0 ? new Date(ms).toISOString() : new Date(0).toISOString();
}

function truncateSampleText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 500) return trimmed;
  return `${trimmed.slice(0, 497).trimEnd()}...`;
}

export function sortAdCreativeClusters(
  clusters: readonly AdCreativeCluster[],
  sortBy: AdCreativeSortBy = 'placementsCount',
): AdCreativeCluster[] {
  return [...clusters].sort((left, right) => {
    if (sortBy === 'totalViews') {
      return (
        right.totalViews - left.totalViews ||
        right.placementsCount - left.placementsCount ||
        right.avgErr - left.avgErr ||
        left.clusterId.localeCompare(right.clusterId)
      );
    }
    if (sortBy === 'avgErr') {
      return (
        right.avgErr - left.avgErr ||
        right.placementsCount - left.placementsCount ||
        right.totalViews - left.totalViews ||
        left.clusterId.localeCompare(right.clusterId)
      );
    }
    return (
      right.placementsCount - left.placementsCount ||
      right.totalViews - left.totalViews ||
      right.avgErr - left.avgErr ||
      left.clusterId.localeCompare(right.clusterId)
    );
  });
}

export function clusterAdCreatives<T extends AdCreativePostItem>(
  posts: readonly T[],
  options: ClusterAdCreativesOptions = {},
): AdCreativeCluster[] {
  const similarityThreshold = options.similarityThreshold ?? 0.65;
  const sortBy = options.sortBy ?? 'placementsCount';
  const limit = options.limit ?? 50;

  if (posts.length === 0 || limit <= 0) return [];

  const prepared = posts
    .map((post) => {
      const normalized = normalizeCreativeText(post.text);
      const advertisers = extractCreativeAdvertisers(post.text, post.mentions);
      const shingles = extractCreativeShingles(normalized);
      return {
        post: {
          ...post,
          publishedAt: toIsoString(post.publishedAt as string | Date),
        },
        normalized,
        shingles,
        advertisers,
        ts: safeTimestamp(post.publishedAt as string | Date),
      };
    })
    .filter((item) => item.normalized.length >= 8 || item.advertisers.length > 0)
    .sort((a, b) => b.ts - a.ts || a.post.id - b.post.id);

  if (prepared.length === 0) return [];

  interface WorkingCluster {
    representativeNorm: string;
    representativeShingles: Set<string>;
    advertiserCounts: Map<string, number>;
    items: Array<(typeof prepared)[number]>;
  }

  const clusters: WorkingCluster[] = [];

  for (const item of prepared) {
    let bestCluster: WorkingCluster | null = null;
    let bestScore = -1;

    for (const cluster of clusters) {
      if (item.normalized.length < 8 && cluster.representativeNorm.length < 8) {
        const hasCommonAdvertiser = item.advertisers.some((adv) =>
          cluster.advertiserCounts.has(adv),
        );
        if (hasCommonAdvertiser) {
          bestCluster = cluster;
          bestScore = 1;
          break;
        }
        continue;
      }

      if (item.normalized.length === 0 || cluster.representativeNorm.length === 0) {
        continue;
      }

      const minLen = Math.min(item.normalized.length, cluster.representativeNorm.length);
      const maxLen = Math.max(item.normalized.length, cluster.representativeNorm.length);
      if (minLen / maxLen < 0.35) continue;

      let score = jaccardSimilarity(item.shingles, cluster.representativeShingles);
      if (item.normalized === cluster.representativeNorm) {
        score = 1;
      } else if (minLen >= 40 && minLen / maxLen >= 0.55) {
        const [shorter, longer] =
          item.normalized.length <= cluster.representativeNorm.length
            ? [item.normalized, cluster.representativeNorm]
            : [cluster.representativeNorm, item.normalized];
        if (longer.includes(shorter)) {
          score = Math.max(score, 0.78);
        }
      }

      const sharesAdvertiser = item.advertisers.some((adv) =>
        cluster.advertiserCounts.has(adv),
      );
      const effectiveThreshold = sharesAdvertiser
        ? Math.max(0.45, similarityThreshold - 0.15)
        : similarityThreshold;

      if (score >= effectiveThreshold && score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
        if (score === 1) break;
      }
    }

    if (bestCluster) {
      bestCluster.items.push(item);
      for (const adv of item.advertisers) {
        bestCluster.advertiserCounts.set(
          adv,
          (bestCluster.advertiserCounts.get(adv) ?? 0) + 1,
        );
      }
    } else {
      const counts = new Map<string, number>();
      for (const adv of item.advertisers) {
        counts.set(adv, 1);
      }
      clusters.push({
        representativeNorm: item.normalized,
        representativeShingles: item.shingles,
        advertiserCounts: counts,
        items: [item],
      });
    }
  }

  const usedIds = new Map<string, number>();

  const formed: AdCreativeCluster[] = clusters.map((cluster) => {
    const sortedPosts = cluster.items
      .map((item) => item.post)
      .sort(
        (a, b) =>
          (b.err ?? -1) - (a.err ?? -1) ||
          (b.views ?? -1) - (a.views ?? -1) ||
          safeTimestamp(b.publishedAt) - safeTimestamp(a.publishedAt) ||
          a.id - b.id,
      );

    const placementsCount = sortedPosts.length;
    const uniqueChannelsCount = new Set(sortedPosts.map((p) => p.channel.id)).size;

    let totalViews = 0;
    let viewsSamples = 0;
    let erSum = 0;
    let erSamples = 0;
    let errSum = 0;
    let errSamples = 0;
    let maxErr = 0;
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = Number.NEGATIVE_INFINITY;
    let bestSampleText = '';

    for (const p of sortedPosts) {
      if (p.views !== null && Number.isFinite(p.views) && p.views >= 0) {
        totalViews += p.views;
        viewsSamples++;
      }
      if (p.er !== null && Number.isFinite(p.er)) {
        erSum += p.er;
        erSamples++;
      }
      if (p.err !== null && Number.isFinite(p.err)) {
        errSum += p.err;
        errSamples++;
        if (p.err > maxErr) maxErr = p.err;
      }
      const ts = safeTimestamp(p.publishedAt);
      if (ts > 0) {
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
      }
      const rawText = p.text?.trim() ?? '';
      if (rawText.length > bestSampleText.length) {
        bestSampleText = rawText;
      }
    }

    const avgViews = viewsSamples > 0 ? Math.round(totalViews / viewsSamples) : 0;
    const avgEr = erSamples > 0 ? Number((erSum / erSamples).toFixed(2)) : 0;
    const avgErr = errSamples > 0 ? Number((errSum / errSamples).toFixed(2)) : 0;
    const roundedMaxErr = errSamples > 0 ? Number(maxErr.toFixed(2)) : 0;

    const advertisers = [...cluster.advertiserCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([adv]) => adv);

    const baseIdSeed =
      cluster.representativeNorm ||
      advertisers.join(',') ||
      String(sortedPosts[0]?.id ?? 0);
    const baseId = stableHash(baseIdSeed);
    const seenCount = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, seenCount + 1);
    const clusterId = seenCount === 0 ? baseId : `${baseId}_${seenCount}`;

    const fallbackText =
      advertisers.length > 0
        ? `Рекламный креатив (${advertisers.join(', ')})`
        : 'Рекламный пост без текста';

    const firstSeenAt = Number.isFinite(minTs)
      ? new Date(minTs).toISOString()
      : sortedPosts[0]?.publishedAt ?? new Date(0).toISOString();
    const lastSeenAt = Number.isFinite(maxTs)
      ? new Date(maxTs).toISOString()
      : sortedPosts[0]?.publishedAt ?? new Date(0).toISOString();

    return {
      clusterId,
      sampleText: bestSampleText ? truncateSampleText(bestSampleText) : fallbackText,
      normalizedPreview: cluster.representativeNorm.slice(0, 140),
      advertisers,
      placementsCount,
      uniqueChannelsCount,
      totalViews,
      avgViews,
      avgEr,
      avgErr,
      maxErr: roundedMaxErr,
      firstSeenAt,
      lastSeenAt,
      bestPlacement: sortedPosts[0] ?? null,
      posts: sortedPosts,
    };
  });

  return sortAdCreativeClusters(formed, sortBy).slice(0, limit);
}
