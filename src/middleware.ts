import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware: injects Bearer token into mutating API requests from the client.
 * The token is read from server-side env (COLLECT_API_TOKEN) and never exposed to the browser.
 * This allows client components to call POST/PATCH/DELETE/PUT without manually adding
 * an Authorization header.
 */
export function middleware(req: NextRequest) {
  // Only inject for mutating methods
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return NextResponse.next();
  }

  // Only for /api/ routes
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // If the request already has an Authorization header (e.g., external caller), leave it
  if (req.headers.has('authorization')) {
    return NextResponse.next();
  }

  const token = process.env.COLLECT_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'COLLECT_API_TOKEN не задан на сервере' },
      { status: 500 }
    );
  }

  // Clone the request and add the Authorization header
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: '/api/:path*',
};
