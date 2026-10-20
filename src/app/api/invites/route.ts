import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { claimOrphanedDataForAdmin, generateInviteCodeString } from '@/lib/users';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

async function resolveAdminUserId(sessionUserId: number | null): Promise<number> {
  if (sessionUserId !== null) {
    const existing = await prisma.user.findUnique({ where: { id: sessionUserId }, select: { id: true } });
    if (existing) return existing.id;
  }

  const firstAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (firstAdmin) {
    await claimOrphanedDataForAdmin(firstAdmin.id);
    return firstAdmin.id;
  }

  const fallbackHash = await hashPassword(process.env.COLLECT_API_TOKEN || crypto.randomUUID());
  const createdAdmin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: fallbackHash,
      role: 'ADMIN',
    },
  });
  await claimOrphanedDataForAdmin(createdAdmin.id);
  return createdAdmin.id;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });
  }

  try {
    const [invites, users] = await Promise.all([
      prisma.inviteCode.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          usedBy: { select: { id: true, username: true } },
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
          _count: { select: { userChannels: true } },
        },
      }),
    ]);

    return NextResponse.json({ invites, users });
  } catch (error) {
    logger.error('GET /api/invites error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось загрузить инвайты' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });
  }

  try {
    const adminId = await resolveAdminUserId(auth.userId);
    let code = generateInviteCodeString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await prisma.inviteCode.findUnique({ where: { code }, select: { id: true } });
      if (!collision) break;
      code = generateInviteCodeString();
    }

    const invite = await prisma.inviteCode.create({
      data: {
        code,
        createdById: adminId,
      },
      include: {
        usedBy: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    logger.error('POST /api/invites error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось создать инвайт-код' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body?.id === 'number' ? body.id : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Некорректный ID инвайта' }, { status: 400 });
    }

    await prisma.inviteCode.deleteMany({
      where: { id, usedById: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/invites error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось удалить инвайт-код' }, { status: 500 });
  }
}
