import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), users: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: {
  findUnique: mocks.admin, findMany: mocks.users, updateMany: mocks.update, deleteMany: mocks.remove,
} } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { GET, PATCH, DELETE } from '../route';

const url = 'http://localhost:4000/api/admin/registrations';
function request(method: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(url, { method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
}

describe('Telegram registration review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 1, role: 'ADMIN' });
    mocks.admin.mockResolvedValue({ role: 'ADMIN', accessStatus: 'ACTIVE' });
    mocks.users.mockResolvedValue([]);
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.remove.mockResolvedValue({ count: 1 });
  });

  it('rejects a regular user and a blocked admin', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, userId: 2, role: 'USER' });
    expect((await GET(request('GET'))).status).toBe(403);
    mocks.auth.mockResolvedValue({ authorized: true, userId: 1, role: 'ADMIN' });
    mocks.admin.mockResolvedValue({ role: 'ADMIN', accessStatus: 'BLOCKED' });
    expect((await PATCH(request('PATCH', { id: 3, action: 'approve' }))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('lists only Telegram applicants with the USER role', async () => {
    expect((await GET(request('GET'))).status).toBe(200);
    expect(mocks.users).toHaveBeenCalledWith(expect.objectContaining({
      where: { telegramSub: { not: null }, role: 'USER' },
    }));
  });

  it('approves only pending accounts and blocks Telegram accounts', async () => {
    expect((await PATCH(request('PATCH', { id: 3, action: 'approve' }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 3, telegramSub: { not: null }, role: 'USER', accessStatus: 'PENDING' },
      data: { accessStatus: 'ACTIVE', reviewedAt: expect.any(Date) },
    });
    mocks.update.mockResolvedValue({ count: 0 });
    expect((await PATCH(request('PATCH', { id: 3, action: 'approve' }))).status).toBe(409);
  });

  it('deletes only pending applications so the account may apply again', async () => {
    expect((await DELETE(request('DELETE', { id: 3 }))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith({
      where: { id: 3, accessStatus: 'PENDING', telegramSub: { not: null }, role: 'USER' },
    });
    expect((await DELETE(request('DELETE', { id: -1 }))).status).toBe(400);
  });
});
