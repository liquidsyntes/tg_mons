import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionCookieValue,
  hashPassword,
  hasSameOrigin,
  isSecureRequest,
  isValidAccessKey,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type UserRole,
} from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { claimOrphanedDataForAdmin, isValidPassword, normalizeUsername } from '@/lib/users';

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

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const username = normalizeUsername(record.username);
  const password = record.password;
  const rawInviteCode = typeof record.inviteCode === 'string' ? record.inviteCode.trim() : '';

  if (!username) {
    return NextResponse.json(
      { error: 'Логин должен содержать от 3 до 32 символов (латиница, цифры, точка, дефис, подчеркивание)' },
      { status: 400 },
    );
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: 'Пароль должен содержать минимум 6 символов' }, { status: 400 });
  }
  if (!rawInviteCode) {
    return NextResponse.json({ error: 'Инвайт-код обязателен для регистрации' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: 'Пользователь с таким логином уже существует' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });

  let createdUser: { id: number; username: string; role: UserRole };

  if (adminCount === 0 && isValidAccessKey(rawInviteCode)) {
    const admin = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: 'ADMIN',
      },
    });
    await claimOrphanedDataForAdmin(admin.id);
    createdUser = { id: admin.id, username: admin.username, role: 'ADMIN' };
  } else {
    const normalizedCode = rawInviteCode.toUpperCase();
    const invite = await prisma.inviteCode.findUnique({
      where: { code: normalizedCode },
    });

    if (!invite || invite.usedById !== null || (invite.expiresAt && invite.expiresAt <= new Date())) {
      return NextResponse.json({ error: 'Недействительный или уже использованный инвайт-код' }, { status: 400 });
    }

    try {
      const user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            username,
            passwordHash,
            role: 'USER',
          },
        });
        const claimed = await tx.inviteCode.updateMany({
          where: { id: invite.id, usedById: null },
          data: { usedById: u.id, usedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new Error('INVITE_ALREADY_USED');
        }
        return u;
      });
      createdUser = { id: user.id, username: user.username, role: 'USER' };
    } catch (error) {
      if (error instanceof Error && error.message === 'INVITE_ALREADY_USED') {
        return NextResponse.json({ error: 'Этот инвайт-код уже был использован' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Не удалось завершить регистрацию' }, { status: 500 });
    }
  }

  const response = NextResponse.json(
    { success: true, user: createdUser },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await createSessionCookieValue({ userId: createdUser.id, role: createdUser.role }),
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
