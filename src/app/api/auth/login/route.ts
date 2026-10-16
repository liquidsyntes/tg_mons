import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionCookieValue,
  hasSameOrigin,
  isSecureRequest,
  isValidAccessKey,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  }
  if (!process.env.COLLECT_API_TOKEN) {
    return NextResponse.json({ error: 'Ключ доступа не настроен на сервере' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const accessKey = body && typeof body === 'object' && 'accessKey' in body ? body.accessKey : undefined;
  if (!isValidAccessKey(accessKey)) {
    return NextResponse.json({ error: 'Неверный ключ доступа' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await createSessionCookieValue(),
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
