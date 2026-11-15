import { calculatePostERR } from '@/lib/metrics/engagement';
import type {
  ChannelReactionSpeedSummary,
  NewsReactionItem,
  NewsTopicCluster,
  NewsjackingAnalysisResult,
  NewsjackingWindowHours,
} from '@/lib/types';

export interface NewsjackingSourceMention {
  targetUsername?: string | null;
  targetTgId?: bigint | string | null;
  targetMessageId?: bigint | string | null;
  type?: string | null;
}

export interface NewsjackingSourcePost {
  id: number;
  messageId?: bigint | string | number | null;
  channelId: number;
  channelTitle: string;
  channelUsername?: string | null;
  channelTgId?: bigint | string | null;
  isMine?: boolean;
  publishedAt: Date | string;
  text: string | null;
  isAd?: boolean;
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  mentions?: readonly NewsjackingSourceMention[];
}

export interface DetectNewsTopicClustersOptions {
  windowHours?: NewsjackingWindowHours;
  now?: Date;
  minChannels?: number;
  minTextLength?: number;
  similarityThreshold?: number;
  maxClusters?: number;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const RAW_STOP_WORDS = new Set([
  // Russian function words & Telegram news boilerplate
  'на', 'по', 'за', 'от', 'до', 'из', 'не', 'ни', 'но', 'да', 'ли', 'бы', 'же',
  'то', 'во', 'со', 'об', 'ко', 'мы', 'вы', 'он', 'она', 'оно', 'они', 'ты', 'их', 'его', 'ее',
  'для', 'при', 'про', 'без', 'под', 'над', 'как', 'что', 'это', 'все', 'вся', 'всех', 'всем',
  'уже', 'или', 'если', 'еще', 'тут', 'там', 'где', 'куда', 'откуда', 'почему', 'зачем',
  'так', 'вот', 'тоже', 'также', 'только', 'даже', 'очень', 'более', 'менее', 'после', 'перед',
  'между', 'через', 'чтобы', 'когда', 'пока', 'хотя', 'будет', 'будут', 'были', 'была', 'было', 'быть',
  'есть', 'нет', 'может', 'могут', 'могла', 'могли', 'этого', 'этом', 'этой', 'этих', 'этот', 'эта',
  'который', 'которая', 'которое', 'которые', 'которых', 'свой', 'своя', 'свое', 'свои', 'своих',
  'наш', 'наша', 'наше', 'наши', 'ваш', 'ваша', 'ваше', 'ваши',
  'стал', 'стала', 'стали', 'стало', 'станет', 'сказал', 'сказала', 'заявил', 'заявила',
  'сообщил', 'сообщила', 'сообщает', 'сообщают', 'отметил', 'отметила', 'рассказал', 'рассказала',
  'пишет', 'пишут', 'передает', 'читать', 'читайте', 'подробнее', 'источник', 'подписаться', 'подпишись',
  'подписывайтесь', 'канал', 'канале', 'канала', 'каналу', 'пост', 'поста', 'посты', 'публикация',
  'новость', 'новости', 'новостей', 'сегодня', 'вчера', 'завтра', 'сейчас', 'теперь',
  'новый', 'новая', 'новое', 'новые', 'новых', 'первый', 'второй', 'один', 'одна', 'одно',
  'доброе', 'утро', 'добрый', 'вечер', 'ночи', 'спокойной', 'привет', 'итоги', 'дайджест', 'главное',
  'своими', 'своим', 'того', 'тем', 'того', 'всего', 'однако', 'просто', 'нужно', 'надо', 'можно',
  // English function words
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'are', 'was', 'were',
  'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'about', 'into', 'over', 'under',
  'after', 'before', 'more', 'most', 'very', 'just', 'only', 'also', 'new', 'news', 'read',
  'channel', 'post', 'today', 'yesterday', 'tomorrow', 'now', 'here', 'there', 'when', 'where',
  'who', 'what', 'which', 'why', 'how', 'all', 'our', 'your', 'their', 'his', 'her', 'its',
]);

const RUSSIAN_SUFFIXES = [
  'иями', 'ями', 'ами', 'иях', 'ях', 'ах',
  'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
  'ией', 'ею', 'ою', 'ию', 'ия', 'ья',
  'ов', 'ев', 'ей', 'ой', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ие', 'ые', 'ую', 'юю',
  'ть', 'ти', 'ся', 'сь', 'ил', 'ила', 'или', 'ило', 'ал', 'ала', 'али', 'ало',
  'у', 'ю', 'а', 'я', 'е', 'и', 'ы', 'о', 'ь',
];

const STEMMED_STOP_WORDS = new Set(
  [...RAW_STOP_WORDS].map((word) => stemToken(word.replace(/ё/g, 'е'))),
);

interface ExtractedFeatures {
  tokens: Set<string>;
  entities: Set<string>;
  bigrams: Set<string>;
  weights: Map<string, number>;
  surfaceByFeature: Map<string, string>;
  directRefs: Set<string>;
  normalizedLength: number;
}

interface PreparedPost {
  post: NewsjackingSourcePost;
  ts: number;
  messageId: string;
  channelUsername: string | null;
  channelTgId: string | null;
  err: number | null;
  excerpt: string;
  features: ExtractedFeatures;
}

interface WorkingCluster {
  items: PreparedPost[];
  channelIds: Set<number>;
  featureDocFreq: Map<string, number>;
  coreWeights: Map<string, number>;
  coreNorm: number;
  postKeys: Set<string>;
}

function normalizeHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{3,64}$/.test(cleaned) ? cleaned : null;
}

