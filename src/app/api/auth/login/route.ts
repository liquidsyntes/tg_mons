import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionCookieValue,
  hasSameOrigin,
  isSecureRequest,
  isValidAccessKey,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
  type UserRole,
} from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { claimOrphanedDataForAdmin, normalizeUsername } from '@/lib/users';

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

  // Mode 1: Username + Password login
  if (typeof record.username === 'string' || typeof record.password === 'string') {
    const username = normalizeUsername(record.username);
    const password = typeof record.password === 'string' ? record.password : '';
    if (!username || !password) {
      return NextResponse.json({ error: 'Введите корректный логин и пароль' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }
    if (user.accessStatus !== 'ACTIVE') {
      return NextResponse.json({ error: 'Доступ к аккаунту закрыт' }, { status: 403 });
    }

    const role: UserRole = user.role === 'ADMIN' ? 'ADMIN' : 'USER';
    if (role === 'ADMIN') {
      await claimOrphanedDataForAdmin(user.id);
    }

    const response = NextResponse.json(
      { success: true, user: { id: user.id, username: user.username, role } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
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
  }

  // Mode 2: Master accessKey login (admin / fallback)
  const accessKey = 'accessKey' in record ? record.accessKey : undefined;
  if (!isValidAccessKey(accessKey)) {
    return NextResponse.json({ error: 'Неверный ключ доступа' }, { status: 401 });
  }

  let adminUserId: number | null = null;
  try {
    if (typeof prisma.user?.findFirst === 'function') {
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN', accessStatus: 'ACTIVE' },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      if (adminUser) {
        adminUserId = adminUser.id;
        await claimOrphanedDataForAdmin(adminUser.id);
      }
    }
  } catch {
    adminUserId = null;
  }

  const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: adminUserId ? await createSessionCookieValue({ userId: adminUserId, role: 'ADMIN' }) : await createSessionCookieValue(),
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
