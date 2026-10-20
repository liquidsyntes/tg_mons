import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  countUser: vi.fn(),
  createUser: vi.fn(),
  findInvite: vi.fn(),
  updateInviteMany: vi.fn(),
  transaction: vi.fn(),
  claimOrphaned: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
      count: mocks.countUser,
      create: mocks.createUser,
    },
    inviteCode: {
      findUnique: mocks.findInvite,
      updateMany: mocks.updateInviteMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/users')>();
  return {
    ...actual,
    claimOrphanedDataForAdmin: mocks.claimOrphaned,
  };
});

import { POST } from '../route';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

const baseUrl = 'http://localhost:4000/api/auth/register';

function registerRequest(body: Record<string, unknown>, origin = 'http://localhost:4000'): NextRequest {
  return new NextRequest(baseUrl, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('COLLECT_API_TOKEN', 'server-master-key');
    mocks.findUser.mockResolvedValue(null);
    mocks.countUser.mockResolvedValue(1);
    mocks.claimOrphaned.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bootstraps the first ADMIN user when admin count is 0 and master key is provided', async () => {
    mocks.countUser.mockResolvedValue(0);
    mocks.createUser.mockResolvedValue({ id: 1, username: 'owner', role: 'ADMIN' });

    const response = await POST(
      registerRequest({
        username: 'Owner',
        password: 'strongpassword',
        inviteCode: 'server-master-key',
      }),
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({
      success: true,
      user: { id: 1, username: 'owner', role: 'ADMIN' },
    });
    expect(mocks.claimOrphaned).toHaveBeenCalledWith(1);
    expect(response.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}=v2.1.ADMIN.`);
  });

  it('registers a USER account with a valid unused invite code', async () => {
    mocks.findInvite.mockResolvedValue({
      id: 5,
      code: 'TGMON-ABCD-2345',
      usedById: null,
      expiresAt: null,
    });
    mocks.transaction.mockImplementation(async (fn) =>
      fn({
        user: { create: vi.fn().mockResolvedValue({ id: 2, username: 'member1', role: 'USER' }) },
        inviteCode: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }),
    );

    const response = await POST(
      registerRequest({
        username: 'member1',
        password: 'password123',
        inviteCode: 'tgmon-abcd-2345',
      }),
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({
      success: true,
      user: { id: 2, username: 'member1', role: 'USER' },
    });
    expect(response.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}=v2.2.USER.`);
  });

  it('rejects invalid or already used invite codes', async () => {
    mocks.findInvite.mockResolvedValue({
      id: 5,
      code: 'TGMON-USED-CODE',
      usedById: 99,
      expiresAt: null,
    });

    const response = await POST(
      registerRequest({
        username: 'member2',
        password: 'password123',
        inviteCode: 'TGMON-USED-CODE',
      }),
    );

    expect(response.status).toBe(400);
  });
});
