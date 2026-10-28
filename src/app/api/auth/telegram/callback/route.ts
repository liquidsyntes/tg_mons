import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookieValue, isSecureRequest, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, type UserRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  decodeTelegramCookie, encodeTelegramCookie, exchangeTelegramCode, internalTelegramUsername, isTelegramFlow,
  telegramAppUrl, TELEGRAM_FLOW_COOKIE, TELEGRAM_FLOW_SECONDS, TELEGRAM_LINK_COOKIE,
} from '@/lib/telegram-login';

export const dynamic = 'force-dynamic';

function redirectWithClearedFlow(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(telegramAppUrl(path, request.url), { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set({ name: TELEGRAM_FLOW_COOKIE, value: '', expires: new Date(0), path: '/api/auth/telegram' });
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const flow = decodeTelegramCookie(request.cookies.get(TELEGRAM_FLOW_COOKIE)?.value, 'flow', isTelegramFlow);
  if (!flow || request.nextUrl.searchParams.get('state') !== flow.state
    || !request.nextUrl.searchParams.get('code')) {
    return redirectWithClearedFlow(request, '/login?telegramError=invalid');
  }

  let stage: 'exchange' | 'account' = 'exchange';
  try {
    const profile = await exchangeTelegramCode(request.nextUrl, flow);
    stage = 'account';
    if (flow.mode === 'link') {
      if (!Number.isSafeInteger(flow.userId) || flow.userId === null || flow.userId <= 0) {
        return redirectWithClearedFlow(request, '/login?telegramError=invalid');
      }
      const response = redirectWithClearedFlow(request, '/settings?telegramLink=ready');
      response.cookies.set({
        name: TELEGRAM_LINK_COOKIE,
        value: encodeTelegramCookie({ profile, userId: flow.userId,
          expiresAt: Date.now() + TELEGRAM_FLOW_SECONDS * 1000 }, 'link'),
        httpOnly: true,
        secure: isSecureRequest(request),
        sameSite: 'strict',
        maxAge: TELEGRAM_FLOW_SECONDS,
        path: '/api/auth/telegram/link',
      });
      return response;
    }

    let user = await prisma.user.findUnique({ where: { telegramSub: profile.sub } });
    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            username: internalTelegramUsername(profile.sub),
            passwordHash: null,
            role: 'USER',
            accessStatus: 'PENDING',
            telegramSub: profile.sub,
            telegramName: profile.name,
            telegramUsername: profile.username,
            telegramPhotoUrl: profile.photoUrl,
          },
        });
      } catch {
        user = await prisma.user.findUnique({ where: { telegramSub: profile.sub } });
        if (!user) throw new Error('Could not create Telegram account');
      }
    } else if (user.accessStatus !== 'BLOCKED') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { telegramName: profile.name, telegramUsername: profile.username, telegramPhotoUrl: profile.photoUrl },
      });
    }

    if (user.accessStatus === 'BLOCKED') {
      return redirectWithClearedFlow(request, '/login?telegramError=blocked');
    }
    const role: UserRole = user.role === 'ADMIN' ? 'ADMIN' : 'USER';
    const response = redirectWithClearedFlow(request, user.accessStatus === 'PENDING' ? '/pending' : '/');
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: await createSessionCookieValue({ userId: user.id, role }),
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    return response;
  } catch (error) {
    logger.warn('Telegram Login callback failed', { stage, reason: error instanceof Error ? error.name : 'unknown' });
    return redirectWithClearedFlow(request, '/login?telegramError=failed');
  }
}