function normalizeIdString(value: bigint | string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `nj_${(hash >>> 0).toString(36)}`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safeTimestamp(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export function stemToken(token: string): string {
  if (/^[а-я]{5,}$/i.test(token)) {
    const lower = token.toLowerCase();
    for (const suffix of RUSSIAN_SUFFIXES) {
      if (lower.endsWith(suffix) && lower.length - suffix.length >= 4) {
        return lower.slice(0, lower.length - suffix.length);
      }
    }
    return lower;
  }
  if (/^[a-z]{5,}$/i.test(token)) {
    const lower = token.toLowerCase();
    if (lower.endsWith('ies') && lower.length > 5) return `${lower.slice(0, -3)}y`;
    if (lower.endsWith('ing') && lower.length > 6) return lower.slice(0, -3);
    if (lower.endsWith('ed') && lower.length > 5) return lower.slice(0, -2);
    if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 4) return lower.slice(0, -1);
    return lower;
  }
  return token.toLowerCase();
}

function isAcronymToken(raw: string): boolean {
  return raw.length >= 2 && raw.length <= 6 && /^[\p{Lu}\d]{2,6}$/u.test(raw) && /\p{L}/u.test(raw);
}

function isLikelyEntity(raw: string, tokenIndex: number): boolean {
  if (isAcronymToken(raw)) return true;
  if (/[a-zA-Z]/.test(raw) && raw.length >= 2) return true;
  if (tokenIndex > 0 && /^\p{Lu}[\p{L}\d-]{2,}$/u.test(raw)) return true;
  if (/^\d{2,4}$/.test(raw)) return true;
  return false;
}

function extractPostDirectRefs(
  text: string | null,
  mentions: readonly NewsjackingSourceMention[] | undefined,
  ownUsername: string | null,
  ownTgId: string | null,
): Set<string> {
  const refs = new Set<string>();

  if (mentions) {
    for (const mention of mentions) {
      const msgId = normalizeIdString(mention.targetMessageId);
      if (!msgId) continue;
      const targetUser = normalizeHandle(mention.targetUsername);
      const targetTg = normalizeIdString(mention.targetTgId);
      if (targetUser && targetUser !== ownUsername) {
        refs.add(`u:${targetUser}:${msgId}`);
      }
      if (targetTg && targetTg !== ownTgId) {
        refs.add(`tg:${targetTg}:${msgId}`);
      }
    }
  }

  if (text) {
    const urlRefs = text.matchAll(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{3,64})\/(\d+)/gi);
    for (const match of urlRefs) {
      const targetUser = normalizeHandle(match[1]);
      const msgId = match[2];
      if (targetUser && msgId && targetUser !== ownUsername) {
        refs.add(`u:${targetUser}:${msgId}`);
      }
    }
  }

  return refs;
}

