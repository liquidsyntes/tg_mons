import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { detectAd } from '@/lib/adDetector';
import { calculatePostER, calculatePostERR } from '@/lib/metrics/engagement';
import { calculateViralBaseline, classifyViralPost, type ViralBaseline } from '@/lib/metrics/viral';
import { parseReactionBreakdown } from '@/lib/metrics/reactions';

export const dynamic = 'force-dynamic';

type SortBy = 'publishedAt' | 'views' | 'views_asc' | 'er' | 'err' | 'forwards';
type LegacyType = 'all' | 'ads' | 'partners';

interface SearchParams {
  legacy: boolean;
  channelId: number | null;
  q: string;
  niche: string | null;
  onlyAds: boolean;
  onlyViral: boolean;
  advertiser: string | null;
  days: number | null;
  sortBy: SortBy;
  limit: number;
  offset: number;
  dateFrom: Date | null;
  dateTo: Date | null;
  minViews: number | null;
  maxViews: number | null;
  type: LegacyType;
}

interface ChannelOption {
  id: number;
  title: string;
  username: string | null;
  niche: string;
}

function readInteger(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function readDate(value: string | null, endOfDay = false): Date | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function parseSearchParams(query: URLSearchParams): SearchParams | null {
  const rawChannelId = query.get('channelId');
  const channelId = rawChannelId === null ? null : readInteger(rawChannelId, 0, 1, Number.MAX_SAFE_INTEGER);
  const rawSort = query.get('sortBy');
  const legacy = channelId !== null && !query.has('days') && !query.has('onlyAds') && !query.has('niche') &&
    (rawSort === null || ['date', 'views_desc', 'views_asc'].includes(rawSort));
  const q = (query.get('q') ?? '').trim();
  const niche = query.has('niche') ? query.get('niche')?.trim() || null : null;
  const onlyAds = query.get('onlyAds');
  const onlyViral = query.get('onlyViral');
  const advertiser = query.get('advertiser')?.trim().replace(/^@/, '').toLowerCase() || null;
  const rawDays = query.get('days');
  const days = legacy ? null : readInteger(rawDays, 30, 7, 90);
  const limit = readInteger(query.get('limit'), legacy ? 15 : 20, 1, 50);
  const offset = readInteger(query.get('offset'), 0, 0, 100_000);
  const type = query.get('type') ?? 'all';
  const dateFrom = readDate(query.get('dateFrom'));
  const dateTo = readDate(query.get('dateTo'), true);
  const minViews = query.has('minViews') ? readInteger(query.get('minViews'), 0, 0, Number.MAX_SAFE_INTEGER) : null;
  const maxViews = query.has('maxViews') ? readInteger(query.get('maxViews'), 0, 0, Number.MAX_SAFE_INTEGER) : null;
  const sortBy = rawSort === null ? 'publishedAt'
    : rawSort === 'date' ? 'publishedAt'
    : rawSort === 'views_desc' ? 'views'
    : rawSort;
  if ((rawChannelId !== null && channelId === null) || q.length > 200 || (niche !== null && niche.length > 64) ||
      (onlyAds !== null && onlyAds !== 'true' && onlyAds !== 'false') ||
      (onlyViral !== null && onlyViral !== 'true' && onlyViral !== 'false') ||
      (query.has('advertiser') && (advertiser === null || !/^[a-z0-9_]{4,32}$/.test(advertiser))) ||
      (rawDays !== null && ![7, 14, 30, 90].includes(days ?? -1)) || days === null && !legacy ||
      limit === null || offset === null || !['all', 'ads', 'partners'].includes(type) ||
      (query.has('dateFrom') && dateFrom === null) || (query.has('dateTo') && dateTo === null) ||
      (dateFrom !== null && dateTo !== null && dateFrom > dateTo) ||
      (query.has('minViews') && minViews === null) || (query.has('maxViews') && maxViews === null) ||
      (minViews !== null && maxViews !== null && minViews > maxViews) ||
      !['publishedAt', 'views', 'views_asc', 'er', 'err', 'forwards'].includes(sortBy) ||
      (!legacy && ['dateFrom', 'dateTo', 'minViews', 'maxViews', 'type'].some(key => query.has(key))) ||
      (onlyAds === 'true' && type === 'partners')) return null;
  return {
    legacy, channelId, q, niche, onlyAds: onlyAds === 'true', onlyViral: onlyViral === 'true', advertiser, days, sortBy: sortBy as SortBy,
    limit, offset, dateFrom, dateTo, minViews, maxViews, type: type as LegacyType,
  };
}

function buildWhere(params: SearchParams, userId: number | null, now: Date): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = {
    channel: userId === null
      ? { isActive: true, ...(params.niche ? { niche: params.niche } : {}) }
      : { isActive: true, userChannels: { some: {
        userId, isActive: true, ...(params.niche ? { niche: params.niche } : {}),
      } } },
  };
  if (params.channelId !== null) where.channelId = params.channelId;
  if (params.q) where.text = { contains: params.q, mode: 'insensitive' };
  if (params.onlyAds || params.type === 'ads' || params.advertiser) where.isAd = true;
  if (params.advertiser) where.mentions = { some: { type: 'mention',
    targetUsername: { equals: params.advertiser, mode: 'insensitive' } } };
  if (params.type === 'partners') where.OR = [
    { text: { contains: 'партнер', mode: 'insensitive' } },
    { text: { contains: 'партнёр', mode: 'insensitive' } },
    { text: { contains: 'коллаб', mode: 'insensitive' } },
    { text: { contains: 'совместн', mode: 'insensitive' } },
    { text: { contains: 't.me/', mode: 'insensitive' } },
  ];
  if (params.days !== null) where.publishedAt = { gte: new Date(now.getTime() - params.days * 86_400_000) };
  else if (params.dateFrom || params.dateTo) where.publishedAt = {
    ...(params.dateFrom ? { gte: params.dateFrom } : {}),
    ...(params.dateTo ? { lte: params.dateTo } : {}),
  };
  if (params.minViews !== null || params.maxViews !== null) where.views = {
    ...(params.minViews !== null ? { gte: params.minViews } : {}),
    ...(params.maxViews !== null ? { lte: params.maxViews } : {}),
  };
  return where;
}

