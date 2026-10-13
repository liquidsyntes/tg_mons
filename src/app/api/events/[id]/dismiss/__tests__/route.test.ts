import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  findEvent: vi.fn(),
  updateEvent: vi.fn(),
  verifyBearerToken: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { event: { findUnique: mocks.findEvent, update: mocks.updateEvent } },
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verifyBearerToken }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { PATCH } from '../route';

function dismiss(id: string) {
  const request = new NextRequest(`http://localhost:4000/api/events/${id}/dismiss`, { method: 'PATCH' });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

describe('PATCH /api/events/[id]/dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyBearerToken.mockReturnValue({ authorized: true });
    mocks.findEvent.mockResolvedValue({ dismissedAt: null });
    mocks.updateEvent.mockResolvedValue({});
  });

  it('sets a dismissal timestamp without deleting the event or its mentions', async () => {
    const response = await dismiss('42');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.updateEvent).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { dismissedAt: expect.any(Date) },
    });
  });

  it('is idempotent for an already dismissed event', async () => {
    mocks.findEvent.mockResolvedValue({ dismissedAt: new Date('2026-10-13T00:00:00Z') });

    expect((await dismiss('42')).status).toBe(200);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid event ID', async () => {
    const response = await dismiss('42abc');

    expect(response.status).toBe(400);
    expect(mocks.findEvent).not.toHaveBeenCalled();
    expect((await dismiss('1e2')).status).toBe(400);
  });

  it('returns 404 for a missing event', async () => {
    mocks.findEvent.mockResolvedValue(null);

    expect((await dismiss('42')).status).toBe(404);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it('respects the mutation authorization check', async () => {
    mocks.verifyBearerToken.mockReturnValue({
      authorized: false,
      response: NextResponse.json({ error: 'Нет доступа' }, { status: 403 }),
    });

    expect((await dismiss('42')).status).toBe(403);
    expect(mocks.findEvent).not.toHaveBeenCalled();
  });
});
