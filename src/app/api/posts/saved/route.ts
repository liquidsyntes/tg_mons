import { loadPublicationResults } from '@/lib/publication-results';
import { performanceCoverage, selectPerformanceSample, PERFORMANCE_HOURS } from '@/lib/metrics/publication-performance';
import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { metricsCache } from '@/lib/cache';
import { getBestTimeRecommendation } from '@/lib/metrics/best-time';
import {
  buildContentPlanFormatGuidance,
  isValidContentPlanStatus,
  suggestNextPublishSlots,
} from '@/lib/metrics/content-plan';
import { findUserMyChannel } from '@/lib/user-channels';
import type { ContentPlanRecommendations, ContentPlanStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_SAVED_POST_NOTE_LENGTH = 500;
const MAX_SAVED_POST_DRAFT_LENGTH = 4000;
const MY_CHANNEL_LOOKBACK_DAYS = 60;

const SAVED_POST_SELECT = {
  id: true,
  postId: true,
  publishedPostId: true,
  publicationLinkedAt: true,
  note: true,
  status: true,
  plannedFor: true,
  draftText: true,
  createdAt: true,
  updatedAt: true,
} as const;

function parsePositiveId(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === 'string' && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function parsePlannedFor(raw: unknown): { valid: true; value: Date | null } | { valid: false } {
  if (raw === null) return { valid: true, value: null };
  if (typeof raw !== 'string') return { valid: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { valid: true, value: null };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { valid: false };
  return { valid: true, value: parsed };
}

async function loadContentPlanRecommendations(
  userId: number,
  savedPosts: ReadonlyArray<{ plannedFor: Date | string | null }>,
): Promise<ContentPlanRecommendations> {
  const existingPlannedDates = savedPosts.map((item) => item.plannedFor);
  let bestTime = null;
  try {
    bestTime = await getBestTimeRecommendation(userId);
  } catch (error) {
    logger.warn('GET /api/posts/saved failed to load best-time recommendations:', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const slots = suggestNextPublishSlots(bestTime, existingPlannedDates, new Date(), 4);

  let formatGuidance = null;
  try {
    const myChannel = await findUserMyChannel(userId);
    if (myChannel && typeof prisma.post?.findMany === 'function') {
      const since = new Date(Date.now() - MY_CHANNEL_LOOKBACK_DAYS * 86_400_000);
      const [myPosts, latestSnapshot] = await Promise.all([
        prisma.post.findMany({
          where: {
            channelId: myChannel.id,
            publishedAt: { gte: since },
          },
          orderBy: { publishedAt: 'desc' },
          take: 200,
          select: {
            publishedAt: true,
            text: true,
            views: true,
            reactions: true,
            comments: true,
            forwards: true,
            subscribersAtPublish: true,
            contentType: true,
          },
        }),
        typeof prisma.snapshot?.findFirst === 'function'
          ? prisma.snapshot.findFirst({
              where: { channelId: myChannel.id },
              orderBy: { collectedAt: 'desc' },
              select: { membersCount: true },
            })
          : Promise.resolve(null),
      ]);

      formatGuidance = buildContentPlanFormatGuidance(
        {
          id: myChannel.id,
          title: myChannel.title,
          lastCollectedAt: myChannel.lastCollectedAt,
          posts: myPosts,
          subscribersCount: latestSnapshot?.membersCount ?? null,
        },
        slots,
      );
    }
  } catch (error) {
    logger.warn('GET /api/posts/saved failed to compute myChannel format guidance:', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { slots, formatGuidance };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.userId === null) {
    return NextResponse.json({
      savedPosts: [],
      recommendations: { slots: [], formatGuidance: null },
      coverage:performanceCoverage([],30),
    });
  }

  try {
    const savedPosts = await prisma.userSavedPost.findMany({
      where: {
        userId: auth.userId,
        post: {
          channel: {
            isActive: true,
            userChannels: {
              some: { userId: auth.userId, isActive: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: SAVED_POST_SELECT,
    });

    const days=Number(request.nextUrl.searchParams.get('coverageDays')??30);
    if(![7,30,90].includes(days))return NextResponse.json({error:'Некорректный период'},{status:400});
    const now=new Date();
    const coveragePosts=await prisma.post.findMany({where:{publishedAt:{gte:new Date(now.getTime()-days*86400000),lte:now},publicationPlans:{some:{userId:auth.userId,post:{channel:{isActive:true,userChannels:{some:{userId:auth.userId,isActive:true}}}}}},channel:{isActive:true,userChannels:{some:{userId:auth.userId,isActive:true}}}},include:{performanceCheckpoints:true,snapshots:true}});
    const coverage=performanceCoverage(coveragePosts,days,now);
    const recommendations = await loadContentPlanRecommendations(auth.userId, savedPosts);
    const results = await loadPublicationResults(auth.userId,savedPosts);
    return NextResponse.json({ savedPosts: savedPosts.map(p=>({...p,publicationResult:results.get(p.postId)})), recommendations, coverage });
  } catch (error) {
    logger.error('GET /api/posts/saved error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось загрузить закладки' }, { status: 500 });
  }
}

async function handleUpsert(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.userId === null) {
    return NextResponse.json(
      { error: 'Персональные закладки доступны только для пользовательской учётной записи' },
      { status: 403 },
    );
  }

  const userId = auth.userId;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const postId = parsePositiveId(body.postId);
  if (postId === null) {
    return NextResponse.json({ error: 'Некорректный ID публикации' }, { status: 400 });
  }

  const hasPublication = body.publishedPostId !== undefined;
  const publishedPostId = body.publishedPostId === null ? null : parsePositiveId(body.publishedPostId);
  if(hasPublication && body.publishedPostId !== null && publishedPostId === null) return NextResponse.json({error:'Некорректная публикация'},{status:400});

  const hasNote = body.note !== undefined;
  let normalizedNote: string | null = null;
  if (hasNote) {
    if (body.note !== null && typeof body.note !== 'string') {
      return NextResponse.json({ error: 'Некорректный формат заметки' }, { status: 400 });
    }
    const trimmedNote = typeof body.note === 'string' ? body.note.trim() : '';
    if (trimmedNote.length > MAX_SAVED_POST_NOTE_LENGTH) {
      return NextResponse.json(
        { error: `Заметка не должна превышать ${MAX_SAVED_POST_NOTE_LENGTH} символов` },
        { status: 400 },
      );
    }
    normalizedNote = trimmedNote.length > 0 ? trimmedNote : null;
  }

  const hasStatus = body.status !== undefined;
  let parsedStatus: ContentPlanStatus = 'idea';
  if (hasStatus) {
    if (!isValidContentPlanStatus(body.status)) {
      return NextResponse.json({ error: 'Некорректный статус контент-плана' }, { status: 400 });
    }
    parsedStatus = body.status;
  }

  const hasPlannedFor = body.plannedFor !== undefined;
  let normalizedPlannedFor: Date | null = null;
  if (hasPlannedFor) {
    const parsedDate = parsePlannedFor(body.plannedFor);
    if (!parsedDate.valid) {
      return NextResponse.json({ error: 'Некорректная плановая дата публикации' }, { status: 400 });
    }
    normalizedPlannedFor = parsedDate.value;
  }

  const hasDraftText = body.draftText !== undefined;
  let normalizedDraftText: string | null = null;
  if (hasDraftText) {
    if (body.draftText !== null && typeof body.draftText !== 'string') {
      return NextResponse.json({ error: 'Некорректный формат черновика' }, { status: 400 });
    }
    const trimmedDraft = typeof body.draftText === 'string' ? body.draftText.trim() : '';
    if (trimmedDraft.length > MAX_SAVED_POST_DRAFT_LENGTH) {
      return NextResponse.json(
        { error: `Черновик не должен превышать ${MAX_SAVED_POST_DRAFT_LENGTH} символов` },
        { status: 400 },
      );
    }
    normalizedDraftText = trimmedDraft.length > 0 ? trimmedDraft : null;
  }

  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        channelId: true,
        channel: { select: { isActive: true } },
      },
    });
    if (!post || !post.channel.isActive) {
      return NextResponse.json({ error: 'Публикация не найдена' }, { status: 404 });
    }

    const subscription = await prisma.userChannel.findUnique({
      where: {
        userId_channelId: { userId: userId, channelId: post.channelId },
      },
      select: { isActive: true },
    });
    if (!subscription || !subscription.isActive) {
      return NextResponse.json({ error: 'Нет доступа к каналу публикации' }, { status: 403 });
    }

    const savedPost = await prisma.$transaction(async tx => {
      if(hasPublication && publishedPostId !== null) {
        const target = await tx.post.findFirst({where:{id:publishedPostId,deletedAt:null,channel:{isActive:true,userChannels:{some:{userId:userId,isActive:true,isMine:true}}}},include:{snapshots:true,performanceCheckpoints:true}});
        if(!target) return null;
        // Preserve usable historical points before the rolling snapshot cleanup removes them.
        const peers = await tx.post.findMany({where:{channelId:target.channelId,contentType:target.contentType,isAd:target.isAd,publishedAt:{gte:new Date(target.publishedAt.getTime()-30*86400000),lte:target.publishedAt}},include:{snapshots:true,performanceCheckpoints:true}});
        const checkpoints=peers.flatMap(peer=>PERFORMANCE_HOURS.flatMap(hoursAfterPost=>{
          const sample=selectPerformanceSample(peer,hoursAfterPost);
          return sample?[{postId:peer.id,hoursAfterPost,views:sample.views,capturedAt:sample.capturedAt,source:'snapshot'}]:[];
        }));
        if(checkpoints.length) await tx.postPerformanceCheckpoint.createMany({data:checkpoints,skipDuplicates:true});
      }
      return tx.userSavedPost.upsert({
      where: {
        userId_postId: { userId: userId, postId },
      },
      create: {
        userId: userId,
        postId,
        status: hasPublication && publishedPostId !== null ? 'published' : parsedStatus,
        ...(hasPublication ? {publishedPostId,publicationLinkedAt:publishedPostId === null ? null : new Date()} : {}),
        ...(hasNote ? { note: normalizedNote } : { note: null }),
        ...(hasPlannedFor ? { plannedFor: normalizedPlannedFor } : {}),
        ...(hasDraftText ? { draftText: normalizedDraftText } : {}),
      },
      update: {
        ...(hasNote ? { note: normalizedNote } : {}),
        ...(hasStatus ? { status: parsedStatus } : {}),
        ...(hasPublication ? {publishedPostId,publicationLinkedAt:publishedPostId === null ? null : new Date(),...(publishedPostId !== null ? {status:'published'} : {})} : {}),
        ...(hasPlannedFor ? { plannedFor: normalizedPlannedFor } : {}),
        ...(hasDraftText ? { draftText: normalizedDraftText } : {}),
      },
      select: SAVED_POST_SELECT,
      });
    });
    if(!savedPost) return NextResponse.json({error:'Публикация недоступна или не относится к вашему каналу'},{status:403});

    metricsCache.invalidate();
    return NextResponse.json({ savedPost });
  } catch (error) {
    logger.error('POST /api/posts/saved error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось сохранить закладку' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleUpsert(request);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleUpsert(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.userId === null) {
    return NextResponse.json(
      { error: 'Персональные закладки доступны только для пользовательской учётной записи' },
      { status: 403 },
    );
  }

  let postId = parsePositiveId(request.nextUrl.searchParams.get('postId'));
  if (postId === null) {
    const body = await request.json().catch(() => null);
    postId = parsePositiveId(body?.postId);
  }
  if (postId === null) {
    return NextResponse.json({ error: 'Некорректный ID публикации' }, { status: 400 });
  }

  try {
    await prisma.userSavedPost.deleteMany({
      where: { userId: auth.userId, postId },
    });
    metricsCache.invalidate();
    return NextResponse.json({ success: true, postId });
  } catch (error) {
    logger.error('DELETE /api/posts/saved error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось удалить закладку' }, { status: 500 });
  }
}