function buildMetricSortQuery(params: SearchParams, userId: number | null, now: Date): Prisma.Sql {
  const filters: Prisma.Sql[] = [Prisma.sql`c."isActive" = true`];
  if (userId !== null) {
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "user_channels" uc WHERE uc."channel_id" = p."channel_id" AND uc."user_id" = ${userId} AND uc."is_active" = true${params.niche ? Prisma.sql` AND uc."niche" = ${params.niche}` : Prisma.empty})`);
  } else if (params.niche) {
    filters.push(Prisma.sql`c."niche" = ${params.niche}`);
  }
  if (params.channelId !== null) filters.push(Prisma.sql`p."channel_id" = ${params.channelId}`);
  if (params.q) {
    const escaped = params.q.replace(/[\\%_]/g, character => `\\${character}`);
    filters.push(Prisma.sql`p."text" ILIKE ${`%${escaped}%`} ESCAPE E'\\\\'`);
  }
  if (params.onlyAds || params.type === 'ads' || params.advertiser) filters.push(Prisma.sql`p."is_ad" = true`);
  if (params.advertiser) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "mentions" m WHERE m."source_post_id" = p."id" AND m."type" = 'mention' AND LOWER(m."target_username") = ${params.advertiser})`);
  if (params.days !== null) filters.push(Prisma.sql`p."published_at" >= ${new Date(now.getTime() - params.days * 86_400_000)}`);
  if (params.minViews !== null) filters.push(Prisma.sql`p."views" >= ${params.minViews}`);
  if (params.maxViews !== null) filters.push(Prisma.sql`p."views" <= ${params.maxViews}`);
  const metric = params.sortBy === 'er'
    ? Prisma.sql`CASE WHEN p."subscribers_at_publish" > 0 THEN (COALESCE(p."views", 0) + COALESCE(p."reactions", 0) + COALESCE(p."comments", 0) + COALESCE(p."forwards", 0)) * 100.0 / p."subscribers_at_publish" END`
    : Prisma.sql`CASE WHEN p."views" > 0 THEN (COALESCE(p."reactions", 0) + COALESCE(p."comments", 0) + COALESCE(p."forwards", 0)) * 100.0 / p."views" END`;
  return Prisma.sql`SELECT p."id" FROM "posts" p JOIN "channels" c ON c."id" = p."channel_id"
    WHERE ${Prisma.join(filters, ' AND ')}
    ORDER BY ${metric} DESC NULLS LAST, p."published_at" DESC, p."id" DESC
    LIMIT ${params.limit} OFFSET ${params.offset}`;
}

