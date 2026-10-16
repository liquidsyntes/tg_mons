import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken, verifyServiceBearerToken } from '@/lib/auth';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  if (path === '/api/health' || path === '/api/auth/login') return NextResponse.next();

  const auth = path.startsWith('/api/internal/')
    ? await verifyServiceBearerToken(request)
    : await verifyBearerToken(request);
  if (auth.authorized) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  if (path.startsWith('/api/')) return auth.response;
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: [
    '/',
    '/channel/:path*',
    '/compare',
    '/reports/:path*',
    '/events',
    '/settings',
    '/api/:path*',
  ],
};
