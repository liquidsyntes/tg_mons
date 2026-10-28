import { NextRequest, NextResponse } from 'next/server';
import { hasSameOrigin, isSecureRequest, verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createTelegramFlow, encodeTelegramCookie, telegramAppUrl, TELEGRAM_FLOW_COOKIE, TELEGRAM_FLOW_SECONDS } from '@/lib/telegram-login';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  }

  let mode: string | null;
  try {
    mode = (await request.formData()).get('mode')?.toString() ?? 'login';
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  if (mode !== 'login' && mode !== 'link') {
    return NextResponse.json({ error: 'Некорректный режим входа' }, { status: 400 });
  }
  if (process.env.TELEGRAM_LOGIN_REDIRECT_URI
    && new URL(process.env.TELEGRAM_LOGIN_REDIRECT_URI).origin !== request.headers.get('origin')) {
    return NextResponse.redirect(telegramAppUrl(mode === 'link'
      ? '/settings?telegramError=unavailable' : '/login?telegramError=unavailable', request.url), { status: 303 });
  }
  let userId: number | null = null;
  if (mode === 'link') {
    const auth = await verifyBearerToken(request);
    if (!auth.authorized) return auth.response;
    if (auth.userId === null) {
      return NextResponse.json({ error: 'Привязка требует учётной записи' }, { status: 403 });
    }
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { accessStatus: true } });
    if (!user || user.accessStatus !== 'ACTIVE') {
      return NextResponse.json({ error: 'Доступ к аккаунту закрыт' }, { status: 403 });
    }
    userId = auth.userId;
  }

  try {
    const { flow, authorizationUrl } = await createTelegramFlow(mode, userId);
    const response = NextResponse.redirect(authorizationUrl, { status: 303 });
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set({
      name: TELEGRAM_FLOW_COOKIE,
      value: encodeTelegramCookie(flow, 'flow'),
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      maxAge: TELEGRAM_FLOW_SECONDS,
      path: '/api/auth/telegram',
    });
    return response;
  } catch {
    const target = mode === 'link' ? '/settings?telegramError=unavailable' : '/login?telegramError=unavailable';
    return NextResponse.redirect(telegramAppUrl(target, request.url), { status: 303 });
  }
}