function orderBy(sortBy: SortBy): Prisma.PostOrderByWithRelationInput[] {
  if (sortBy === 'views' || sortBy === 'views_asc') return [
    { views: { sort: sortBy === 'views' ? 'desc' : 'asc', nulls: 'last' } },
    { publishedAt: 'desc' }, { id: 'desc' },
  ];
  if (sortBy === 'forwards') return [
    { forwards: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }, { id: 'desc' },
  ];
  return [{ publishedAt: 'desc' }, { id: 'desc' }];
}

const viralSelect = {
  id: true, channelId: true, publishedAt: true, views: true, reactions: true,
  comments: true, forwards: true, subscribersAtPublish: true,
} as const;

type ViralCandidate = Prisma.PostGetPayload<{ select: typeof viralSelect }>;

async function loadViralBaselines(channelIds: number[], now: Date): Promise<Map<number, ViralBaseline | null>> {
  const result = new Map<number, ViralBaseline | null>();
  if (channelIds.length === 0) return result;
  const posts = await prisma.post.findMany({
    where: { channelId: { in: channelIds }, publishedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
    select: { channelId: true, views: true, reactions: true, comments: true, forwards: true },
  });
  const grouped = new Map<number, typeof posts>();
  for (const post of posts) {
    const list = grouped.get(post.channelId) ?? [];
    list.push(post);
    grouped.set(post.channelId, list);
  }
  for (const channelId of channelIds) result.set(channelId, calculateViralBaseline(grouped.get(channelId) ?? []));
  return result;
}

function sortViralCandidates(posts: ViralCandidate[], sortBy: SortBy): ViralCandidate[] {
  const metric = (post: ViralCandidate): number | null => {
    if (sortBy === 'views' || sortBy === 'views_asc') return post.views;
    if (sortBy === 'forwards') return post.forwards;
    if (sortBy === 'er') return calculatePostER(post);
    if (sortBy === 'err') return calculatePostERR(post);
    return null;
  };
  return posts.sort((left, right) => {
    if (sortBy !== 'publishedAt') {
      const leftValue = metric(left);
      const rightValue = metric(right);
      if (leftValue === null && rightValue !== null) return 1;
      if (rightValue === null && leftValue !== null) return -1;
      if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
        return sortBy === 'views_asc' ? leftValue - rightValue : rightValue - leftValue;
      }
    }
    return right.publishedAt.getTime() - left.publishedAt.getTime() || right.id - left.id;
  });
}

