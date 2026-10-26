import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyBearerToken } from '@/lib/auth';
import { normalizeTelegramChatId } from '@/lib/digest';

export const dynamic = 'force-dynamic';

async function readObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;

  const botConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  if (!auth.userId) {
    return NextResponse.json({ digest: null, available: false, botConfigured });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        telegramChatId: true,
        digestEnabled: true,
        digestHour: true,
        lastDigestAt: true,
      },
    });
    if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    return NextResponse.json({ digest: user, available: true, botConfigured });
  } catch (error) {
    logger.error('GET /api/settings/digest error:', undefined, error);
    return NextResponse.json({ error: 'Ошибка загрузки настроек дайджеста' }, { status: 500 });
  }
}

async function handleSave(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  if (!auth.userId) {
    return NextResponse.json(
      { error: 'Персональный дайджест доступен только для пользовательского аккаунта' },
      { status: 403 },
    );
  }

  const body = await readObject(req);
  if (!body) return NextResponse.json({ error: 'Некорректные параметры дайджеста' }, { status: 400 });

  if (body.digestEnabled !== undefined && typeof body.digestEnabled !== 'boolean') {
    return NextResponse.json({ error: 'Некорректные параметры дайджеста' }, { status: 400 });
  }
  if (body.digestHour !== undefined &&
      (typeof body.digestHour !== 'number' || !Number.isInteger(body.digestHour) ||
        body.digestHour < 0 || body.digestHour > 23)) {
    return NextResponse.json(
      { error: 'Час отправки дайджеста должен быть целым числом от 0 до 23 (UTC)' },
      { status: 400 },
    );
  }

  let parsedChatId: string | null | undefined;
  if (body.telegramChatId !== undefined) {
    if (body.telegramChatId === null || (typeof body.telegramChatId === 'string' && body.telegramChatId.trim() === '')) {
      parsedChatId = null;
    } else {
      const normalized = normalizeTelegramChatId(body.telegramChatId);
      if (!normalized) {
        return NextResponse.json(
          { error: 'Некорректный Telegram Chat ID (укажите числовой ID чата или @username)' },
          { status: 400 },
        );
      }
      parsedChatId = normalized;
    }
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, telegramChatId: true, digestEnabled: true, digestHour: true },
    });
    if (!current) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });

    const nextChatId = parsedChatId === undefined ? current.telegramChatId : parsedChatId;
    const nextEnabled = typeof body.digestEnabled === 'boolean'
      ? body.digestEnabled
      : nextChatId === null
        ? false
        : current.digestEnabled;

    if (nextEnabled && !nextChatId) {
      return NextResponse.json(
        { error: 'Укажите Telegram Chat ID для включения персонального дайджеста' },
        { status: 400 },
      );
    }

    const digest = await prisma.user.update({
      where: { id: auth.userId },
      data: {
        telegramChatId: nextChatId,
        digestEnabled: nextEnabled,
        ...(typeof body.digestHour === 'number' ? { digestHour: body.digestHour } : {}),
      },
      select: {
        id: true,
        telegramChatId: true,
        digestEnabled: true,
        digestHour: true,
        lastDigestAt: true,
      },
    });
    return NextResponse.json({ success: true, digest });
  } catch (error) {
    logger.error('PATCH /api/settings/digest error:', undefined, error);
    return NextResponse.json({ error: 'Ошибка сохранения настроек дайджеста' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return handleSave(req);
}

export async function POST(req: NextRequest) {
  return handleSave(req);
}
