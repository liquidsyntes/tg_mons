import { NextRequest, NextResponse } from 'next/server';
import { isSecureRequest, SESSION_COOKIE_NAME, verifyBearerToken } from '@/lib/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'strict',
    expires: new Date(0),
    path: '/',
  });
  return response;
}