function stripUrlsAndHandles(text: string, ownUsername: string | null): string {
  let cleaned = text
    .replace(/https?:\/\/[^\s<>")]+/gi, ' ')
    .replace(/(?:^|[\s(])(?:t\.me|telegram\.me)\/[^\s<>")]+/gi, ' ')
    .replace(/(?:^|[\s(])www\.[^\s<>")]+/gi, ' ')
    .replace(/^\/[a-zA-Z0-9_]+\b/gm, ' ');

  if (ownUsername) {
    const ownPattern = new RegExp(`(^|\\s)@${ownUsername}\\b`, 'gi');
    cleaned = cleaned.replace(ownPattern, ' ');
  }

  cleaned = cleaned.replace(/(^|\s)@([a-zA-Z0-9_]{3,32})\b/g, '$1$2');
  cleaned = cleaned.replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, '$1$2');
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function extractNewsFeatures(
  text: string | null | undefined,
  options: {
    ownUsername?: string | null;
    ownTgId?: bigint | string | number | null;
    mentions?: readonly NewsjackingSourceMention[];
  } = {},
): ExtractedFeatures {
  const tokens = new Set<string>();
  const entities = new Set<string>();
  const bigrams = new Set<string>();
  const weights = new Map<string, number>();
  const surfaceByFeature = new Map<string, string>();
  const ownUsername = normalizeHandle(options.ownUsername);
  const ownTgId = normalizeIdString(options.ownTgId);
  const directRefs = extractPostDirectRefs(text ?? null, options.mentions, ownUsername, ownTgId);

  if (!text) {
    return { tokens, entities, bigrams, weights, surfaceByFeature, directRefs, normalizedLength: 0 };
  }

  const stripped = stripUrlsAndHandles(text, ownUsername);
  const normalizedForLen = stripped
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedForLen) {
    return { tokens, entities, bigrams, weights, surfaceByFeature, directRefs, normalizedLength: 0 };
  }

  const rawWords = stripped.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
  const sequence: Array<{ stem: string; surface: string; isNum: boolean }> = [];

  for (let i = 0; i < rawWords.length; i++) {
    const raw = rawWords[i];
    const cleanSurface = raw.trim();
    const lowered = cleanSurface.toLowerCase().replace(/ё/g, 'е');

    if (cleanSurface.includes('-')) {
      const compact = lowered.replace(/-/g, '');
      if (/^[a-z0-9]{3,}$/.test(compact) && /[a-z]/.test(compact) && /\d/.test(compact)) {
        tokens.add(compact);
        entities.add(compact);
        surfaceByFeature.set(compact, cleanSurface);
        sequence.push({ stem: compact, surface: cleanSurface, isNum: false });
        continue;
      }
      const parts = cleanSurface.split('-').filter(Boolean);
      for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        const partLower = part.toLowerCase().replace(/ё/g, 'е');
        const partNum = /^\d+$/.test(partLower);
        if (partNum) {
          if (partLower.length >= 2) {
            tokens.add(partLower);
            entities.add(partLower);
            surfaceByFeature.set(partLower, part);
          }
          sequence.push({ stem: partLower, surface: part, isNum: true });
          continue;
        }
        const stem = stemToken(partLower);
        if (RAW_STOP_WORDS.has(partLower) || STEMMED_STOP_WORDS.has(stem)) continue;
        if (partLower.length >= 3 || isAcronymToken(part)) {
          tokens.add(stem);
          if (isLikelyEntity(part, i + p)) entities.add(stem);
          if (!surfaceByFeature.has(stem) || isLikelyEntity(part, i + p)) {
            surfaceByFeature.set(stem, part);
          }
          sequence.push({ stem, surface: part, isNum: false });
        }
      }
      continue;
    }

    const isNum = /^\d+$/.test(lowered);
    if (isNum) {
      if (lowered.length >= 2 && lowered.length <= 4) {
        tokens.add(lowered);
        entities.add(lowered);
        surfaceByFeature.set(lowered, cleanSurface);
      }
      if (lowered.length <= 4) {
        sequence.push({ stem: lowered, surface: cleanSurface, isNum: true });
      }
      continue;
    }

    const stem = stemToken(lowered);
    if (RAW_STOP_WORDS.has(lowered) || STEMMED_STOP_WORDS.has(stem)) {
      continue;
    }

    if (lowered.length >= 3 || isAcronymToken(cleanSurface)) {
      tokens.add(stem);
      if (isLikelyEntity(cleanSurface, i)) {
        entities.add(stem);
      }
      if (!surfaceByFeature.has(stem) || isLikelyEntity(cleanSurface, i)) {
        surfaceByFeature.set(stem, cleanSurface);
      }
      sequence.push({ stem, surface: cleanSurface, isNum: false });
    }
  }

  for (let i = 0; i < sequence.length - 1; i++) {
    const cur = sequence[i];
    const next = sequence[i + 1];
    if (!cur.isNum && next.isNum && /^[a-z0-9]{2,}$/.test(cur.stem)) {
      const compactCode = `${cur.stem}${next.stem}`;
      tokens.add(compactCode);
      entities.add(compactCode);
      surfaceByFeature.set(compactCode, `${cur.surface}-${next.surface}`);
    }
    if (cur.stem === next.stem) continue;
    if (cur.isNum && next.isNum) continue;
    const bigramKey = `bg:${cur.stem}_${next.stem}`;
    bigrams.add(bigramKey);
    surfaceByFeature.set(bigramKey, `${cur.surface} ${next.surface}`);
  }

  return {
    tokens,
    entities,
    bigrams,
    weights,
    surfaceByFeature,
    directRefs,
    normalizedLength: normalizedForLen.length,
  };
}

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

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return roundTo(sorted[mid], 1);
  return roundTo((sorted[mid - 1] + sorted[mid]) / 2, 1);
}

export function buildChannelReactionSpeedSummary(
  clusters: readonly NewsTopicCluster[],
): ChannelReactionSpeedSummary[] {
  if (clusters.length === 0) return [];

  interface ChannelAccumulator {
    channelId: number;
    channelTitle: string;
    channelUsername: string | null;
    isMine: boolean;
    delaysByTopic: number[];
    firstCount: number;
    peakCount: number;
  }

  const byChannel = new Map<number, ChannelAccumulator>();

  for (const cluster of clusters) {
    const earliestDelayForChannel = new Map<number, NewsReactionItem>();

    for (const item of cluster.timeline) {
      const current = earliestDelayForChannel.get(item.channelId);
      if (!current || item.delayMinutes < current.delayMinutes) {
        earliestDelayForChannel.set(item.channelId, item);
      }
    }

    for (const item of earliestDelayForChannel.values()) {
      const acc = byChannel.get(item.channelId) ?? {
        channelId: item.channelId,
        channelTitle: item.channelTitle,
        channelUsername: item.channelUsername,
        isMine: item.isMine,
        delaysByTopic: [],
        firstCount: 0,
        peakCount: 0,
      };
      acc.delaysByTopic.push(item.delayMinutes);
      if (cluster.firstPost.channelId === item.channelId) {
        acc.firstCount++;
      }
      if (cluster.peakPost.channelId === item.channelId) {
        acc.peakCount++;
      }
      byChannel.set(item.channelId, acc);
    }
  }

  return [...byChannel.values()]
    .map((acc) => {
      const sumDelays = acc.delaysByTopic.reduce((sum, val) => sum + val, 0);
      const avgDelay = acc.delaysByTopic.length > 0 ? roundTo(sumDelays / acc.delaysByTopic.length, 1) : 0;
      return {
        channelId: acc.channelId,
        channelTitle: acc.channelTitle,
        channelUsername: acc.channelUsername,
        isMine: acc.isMine,
        topicsCovered: acc.delaysByTopic.length,
        firstCount: acc.firstCount,
        peakCount: acc.peakCount,
        medianDelayMinutes: computeMedian(acc.delaysByTopic),
        avgDelayMinutes: avgDelay,
      };
    })
    .sort((left, right) => (
      right.firstCount - left.firstCount ||
      left.medianDelayMinutes - right.medianDelayMinutes ||
      right.topicsCovered - left.topicsCovered ||
      right.peakCount - left.peakCount ||
      left.channelTitle.localeCompare(right.channelTitle, 'ru')
    ));
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
