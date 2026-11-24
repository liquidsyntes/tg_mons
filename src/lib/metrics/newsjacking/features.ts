import {
  RAW_STOP_WORDS,
  RUSSIAN_SUFFIXES,
  type ExtractedFeatures,
  type NewsjackingSourceMention,
} from './types';

export function normalizeHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{3,64}$/.test(cleaned) ? cleaned : null;
}

export function normalizeIdString(value: bigint | string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `nj_${(hash >>> 0).toString(36)}`;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function safeTimestamp(value: Date | string): number {
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

const STEMMED_STOP_WORDS = new Set(
  [...RAW_STOP_WORDS].map((word) => stemToken(word.replace(/ё/g, 'е'))),
);

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
