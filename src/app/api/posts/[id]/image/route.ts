import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyBearerToken } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const { id } = await context.params;
  const postId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(postId)) {
    return NextResponse.json({ error: 'Некорректный ID поста' }, { status: 400 });
  }

  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { channel: { select: {
        isActive: true,
        userChannels: { where: { userId: auth.userId ?? -1, isActive: true }, select: { id: true } },
      } } },
    });
    if (!post?.channel.isActive || (auth.userId !== null && post.channel.userChannels.length === 0)) {
      return NextResponse.json({ error: 'Изображение не найдено' }, { status: 404 });
    }
    const image = await prisma.postImage.findUnique({ where: { postId } });
    if (!image) return NextResponse.json({ error: 'Изображение не найдено' }, { status: 404 });

    return new NextResponse(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.contentType,
        'Content-Length': String(image.data.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('GET /api/posts/[id]/image error', { postId }, error);
    return NextResponse.json({ error: 'Не удалось загрузить изображение' }, { status: 500 });
  }
}
