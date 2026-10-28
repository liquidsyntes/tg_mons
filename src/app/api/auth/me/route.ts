import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  if (auth.userId !== null && typeof prisma.user?.findUnique === 'function') {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, username: true, role: true, accessStatus: true, telegramName: true,
        telegramUsername: true, telegramSub: true, createdAt: true },
    });
    if (user) {
      return NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
          accessStatus: user.accessStatus,
          telegramName: user.telegramName,
          telegramUsername: user.telegramUsername,
          telegramLinked: Boolean(user.telegramSub),
          createdAt: user.createdAt,
        },
      });
    }
  }

  return NextResponse.json({
    user: {
      id: auth.userId,
      username: auth.role === 'ADMIN' ? 'admin' : 'user',
      role: auth.role,
      accessStatus: 'ACTIVE',
      telegramLinked: false,
    },
  });
}
