import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPosts: vi.fn(),
  findEvents: vi.fn(),
  createEvent: vi.fn(),
  upsertMention: vi.fn(),
  selectCandidates: vi.fn(),
  callOpenRouter: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: mocks.findPosts },
    event: { findMany: mocks.findEvents, create: mocks.createEvent },
    eventMention: { upsert: mocks.upsertMention },
  },
}));
vi.mock('@/lib/events/jev', () => ({ selectEventCandidatesWithJev: mocks.selectCandidates }));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { POST } from '../route';

const posts = [
  { id: 1, text: 'Вечеринка состоится в субботу.', publishedAt: new Date('2026-10-12T12:00:00Z'), channel: { title: 'Первый' } },
  { id: 2, text: 'Вечеринка уже прошла.', publishedAt: new Date('2026-10-12T12:00:00Z'), channel: { title: 'Второй' } },
];

describe('POST /api/events/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPosts.mockResolvedValue(posts);
    mocks.findEvents.mockResolvedValue([]);
    mocks.createEvent.mockResolvedValue({ id: 10, title: 'Вечеринка', date: new Date('2026-10-17T00:00:00Z') });
    mocks.upsertMention.mockResolvedValue({});
    mocks.selectCandidates.mockResolvedValue({ posts: [posts[0]], mode: 'jev' });
    mocks.callOpenRouter.mockResolvedValue(JSON.stringify({
      events: [{ title: 'Вечеринка', date: '2026-10-17', sourcePostIds: [1, 2] }],
    }));
  });

  it('sends only Jev-selected posts to extraction and links only selected sources', async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, savedCount: 1, selectionMode: 'jev' });
    expect(mocks.selectCandidates).toHaveBeenCalledOnce();
    const prompt = mocks.callOpenRouter.mock.calls[0][0] as string;
    expect(prompt).toContain('Вечеринка состоится');
    expect(prompt).not.toContain('Вечеринка уже прошла');
    expect(mocks.upsertMention).toHaveBeenCalledOnce();
    expect(mocks.upsertMention).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId_postId: { eventId: 10, postId: 1 } },
    }));
  });

  it('skips extraction when Jev excludes every candidate', async () => {
    mocks.selectCandidates.mockResolvedValue({ posts: [], mode: 'jev' });

    const response = await POST();

    expect(await response.json()).toEqual({ success: true, savedCount: 0, parsedEvents: [], selectionMode: 'jev' });
    expect(mocks.callOpenRouter).not.toHaveBeenCalled();
  });

  it('lets Jev find announcements without the old keywords', async () => {
    const exhibition = {
      id: 3,
      text: 'Выставка откроется в субботу в музее на площади.',
      publishedAt: new Date('2026-10-12T12:00:00Z'),
      channel: { title: 'Музей' },
    };
    mocks.findPosts.mockResolvedValue([exhibition]);
    mocks.selectCandidates.mockResolvedValue({ posts: [exhibition], mode: 'jev' });
    mocks.callOpenRouter.mockResolvedValue('{"events":[]}');

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.selectCandidates).toHaveBeenCalledWith([exhibition]);
    expect(mocks.callOpenRouter.mock.calls[0][0]).toContain('Выставка откроется');
  });

  it('uses the keyword filter if Jev is unavailable', async () => {
    const extraPost = {
      id: 3,
      text: 'Выставка откроется в субботу в музее на площади.',
      publishedAt: new Date('2026-10-12T12:00:00Z'),
      channel: { title: 'Музей' },
    };
    mocks.findPosts.mockResolvedValue([...posts, extraPost]);
    mocks.selectCandidates.mockResolvedValue({ posts: [...posts, extraPost], mode: 'keyword_fallback' });
    mocks.callOpenRouter.mockResolvedValue('{"events":[]}');

    const response = await POST();

    expect((await response.json()).selectionMode).toBe('keyword_fallback');
    const prompt = mocks.callOpenRouter.mock.calls[0][0] as string;
    expect(prompt).toContain('Вечеринка состоится');
    expect(prompt).not.toContain('Выставка откроется');
  });

  it('reports the absence of keyword candidates without calling providers', async () => {
    mocks.findPosts.mockResolvedValue([]);

    const response = await POST();

    expect(await response.json()).toEqual({ success: true, savedCount: 0, parsedEvents: [], selectionMode: 'no_candidates' });
    expect(mocks.selectCandidates).not.toHaveBeenCalled();
    expect(mocks.callOpenRouter).not.toHaveBeenCalled();
  });
});
