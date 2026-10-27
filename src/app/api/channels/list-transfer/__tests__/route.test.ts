import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  subscriptions: vi.fn(),
  channels: vi.fn(),
  createMany: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verify }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  userChannel: { findMany: mocks.subscriptions, createMany: mocks.createMany },
  channel: { findMany: mocks.channels },
} }));
vi.mock('@/lib/cache', () => ({
  metricsCache: { invalidate: mocks.invalidate }, bestTimeCache: { invalidate: mocks.invalidate },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET, POST } from '../route';

const url = 'http://localhost:4000/api/channels/list-transfer';
const previousToken = process.env.COLLECT_API_TOKEN;
const getRequest = () => new NextRequest(url);
const postRequest = (body: string) => new NextRequest(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});

describe('channel list transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COLLECT_API_TOKEN = 'test-only-channel-list-key';
    mocks.verify.mockResolvedValue({ authorized: true, userId: 1, role: 'ADMIN' });
    mocks.subscriptions.mockResolvedValue([{ channelId: 3 }, { channelId: 7 }]);
    mocks.channels.mockResolvedValue([{ id: 3 }, { id: 7 }]);
    mocks.createMany.mockResolvedValue({ count: 2 });
  });
  afterEach(() => {
    if (previousToken === undefined) delete process.env.COLLECT_API_TOKEN;
    else process.env.COLLECT_API_TOKEN = previousToken;
  });

  it('exports the admin list and imports it without a mine flag', async () => {
    const exported = await GET(getRequest());
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-disposition')).toContain('attachment');
    expect(mocks.subscriptions).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: { channelId: true }, orderBy: { channelId: 'asc' },
    });
    const file = await exported.text();
    mocks.verify.mockResolvedValue({ authorized: true, userId: 2, role: 'USER' });
    const imported = await POST(postRequest(file));
    expect(imported.status).toBe(200);
    expect(await imported.json()).toEqual({ added: 2, alreadyPresent: 0 });
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{ userId: 2, channelId: 3, isMine: false }, { userId: 2, channelId: 7, isMine: false }],
      skipDuplicates: true,
    });
  });

  it('keeps existing subscriptions on repeated import', async () => {
    const file = await (await GET(getRequest())).text();
    mocks.verify.mockResolvedValue({ authorized: true, userId: 2, role: 'USER' });
    mocks.createMany.mockResolvedValue({ count: 0 });
    const response = await POST(postRequest(file));
    expect(await response.json()).toEqual({ added: 0, alreadyPresent: 2 });
    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('rejects edited files and missing channels before writing', async () => {
    const validFile = await (await GET(getRequest())).text();
    const file = JSON.parse(validFile);
    mocks.verify.mockResolvedValue({ authorized: true, userId: 2, role: 'USER' });
    file.channelIds = [3, 9];
    expect((await POST(postRequest(JSON.stringify(file)))).status).toBe(400);
    expect(mocks.channels).not.toHaveBeenCalled();
    mocks.channels.mockResolvedValue([{ id: 3 }]);
    expect((await POST(postRequest(validFile))).status).toBe(409);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('restricts export to admin and import to user accounts', async () => {
    mocks.verify.mockResolvedValue({ authorized: true, userId: 2, role: 'USER' });
    expect((await GET(getRequest())).status).toBe(403);
    mocks.verify.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
    expect((await POST(postRequest('{}'))).status).toBe(403);
  });
});
