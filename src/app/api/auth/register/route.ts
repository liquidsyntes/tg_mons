import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionCookieValue, hashPassword, hasSameOrigin, isSecureRequest, isValidAccessKey,
  SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { claimOrphanedDataForAdmin, isValidPassword, normalizeUsername } from '@/lib/users';

/** Keeps the one-time master-key bootstrap, without public invite registration. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  }
  if (!process.env.COLLECT_API_TOKEN) {
    return NextResponse.json({ error: 'Ключ доступа не настроен на сервере' }, { status: 500 });
  }

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount > 0) {
    return NextResponse.json({ error: 'Регистрация доступна только через Telegram' }, { status: 410 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const username = normalizeUsername(record.username);
  const password = record.password;
  if (!username || !isValidPassword(password) || !isValidAccessKey(record.inviteCode)) {
    return NextResponse.json({ error: 'Неверные данные первого администратора' }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) return NextResponse.json({ error: 'Логин уже занят' }, { status: 409 });

  try {
    const user = await prisma.user.create({
      data: { username, passwordHash: await hashPassword(password), role: 'ADMIN', accessStatus: 'ACTIVE' },
    });
    await claimOrphanedDataForAdmin(user.id);
    const response = NextResponse.json({ success: true, user: { id: user.id, username: user.username, role: 'ADMIN' } },
      { status: 201, headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: await createSessionCookieValue({ userId: user.id, role: 'ADMIN' }),
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Не удалось создать администратора' }, { status: 500 });
  }
}
