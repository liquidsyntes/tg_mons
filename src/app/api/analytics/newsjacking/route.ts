import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { detectNewsTopicClusters, type NewsjackingSourcePost } from '@/lib/metrics/newsjacking';
import { prisma } from '@/lib/prisma';
import type { NewsjackingApiResponse, NewsjackingWindowHours } from '@/lib/types';
import { listUserChannels } from '@/lib/user-channels';

export const dynamic = 'force-dynamic';

const HOUR_MS = 3_600_000;
const MAX_POSTS_PER_QUERY = 5000;

function parseWindowHours(raw: string | null): NewsjackingWindowHours | null {
  if (raw === null) return 48;
  if (raw === '24') return 24;
  if (raw === '48') return 48;
  if (raw === '72') return 72;
  return null;
}

function parseMinChannels(raw: string | null): number | null {
  if (raw === null) return 2;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 2 && parsed <= 10 ? parsed : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const searchParams = request.nextUrl.searchParams;
  const hours = parseWindowHours(searchParams.get('hours'));
  const minChannels = parseMinChannels(searchParams.get('minChannels'));

  const rawTag = searchParams.get('tag');
  const tag = rawTag !== null ? rawTag.trim() || null : null;

  const rawNiche = searchParams.get('niche');
  const niche = rawNiche !== null ? rawNiche.trim() || null : null;

  if (
    hours === null ||
    minChannels === null ||
    (tag !== null && tag.length > 30) ||
    (niche !== null && niche.length > 64)
  ) {
    return NextResponse.json(
      { error: 'Некорректные параметры анализа инфоповодов' },
      { status: 400 },
    );
  }

  try {
    const accessibleChannels = await listUserChannels(auth.userId, { onlyActive: true });
    const myChannelId = accessibleChannels.find((channel) => channel.isMine)?.id ?? null;

    const tagSet = new Set<string>();
    for (const channel of accessibleChannels) {
      for (const itemTag of channel.tags) {
        if (itemTag) tagSet.add(itemTag);
      }
    }
    const availableTags = [...tagSet].sort((a, b) => a.localeCompare(b, 'ru'));

    const filteredChannels = accessibleChannels.filter((channel) => {
      if (niche && channel.niche !== niche) return false;
      if (tag && !channel.tags.includes(tag)) return false;
      return true;
    });

    if (filteredChannels.length === 0) {
      const emptyPayload: NewsjackingApiResponse = {
        windowHours: hours,
        analyzedPostsCount: 0,
        totalClusters: 0,
        uncoveredByMyChannelCount: 0,
        clusters: [],
        speedLeaderboard: [],
        tag,
        niche,
        myChannelId,
        availableTags,
      };
      return NextResponse.json(emptyPayload);
    }

    const now = new Date();
    const since = new Date(now.getTime() - hours * HOUR_MS);
    const channelById = new Map(filteredChannels.map((channel) => [channel.id, channel]));

    const posts = await prisma.post.findMany({
      where: {
        channelId: { in: filteredChannels.map((channel) => channel.id) },
        isAd: false,
        deletedAt: null,
        publishedAt: { gte: since, lte: now },
      },
      select: {
        id: true,
        messageId: true,
        channelId: true,
        publishedAt: true,
        text: true,
        isAd: true,
        views: true,
        reactions: true,
        comments: true,
        forwards: true,
        mentions: {
          select: {
            targetUsername: true,
            targetTgId: true,
            targetMessageId: true,
            type: true,
          },
        },
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      take: MAX_POSTS_PER_QUERY,
    });

    const sourcePosts: NewsjackingSourcePost[] = posts.flatMap((post) => {
      const channel = channelById.get(post.channelId);
      if (!channel) return [];
      return [
        {
          id: post.id,
          messageId: post.messageId,
          channelId: post.channelId,
          channelTitle: channel.title,
          channelUsername: channel.username,
          channelTgId: channel.tgId,
          isMine: channel.isMine,
          publishedAt: post.publishedAt,
          text: post.text,
          isAd: post.isAd,
          views: post.views,
          reactions: post.reactions,
          comments: post.comments,
          forwards: post.forwards,
          mentions: post.mentions,
        },
      ];
    });

    const analysis = detectNewsTopicClusters(sourcePosts, {
      windowHours: hours,
      now,
      minChannels,
    });

    const payload: NewsjackingApiResponse = {
      ...analysis,
      tag,
      niche,
      myChannelId,
      availableTags,
    };

    return NextResponse.json(payload);
  } catch (error) {
    logger.error('GET /api/analytics/newsjacking error:', undefined, error);
    return NextResponse.json(
      { error: 'Не удалось проанализировать скорость реакции на инфоповоды' },
      { status: 500 },
    );
  }
}
