import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifyBearerToken, verifyServiceBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  if (path === '/api/health' || path === '/api/auth/login' || path === '/api/auth/register'
    || path === '/api/auth/telegram/start' || path === '/api/auth/telegram/callback') return NextResponse.next();

  const auth = path.startsWith('/api/internal/')
    ? await verifyServiceBearerToken(request)
    : await verifyBearerToken(request);
  if (auth.authorized) {
    if (auth.userId !== null) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: auth.userId }, select: { role: true, accessStatus: true },
        });
        if (!user || user.role !== auth.role || user.accessStatus === 'BLOCKED') {
          const response = path.startsWith('/api/')
            ? NextResponse.json({ error: 'Доступ к аккаунту закрыт' }, { status: 403 })
            : NextResponse.redirect(new URL('/login?telegramError=blocked', request.url));
          response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', expires: new Date(0), path: '/' });
          return response;
        }
        if (user.accessStatus === 'PENDING') {
          if (path === '/pending' || path === '/api/auth/me' || path === '/api/auth/logout') {
            return NextResponse.next();
          }
          return path.startsWith('/api/')
            ? NextResponse.json({ error: 'Ожидается подтверждение администратора' }, { status: 403 })
            : NextResponse.redirect(new URL('/pending', request.url));
        }
      } catch {
        return path.startsWith('/api/')
          ? NextResponse.json({ error: 'Не удалось проверить доступ' }, { status: 503 })
          : NextResponse.redirect(new URL('/login?telegramError=unavailable', request.url));
      }
    }
    if (path === '/pending') return NextResponse.redirect(new URL('/', request.url));
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  if (path.startsWith('/api/')) return auth.response;
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/',
    '/channel/:path*',
    '/compare',
    '/reports/:path*',
    '/events',
    '/settings',
    '/posts',
    '/pending',
    '/api/:path*',
  ],
};
