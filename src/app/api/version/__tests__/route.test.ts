import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppVersion: vi.fn(),
}));

vi.mock('@/lib/app-version', () => ({
  getAppVersion: mocks.getAppVersion,
}));

import { GET } from '../route';

describe('GET /api/version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current app version with no-store Cache-Control header', async () => {
    mocks.getAppVersion.mockReturnValue('f4dc8fe');

    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ version: 'f4dc8fe' });
  });

  it('returns null version when git metadata is unavailable', async () => {
    mocks.getAppVersion.mockReturnValue(null);

    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: null });
  });
});
