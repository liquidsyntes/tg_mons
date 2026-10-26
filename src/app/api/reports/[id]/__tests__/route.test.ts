import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  verifyBearerToken: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { aiReport: { deleteMany: mocks.deleteMany } } }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verifyBearerToken }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { DELETE } from '../route';

const request = new NextRequest('http://localhost:4000/api/reports/42', { method: 'DELETE' });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('DELETE /api/reports/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyBearerToken.mockReturnValue({ authorized: true });
  });

  it('physically deletes one report', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    const response = await DELETE(request, context('42'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: 42 } });
  });

  it('rejects unauthorized and malformed requests before touching the database', async () => {
    mocks.verifyBearerToken.mockReturnValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    expect((await DELETE(request, context('42'))).status).toBe(401);
    mocks.verifyBearerToken.mockReturnValue({ authorized: true });
    expect((await DELETE(request, context('42abc'))).status).toBe(400);
    expect((await DELETE(request, context('0'))).status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 404 for an already missing report', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(request, context('42'))).status).toBe(404);
  });

  it('prevents non-admin users from deleting persona reports', async () => {
    mocks.verifyBearerToken.mockReturnValue({ authorized: true, userId: 9, role: 'USER' });
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    const response = await DELETE(request, context('42'));
    expect(response.status).toBe(404);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: 42, userId: 9, type: { not: 'persona' } },
    });
  });

  it('returns a safe error when deletion fails', async () => {
    mocks.deleteMany.mockRejectedValue(new Error('database failure'));
    const response = await DELETE(request, context('42'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Не удалось удалить отчет' });
  });
});
