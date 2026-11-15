import { NextRequest, NextResponse } from 'next/server';
import { extractRequestSession } from '@/lib/auth';
import {
  buildMultiChannelComparison,
  buildTagBenchmarkProfile,
  type CompareChannelData,
  type CompareMentionRecord,
  type ComparePeriod,
} from '@/lib/compare';
import { logger } from '@/lib/logger';
import { getChannelDetailStats, parseStatsPeriod } from '@/lib/metrics';
import { prisma } from '@/lib/prisma';
import type { ChannelDetailStats } from '@/lib/types';
import { listUserChannels } from '@/lib/user-channels';

const MAX_COMPARE_CHANNELS = 4;
const MAX_TAG_LENGTH = 30;
const MS_30D = 30 * 24 * 60 * 60 * 1000;

interface ParsedCompareQuery {
  ids: number[];
  benchmarkTag: string | null;
  period: ComparePeriod;
}

function parsePositiveIntegerId(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseCompareQuery(searchParams: URLSearchParams): { data?: ParsedCompareQuery; error?: string } {
  const period = parseStatsPeriod(searchParams.get('period'));
  const rawBenchmarkTag = searchParams.get('benchmarkTag');
  const benchmarkTag = rawBenchmarkTag !== null ? rawBenchmarkTag.trim() || null : null;

  if (benchmarkTag !== null && benchmarkTag.length > MAX_TAG_LENGTH) {
    return { error: 'Название папки для сравнения слишком длинное (максимум 30 символов)' };
  }

  let ids: number[] = [];

  if (searchParams.has('ids')) {
    const rawIds = (searchParams.get('ids') ?? '').trim();
    if (!rawIds) {
      return { error: 'Параметр ids не должен быть пустым' };
    }
    const parts = rawIds.split(',');
    for (const part of parts) {
      const parsed = parsePositiveIntegerId(part);
      if (parsed === null) {
        return { error: 'Некорректные ID каналов в параметре ids' };
      }
      ids.push(parsed);
    }
  } else {
    const rawA = searchParams.get('a');
    const rawB = searchParams.get('b');
    if (rawA !== null && rawA.trim() !== '') {
      const parsedA = parsePositiveIntegerId(rawA);
      if (parsedA === null) {
        return { error: 'Некорректный ID канала a' };
      }
      ids.push(parsedA);
    }
    if (rawB !== null && rawB.trim() !== '') {
      const parsedB = parsePositiveIntegerId(rawB);
      if (parsedB === null) {
        return { error: 'Некорректный ID канала b' };
      }
      ids.push(parsedB);
    }
  }

  if (new Set(ids).size !== ids.length) {
    return { error: 'Каналы для сравнения не должны повторяться' };
  }

  if (ids.length > MAX_COMPARE_CHANNELS) {
    return { error: `Можно сравнивать не более ${MAX_COMPARE_CHANNELS} каналов одновременно` };
  }

  const totalParticipants = ids.length + (benchmarkTag ? 1 : 0);
  if (ids.length === 0 || totalParticipants < 2) {
    return { error: 'Необходимо выбрать минимум 2 канала для сравнения (или канал и папку)' };
  }

  return { data: { ids, benchmarkTag, period } };
}

async function fetchChannelStats(
  channelId: number,
  period: ComparePeriod,
  userId: number | null
): Promise<ChannelDetailStats | null> {
  return userId !== null
    ? getChannelDetailStats(channelId, period, userId)
    : getChannelDetailStats(channelId, period);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = parseCompareQuery(searchParams);
    if (!parsed.data) {
      return NextResponse.json({ error: parsed.error ?? 'Некорректные параметры запроса' }, { status: 400 });
    }

    const { ids, benchmarkTag, period } = parsed.data;
    const session = await extractRequestSession(req);

    const fetchedStats = await Promise.all(ids.map((id) => fetchChannelStats(id, period, session.userId)));
    const statsById = new Map<number, ChannelDetailStats>();
    const missingIds: number[] = [];

    ids.forEach((id, index) => {
      const stats = fetchedStats[index];
      if (stats) {
        statsById.set(id, stats);
      } else {
        missingIds.push(id);
      }
    });

    if (missingIds.length > 0) {
      if (session.userId !== null && typeof prisma.channel?.findMany === 'function') {
        const existingChannels = await prisma.channel.findMany({
          where: { id: { in: missingIds } },
          select: { id: true },
        });
        if (existingChannels.length > 0) {
          return NextResponse.json(
            { error: 'Нет доступа к одному из выбранных каналов' },
            { status: 403 }
          );
        }
      }
      return NextResponse.json({ error: 'Один из каналов не найден' }, { status: 404 });
    }

    const realParticipants = ids.map((id) => statsById.get(id)!);

    let benchmarkProfile = null;
    if (benchmarkTag) {
      const activeUserChannels = await listUserChannels(session.userId, { onlyActive: true });
      const taggedChannels = activeUserChannels.filter((ch) => (ch.tags ?? []).includes(benchmarkTag));

      if (taggedChannels.length === 0) {
        return NextResponse.json(
          { error: `В папке «${benchmarkTag}» нет активных каналов` },
          { status: 404 }
        );
      }

      const cohortStats = (
        await Promise.all(
          taggedChannels.map(async (ch) => statsById.get(ch.id) ?? fetchChannelStats(ch.id, period, session.userId))
        )
      ).filter((item): item is ChannelDetailStats => item !== null);

      benchmarkProfile = buildTagBenchmarkProfile(benchmarkTag, cohortStats, period);
      if (!benchmarkProfile) {
        return NextResponse.json(
          { error: `Не удалось рассчитать бенчмарк для папки «${benchmarkTag}»` },
          { status: 404 }
        );
      }
    }

    const mentionsByChannel = new Map<number, CompareMentionRecord[]>();
    if (typeof prisma.mention?.findMany === 'function' && realParticipants.length > 0) {
      const date30dAgo = new Date(Date.now() - MS_30D);
      const mentionRows = await prisma.mention.findMany({
        where: {
          sourceChannelId: { in: ids },
          sourcePost: { publishedAt: { gte: date30dAgo } },
        },
        select: {
          sourceChannelId: true,
          targetUsername: true,
          targetTgId: true,
          type: true,
          sourcePost: { select: { isAd: true } },
        },
      });

      for (const row of mentionRows) {
        const list = mentionsByChannel.get(row.sourceChannelId) ?? [];
        list.push({
          sourceChannelId: row.sourceChannelId,
          targetUsername: row.targetUsername,
          targetTgId: row.targetTgId ? row.targetTgId.toString() : null,
          type: row.type,
          isAd: Boolean(row.sourcePost?.isAd),
        });
        mentionsByChannel.set(row.sourceChannelId, list);
      }
    }

    const comparisonInputs: CompareChannelData[] = realParticipants.map((item) => ({
      ...item,
      mentions: mentionsByChannel.get(item.channel.id) ?? [],
    }));
    if (benchmarkProfile) {
      comparisonInputs.push(benchmarkProfile.participant);
    }

    const comparison = buildMultiChannelComparison(comparisonInputs, period);
    const participants: CompareChannelData[] = [
      ...realParticipants,
      ...(benchmarkProfile ? [benchmarkProfile.participant] : []),
    ];

    return NextResponse.json({
      a: participants[0],
      b: participants[1] ?? participants[0],
      period,
      participants,
      comparison,
      benchmarkProfile,
    });
  } catch (error: unknown) {
    logger.error('GET /api/stats/compare error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
