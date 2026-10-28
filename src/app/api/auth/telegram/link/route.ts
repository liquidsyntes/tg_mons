import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decodeTelegramCookie, isTelegramLinkProof, TELEGRAM_LINK_COOKIE } from '@/lib/telegram-login';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.userId === null) return NextResponse.json({ error: 'Требуется учётная запись' }, { status: 403 });
  const proof = decodeTelegramCookie(request.cookies.get(TELEGRAM_LINK_COOKIE)?.value, 'link', isTelegramLinkProof);
  if (!proof || proof.userId !== auth.userId) {
    return NextResponse.json({ error: 'Подтверждение Telegram истекло' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { accessStatus: true, telegramSub: true } });
  if (!user || user.accessStatus !== 'ACTIVE') return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  if (user.telegramSub && user.telegramSub !== proof.profile.sub) {
    return NextResponse.json({ error: 'Другой Telegram-аккаунт уже привязан' }, { status: 409 });
  }
  const existing = await prisma.user.findUnique({ where: { telegramSub: proof.profile.sub }, select: { id: true } });
  if (existing && existing.id !== auth.userId) {
    return NextResponse.json({ error: 'Этот Telegram-аккаунт уже используется' }, { status: 409 });
  }
  try {
    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        telegramSub: proof.profile.sub,
        telegramName: proof.profile.name,
        telegramUsername: proof.profile.username,
        telegramPhotoUrl: proof.profile.photoUrl,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Не удалось привязать Telegram-аккаунт' }, { status: 409 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set({ name: TELEGRAM_LINK_COOKIE, value: '', expires: new Date(0), path: '/api/auth/telegram/link' });
  return response;
}
