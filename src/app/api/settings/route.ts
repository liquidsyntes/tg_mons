import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { verifyBearerToken } from '@/lib/auth';
import { DEFAULT_AI_MODEL, invalidateAiConfigCache, maskAiToken } from '@/lib/ai-config';

export const dynamic = 'force-dynamic';

type StoredSettings = NonNullable<Awaited<ReturnType<typeof prisma.systemSetting.findUnique>>>;

function publicSettings(settings: StoredSettings) {
  const effectiveToken = settings.aiToken?.trim() || process.env.OPENROUTER_API_KEY?.trim() || null;
  return {
    id: settings.id,
    aiProvider: settings.aiProvider,
    aiModel: settings.aiModel.trim() || DEFAULT_AI_MODEL,
    digestEnabled: settings.digestEnabled,
    digestHour: settings.digestHour,
    lastDigestAt: settings.lastDigestAt,
    updatedAt: settings.updatedAt,
    hasToken: Boolean(effectiveToken),
    tokenPreview: maskAiToken(effectiveToken),
    tokenSource: settings.aiToken?.trim() ? 'saved' : effectiveToken ? 'environment' : null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  try {
    const settings = await prisma.systemSetting.findUnique({ where: { id: 'global' } })
      ?? await prisma.systemSetting.create({ data: { id: 'global', aiModel: DEFAULT_AI_MODEL } });
    return NextResponse.json({ settings: publicSettings(settings) });
  } catch (error) {
    logger.error('GET /api/settings error:', undefined, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearerToken(req);
  if (!auth.authorized) return auth.response;
  if (auth.role === 'USER') {
    return NextResponse.json(
      { error: 'Изменение глобальных настроек ИИ доступно только администратору' },
      { status: 403 },
    );
  }
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Некорректные настройки' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if ((input.aiProvider !== undefined && input.aiProvider !== 'openrouter') ||
        (input.aiModel !== undefined && typeof input.aiModel !== 'string') ||
        (input.aiToken !== undefined && typeof input.aiToken !== 'string') ||
        (input.clearToken !== undefined && typeof input.clearToken !== 'boolean') ||
        (input.clearToken === true && typeof input.aiToken === 'string' && input.aiToken.trim() !== '')) {
      return NextResponse.json({ error: 'Некорректные настройки' }, { status: 400 });
    }

    const aiModel = typeof input.aiModel === 'string' ? input.aiModel.trim() || DEFAULT_AI_MODEL : undefined;
    const suppliedToken = typeof input.aiToken === 'string' ? input.aiToken.trim() : '';
    const newToken = suppliedToken && suppliedToken !== '***' && !/^([a-z0-9-]+)?\.\.\.[^\s]*$/i.test(suppliedToken)
      ? suppliedToken : undefined;
    const tokenUpdate = input.clearToken === true ? { aiToken: null } : newToken ? { aiToken: newToken } : {};
    const settings = await prisma.systemSetting.upsert({
      where: { id: 'global' },
      update: { ...(aiModel !== undefined ? { aiModel } : {}), ...tokenUpdate },
      create: { id: 'global', aiProvider: 'openrouter', aiModel: aiModel ?? DEFAULT_AI_MODEL,
        aiToken: newToken && input.clearToken !== true ? newToken : null },
    });
    invalidateAiConfigCache();
    return NextResponse.json({ success: true, settings: publicSettings(settings) });
  } catch (error) {
    logger.error('POST /api/settings error:', undefined, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