async function loadChannelOptions(userId: number | null): Promise<ChannelOption[]> {
  if (userId === null) {
    const channels = await prisma.channel.findMany({
      where: { isActive: true },
      select: { id: true, title: true, username: true, niche: true },
      orderBy: { title: 'asc' },
    });
    return channels.map(channel => ({ id: channel.id, title: channel.title,
      username: channel.username, niche: channel.niche }));
  }
  const subscriptions = await prisma.userChannel.findMany({
    where: { userId, isActive: true, channel: { isActive: true } },
    select: { niche: true, channel: { select: { id: true, title: true, username: true } } },
    orderBy: { channel: { title: 'asc' } },
  });
  return subscriptions.map(subscription => ({
    id: subscription.channel.id, title: subscription.channel.title,
    username: subscription.channel.username, niche: subscription.niche,
  }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const params = parseSearchParams(request.nextUrl.searchParams);
  if (!params) return NextResponse.json({ error: 'Некорректные параметры поиска' }, { status: 400 });

  try {
    const now = new Date();
    const userId = auth.userId;
    const where = buildWhere(params, userId, now);
    const include = {
      channel: { select: { id: true, title: true, username: true, niche: true,
        userChannels: { where: { userId: userId ?? -1 }, select: { niche: true } } } },
      image: { select: { postId: true } },
      mentions: { where: { type: 'mention', targetUsername: { not: null } }, select: { targetUsername: true } },
    } satisfies Prisma.PostInclude;
    const [baseTotal, absoluteTotal, channelOptions] = await Promise.all([
      params.onlyViral ? Promise.resolve(0) : prisma.post.count({ where }),
      params.legacy && params.channelId !== null
        ? prisma.post.count({ where: { channelId: params.channelId, channel: where.channel } })
        : Promise.resolve(null),
      params.legacy ? Promise.resolve<ChannelOption[]>([]) : loadChannelOptions(userId),
    ]);
    let total = baseTotal;
    let viralBaselines: Map<number, ViralBaseline | null> | null = null;
    const posts = params.onlyViral
      ? await (async () => {
        const candidates = await prisma.post.findMany({ where, select: viralSelect });
        viralBaselines = await loadViralBaselines([...new Set(candidates.map(post => post.channelId))], now);
        const viral = sortViralCandidates(candidates.filter(post =>
          classifyViralPost(post, viralBaselines?.get(post.channelId) ?? null).isViral), params.sortBy);
        total = viral.length;
        const ids = viral.slice(params.offset, params.offset + params.limit).map(post => post.id);
        if (ids.length === 0) return [];
        const fetched = await prisma.post.findMany({ where: { AND: [where, { id: { in: ids } }] }, include });
        const byId = new Map(fetched.map(post => [post.id, post]));
        return ids.flatMap(id => { const post = byId.get(id); return post ? [post] : []; });
      })()
      : params.sortBy === 'er' || params.sortBy === 'err'
      ? await (async () => {
        const ids = (await prisma.$queryRaw<Array<{ id: number }>>(buildMetricSortQuery(params, userId, now)))
          .map(row => row.id);
        if (ids.length === 0) return [];
        const fetched = await prisma.post.findMany({ where: { AND: [where, { id: { in: ids } }] }, include });
        const byId = new Map(fetched.map(post => [post.id, post]));
        return ids.flatMap(id => { const post = byId.get(id); return post ? [post] : []; });
      })()
      : await prisma.post.findMany({ where, include, orderBy: orderBy(params.sortBy), skip: params.offset, take: params.limit });

    viralBaselines ??= await loadViralBaselines([...new Set(posts.map(post => post.channelId))], now);

    const enriched = posts.map(post => ({
      ...post,
      messageId: post.messageId.toString(),
      groupedId: post.groupedId?.toString() ?? null,
      channel: {
        id: post.channel.id, title: post.channel.title, username: post.channel.username,
        niche: userId === null ? post.channel.niche : post.channel.userChannels[0]?.niche ?? post.channel.niche,
      },
      hasImage: post.image !== null,
      mentions: [...new Set(post.mentions.flatMap(mention => mention.targetUsername ? [mention.targetUsername] : []))],
      er: calculatePostER(post),
      err: calculatePostERR(post),
      reactionBreakdown: parseReactionBreakdown(post.reactionBreakdown),
      ...classifyViralPost(post, viralBaselines?.get(post.channelId) ?? null),
      ad: detectAd(post.text),
      image: undefined,
    }));
    if (params.legacy) return NextResponse.json({ posts: enriched, total, absoluteTotal });
    return NextResponse.json({ posts: enriched, total, channels: channelOptions,
      niches: [...new Set(channelOptions.map(channel => channel.niche))].sort() });
  } catch (error) {
    logger.error('GET /api/posts/search error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось найти публикации' }, { status: 500 });
  }
}
