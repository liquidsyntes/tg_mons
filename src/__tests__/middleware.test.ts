import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { createSessionCookieValue, SESSION_COOKIE_NAME } from '../lib/auth';

describe('middleware access boundary', () => {
  beforeEach(() => vi.stubEnv('COLLECT_API_TOKEN', 'unit-test-access-key'));
  afterEach(() => vi.unstubAllEnvs());

  it('redirects pages and blocks API mutations without credentials', async () => {
    const page = await middleware(new NextRequest('http://localhost:4000/reports'));
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe('http://localhost:4000/login');

    const api = await middleware(new NextRequest('http://localhost:4000/api/channels', { method: 'POST' }));
    expect(api.status).toBe(401);
    expect(api.headers.get('authorization')).toBeNull();
  });

  it('keeps health and login public while accepting a browser session for UI mutations', async () => {
    expect((await middleware(new NextRequest('http://localhost:4000/api/health'))).status).toBe(200);
    expect((await middleware(new NextRequest('http://localhost:4000/api/auth/login', { method: 'POST' }))).status).toBe(200);

    const cookie = await createSessionCookieValue();
    const response = await middleware(new NextRequest('http://localhost:4000/api/settings', {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookie}`, Origin: 'http://localhost:4000' },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('accepts the browser session for every UI mutation route', async () => {
    const cookie = await createSessionCookieValue();
    const routes = [
      ['POST', '/api/channels'],
      ['PATCH', '/api/channels/1'],
      ['DELETE', '/api/channels/1'],
      ['PUT', '/api/channels/1/favorite'],
      ['POST', '/api/collect/run'],
      ['POST', '/api/settings'],
      ['POST', '/api/events/scan'],
      ['PATCH', '/api/events/1/dismiss'],
      ['DELETE', '/api/reports/1'],
      ...['summary', 'super-report', 'compare', 'audience', 'persona', 'trends', 'action-plan', 'compare-reports', 'content-gap']
        .map(name => ['POST', `/api/ai/${name}`]),
    ];
    for (const [method, path] of routes) {
      const response = await middleware(new NextRequest(`http://localhost:4000${path}`, {
        method,
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookie}`, Origin: 'http://localhost:4000' },
      }));
      expect(response.status, `${method} ${path}`).toBe(200);
    }
  });

  it('accepts worker Bearer requests and rejects cross-origin cookie mutations', async () => {
    const worker = await middleware(new NextRequest('http://localhost:4000/api/internal/invalidate-cache', {
      method: 'POST',
      headers: { Authorization: 'Bearer unit-test-access-key' },
    }));
    expect(worker.status).toBe(200);

    const cookie = await createSessionCookieValue();
    const internalWithCookie = await middleware(new NextRequest('http://localhost:4000/api/internal/invalidate-cache', {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookie}`, Origin: 'http://localhost:4000' },
    }));
    expect(internalWithCookie.status).toBe(401);
    const crossOrigin = await middleware(new NextRequest('http://localhost:4000/api/events/scan', {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookie}`, Origin: 'https://other.example' },
    }));
    expect(crossOrigin.status).toBe(403);
  });
});
