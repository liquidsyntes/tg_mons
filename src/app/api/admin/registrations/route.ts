import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });
  if (auth.userId !== null) {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId }, select: { role: true, accessStatus: true },
    });
    if (!user || user.role !== 'ADMIN' || user.accessStatus !== 'ACTIVE') {
      return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });
    }
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denial = await requireAdmin(request);
  if (denial) return denial;
  try {
    const users = await prisma.user.findMany({
      where: { telegramSub: { not: null }, role: 'USER' },
      select: { id: true, telegramSub: true, telegramName: true, telegramUsername: true,
        telegramPhotoUrl: true, accessStatus: true, createdAt: true, reviewedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ users }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('GET /api/admin/registrations error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось загрузить заявки' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denial = await requireAdmin(request);
  if (denial) return denial;
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const { id, action } = body as Record<string, unknown>;
  if (!Number.isSafeInteger(id) || Number(id) <= 0 || !['approve', 'block', 'unblock'].includes(String(action))) {
    return NextResponse.json({ error: 'Некорректное действие' }, { status: 400 });
  }
  const expected = action === 'approve' ? 'PENDING' : action === 'unblock' ? 'BLOCKED' : null;
  const status = action === 'approve' ? 'ACTIVE' : action === 'block' ? 'BLOCKED' : 'PENDING';
  try {
    const result = await prisma.user.updateMany({
      where: { id: Number(id), telegramSub: { not: null }, role: 'USER',
        ...(expected ? { accessStatus: expected } : { accessStatus: { in: ['PENDING', 'ACTIVE'] } }) },
      data: { accessStatus: status, reviewedAt: action === 'unblock' ? null : new Date() },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Заявка не найдена или её статус изменился' }, { status: 409 });
    return NextResponse.json({ success: true, accessStatus: status });
  } catch (error) {
    logger.error('PATCH /api/admin/registrations error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось изменить статус' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denial = await requireAdmin(request);
  if (denial) return denial;
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const id = body && typeof body === 'object' && 'id' in body ? body.id : null;
  if (!Number.isSafeInteger(id) || Number(id) <= 0) {
    return NextResponse.json({ error: 'Некорректный ID заявки' }, { status: 400 });
  }
  try {
    const result = await prisma.user.deleteMany({
      where: { id: Number(id), accessStatus: 'PENDING', telegramSub: { not: null }, role: 'USER' },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Ожидающая заявка не найдена' }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/admin/registrations error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось удалить заявку' }, { status: 500 });
  }
}
