import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parsePostSearchParams, searchPosts } from '@/lib/posts-search';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const params = parsePostSearchParams(request.nextUrl.searchParams);
  if (!params) return NextResponse.json({ error: 'Некорректные параметры поиска' }, { status: 400 });

  try {
    return NextResponse.json(await searchPosts(params, auth.userId));
  } catch (error) {
    logger.error('GET /api/posts/search error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось найти публикации' }, { status: 500 });
  }
}
