import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { verifyBearerToken } from '@/lib/auth';
import { metricsCache, bestTimeCache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_CHANNELS = 5000;

interface ChannelListFile {
  version: 1;
  channelIds: number[];
  signature: string;
}

const encoder = new TextEncoder();

async function signChannelIds(channelIds: number[]): Promise<string> {
  const token = process.env.COLLECT_API_TOKEN;
  if (!token) throw new Error('COLLECT_API_TOKEN is not configured');
  const key = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`tgmon-channel-list:v1:${channelIds.join(',')}`)));
  return Buffer.from(bytes).toString('base64url');
}

async function hasValidSignature(file: ChannelListFile): Promise<boolean> {
  const expected = await signChannelIds(file.channelIds);
  const actualBytes = Buffer.from(file.signature, 'base64url');
  const expectedBytes = Buffer.from(expected, 'base64url');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function parseChannelList(value: unknown): ChannelListFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const file = value as Record<string, unknown>;
  if (file.version !== 1 || !Array.isArray(file.channelIds) || file.channelIds.length > MAX_CHANNELS || typeof file.signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(file.signature)) return null;
  if (!file.channelIds.every((id: unknown) => Number.isSafeInteger(id) && (id as number) > 0 && (id as number) <= 2147483647)) return null;
  if (new Set(file.channelIds).size !== file.channelIds.length) return null;
  return { version: 1, channelIds: file.channelIds as number[], signature: file.signature };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });

  try {
    const channelIds = auth.userId === null
      ? (await prisma.channel.findMany({
        select: { id: true }, orderBy: { id: 'asc' },
      })).map(channel => channel.id)
      : (await prisma.userChannel.findMany({
        where: { userId: auth.userId },
        select: { channelId: true }, orderBy: { channelId: 'asc' },
      })).map(subscription => subscription.channelId);

    if (channelIds.length > MAX_CHANNELS) {
      return NextResponse.json({ error: 'Список превышает лимит 5000 каналов' }, { status: 413 });
    }

    const signature = await signChannelIds(channelIds);
    return new NextResponse(JSON.stringify({ version: 1, channelIds, signature } satisfies ChannelListFile, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tgmon-channel-list.json"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    logger.error('GET /api/channels/list-transfer error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось выгрузить список каналов' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const userId = auth.userId;
  if (userId === null) return NextResponse.json({ error: 'Импорт требует входа под учётной записью' }, { status: 403 });

  const declaredSize = Number(request.headers.get('content-length'));
  if (declaredSize > MAX_FILE_BYTES) return NextResponse.json({ error: 'Файл слишком большой' }, { status: 413 });

  let file: ChannelListFile | null;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Файл слишком большой' }, { status: 413 });
    }
    file = parseChannelList(JSON.parse(body));
  } catch {
    file = null;
  }
  if (!file) return NextResponse.json({ error: 'Некорректный файл списка каналов' }, { status: 400 });

  try {
    if (!await hasValidSignature(file)) {
      return NextResponse.json({ error: 'Подпись списка недействительна' }, { status: 400 });
    }
    const channels = await prisma.channel.findMany({
      where: { id: { in: file.channelIds } }, select: { id: true },
    });
    if (channels.length !== file.channelIds.length) {
      return NextResponse.json({ error: 'Часть каналов отсутствует в этом сервисе' }, { status: 409 });
    }

    const result = await prisma.userChannel.createMany({
      data: file.channelIds.map(channelId => ({ userId, channelId, isMine: false })),
      skipDuplicates: true,
    });
    metricsCache.invalidate();
    bestTimeCache.invalidate();
    return NextResponse.json({ added: result.count, alreadyPresent: file.channelIds.length - result.count });
  } catch (error) {
    logger.error('POST /api/channels/list-transfer error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось импортировать список каналов' }, { status: 500 });
  }
}
