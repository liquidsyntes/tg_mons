import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { metricsCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const MAX_SAVED_POST_NOTE_LENGTH = 500;

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.userId === null) {
    return NextResponse.json({ savedPosts: [] });
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
      select: { id: true, postId: true, note: true, createdAt: true },
    });
    return NextResponse.json({ savedPosts });
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
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const postId = parsePositiveId(body?.postId);
  if (postId === null) {
    return NextResponse.json({ error: 'Некорректный ID публикации' }, { status: 400 });
  }

  const rawNote = body?.note;
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    return NextResponse.json({ error: 'Некорректный формат заметки' }, { status: 400 });
  }

  const trimmedNote = typeof rawNote === 'string' ? rawNote.trim() : '';
  if (trimmedNote.length > MAX_SAVED_POST_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Заметка не должна превышать ${MAX_SAVED_POST_NOTE_LENGTH} символов` },
      { status: 400 }
    );
  }
  const normalizedNote = trimmedNote.length > 0 ? trimmedNote : null;

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
        userId_channelId: { userId: auth.userId, channelId: post.channelId },
      },
      select: { isActive: true },
    });
    if (!subscription || !subscription.isActive) {
      return NextResponse.json({ error: 'Нет доступа к каналу публикации' }, { status: 403 });
    }

    const savedPost = await prisma.userSavedPost.upsert({
      where: {
        userId_postId: { userId: auth.userId, postId },
      },
      create: {
        userId: auth.userId,
        postId,
        note: normalizedNote,
      },
      update: {
        note: normalizedNote,
      },
      select: { id: true, postId: true, note: true, createdAt: true },
    });

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
      { status: 403 }
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
