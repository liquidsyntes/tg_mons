import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), report: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth', () => ({ extractRequestSession: mocks.session }));
vi.mock('@/lib/prisma', () => ({ prisma: { aiReport: { findUnique: mocks.report } } }));
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.log } }));
vi.mock('@/lib/ai-reports', () => ({ AI_REPORT_TITLES: { summary: 'Контент-анализ', persona: 'Психологический портрет' } }));

import { GET } from '../route';

const context = (id = '1') => ({ params: Promise.resolve({ id }) });
const request = () => new Request('http://localhost:4000/api/reports/1/export');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ userId: 7, role: 'USER' });
  mocks.report.mockResolvedValue({
    id: 1, type: 'summary', userId: 7,
    channel: { title: '<img src=x onerror=alert(1)>' },
    content: JSON.stringify({ stats: [{ value: '<b>10</b>', label: 'Просмотры' }] }),
    createdAt: new Date('2026-10-18T12:00:00.000Z'),
  });
});

describe('GET /api/reports/:id/export', () => {
  it('returns a downloadable document with escaped report data', async () => {
    const response = await GET(request(), context());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Content-Disposition')).toContain('report_1_summary.html');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;10&lt;/b&gt;');
    expect(html).not.toContain('<img');
  });

  it('rejects another users report and an admin-only persona before rendering', async () => {
    mocks.report.mockResolvedValueOnce({ type: 'summary', userId: 8 });
    expect((await GET(request(), context())).status).toBe(404);
    mocks.report.mockResolvedValueOnce({ type: 'persona', userId: 7 });
    expect((await GET(request(), context())).status).toBe(404);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it('returns the existing format error for invalid JSON', async () => {
    mocks.report.mockResolvedValue({
      id: 1, type: 'summary', userId: 7, channel: null, content: '{', createdAt: new Date(),
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Disposition')).toContain('error.html');
    expect(await response.text()).toContain('Ошибка формата');
  });

  it('returns a render error for invalid report structure', async () => {
    mocks.report.mockResolvedValue({
      id: 1, type: 'summary', userId: 7, channel: null,
      content: JSON.stringify({ stats: 'не список' }), createdAt: new Date(),
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Ошибка генерации отчета');
    expect(mocks.log).toHaveBeenCalledOnce();
  });

  it('keeps a stored report type out of filename control characters', async () => {
    mocks.report.mockResolvedValue({
      id: 1, type: 'custom"\r\nname', userId: 7, channel: null,
      content: '{}', createdAt: new Date(),
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('report_1_custom___name.html');
    expect(response.headers.get('Content-Disposition')).not.toMatch(/[\r\n]/);
  });

  it('returns 400 for a malformed id', async () => {
    expect((await GET(request(), context('missing'))).status).toBe(400);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
