import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  findPosts: vi.fn(),
  findEvents: vi.fn(),
  createEvent: vi.fn(),
  upsertMention: vi.fn(),
  selectCandidates: vi.fn(),
  callOpenRouter: vi.fn(),
  verifyAuth: vi.fn(),
  markPosts: vi.fn(),
  mergeEvents: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: mocks.findPosts, updateMany: mocks.markPosts },
    event: { findMany: mocks.findEvents, create: mocks.createEvent },
    eventMention: { upsert: mocks.upsertMention },
  },
}));
vi.mock('@/lib/events/jev', () => ({ selectEventCandidatesWithJev: mocks.selectCandidates }));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verifyAuth }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/events/matching', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/events/matching')>()),
  mergeDuplicateEventsInDb: mocks.mergeEvents,
}));

import { POST } from '../route';

const request = new NextRequest('http://localhost:4000/api/events/scan', { method: 'POST' });

const posts = [
  { id: 1, text: 'Вечеринка состоится в субботу.', publishedAt: new Date('2026-10-12T12:00:00Z'), channel: { title: 'Первый' } },
  { id: 2, text: 'Вечеринка уже прошла.', publishedAt: new Date('2026-10-12T12:00:00Z'), channel: { title: 'Второй' } },
];

describe('POST /api/events/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuth.mockResolvedValue({ authorized: true });
    mocks.findPosts.mockResolvedValue(posts);
    mocks.findEvents.mockResolvedValue([]);
    mocks.createEvent.mockResolvedValue({ id: 10, title: 'Вечеринка', date: new Date('2026-10-17T00:00:00Z') });
    mocks.upsertMention.mockResolvedValue({});
    mocks.markPosts.mockResolvedValue({ count: 1 });
    mocks.mergeEvents.mockResolvedValue(0);
    mocks.selectCandidates.mockResolvedValue({ posts: [posts[0]], mode: 'jev' });
    mocks.callOpenRouter.mockResolvedValue(JSON.stringify({
      events: [{ title: 'Вечеринка', date: '2026-10-17', sourcePostIds: [1, 2] }],
    }));
  });

  it('rejects an unauthorized scan before reading posts or calling providers', async () => {
    mocks.verifyAuth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });

    expect((await POST(request)).status).toBe(401);
    expect(mocks.findPosts).not.toHaveBeenCalled();
    expect(mocks.selectCandidates).not.toHaveBeenCalled();
    expect(mocks.callOpenRouter).not.toHaveBeenCalled();
  });

  it('sends only Jev-selected posts to extraction and links only selected sources', async () => {
    const response = await POST(request);
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
    expect(mocks.findPosts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ eventsScannedAt: null }) }));
    expect(mocks.markPosts).toHaveBeenCalledWith({
      where: { id: { in: [2] }, eventsScannedAt: null }, data: { eventsScannedAt: expect.any(Date) },
    });
    expect(mocks.markPosts).toHaveBeenCalledWith({
      where: { id: { in: [1] }, eventsScannedAt: null }, data: { eventsScannedAt: expect.any(Date) },
    });
    expect(mocks.mergeEvents).toHaveBeenCalledOnce();
  });

  it('links a new announcement to a dismissed event without recreating it', async () => {
    mocks.findEvents.mockResolvedValue([{
      id: 10,
      title: 'Вечеринка',
      date: new Date('2026-10-17T00:00:00Z'),
      dismissedAt: new Date('2026-10-13T00:00:00Z'),
    }]);

    const response = await POST(request);

    expect(await response.json()).toMatchObject({ success: true, savedCount: 0 });
    expect(mocks.createEvent).not.toHaveBeenCalled();
    expect(mocks.upsertMention).toHaveBeenCalledOnce();
  });

  it('links a renamed announcement to an existing event with shared time and organizer', async () => {
    mocks.findEvents.mockResolvedValue([{
      id: 10,
      title: 'Майстер-клас origami від Studio до весни',
      date: new Date('2026-10-17T00:00:00Z'),
      timeStr: '17:00 - 20:00',
      organizer: 'Studio',
    }]);
    mocks.callOpenRouter.mockResolvedValue(JSON.stringify({
      events: [{ title: 'Останній origami до весни від Studio', date: '2026-10-17', timeStr: '17:00 - 20:00', organizer: 'Studio / Venue', sourcePostIds: [1] }],
    }));

    const body = await (await POST(request)).json();

    expect(body.savedCount).toBe(0);
    expect(mocks.createEvent).not.toHaveBeenCalled();
    expect(mocks.upsertMention).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId_postId: { eventId: 10, postId: 1 } },
    }));
  });

  it('does not create an event without a selected source post', async () => {
    mocks.callOpenRouter.mockResolvedValue(JSON.stringify({
      events: [{ title: 'Событие без источника', date: '2026-10-17', sourcePostIds: [999] }],
    }));

    const response = await POST(request);

    expect(await response.json()).toMatchObject({ success: true, savedCount: 0 });
    expect(mocks.createEvent).not.toHaveBeenCalled();
    expect(mocks.upsertMention).not.toHaveBeenCalled();
  });

  it('skips extraction when Jev excludes every candidate', async () => {
    mocks.selectCandidates.mockResolvedValue({ posts: [], mode: 'jev' });

    const response = await POST(request);

    expect(await response.json()).toEqual({ success: true, savedCount: 0, parsedEvents: [], selectionMode: 'jev' });
    expect(mocks.callOpenRouter).not.toHaveBeenCalled();
    expect(mocks.markPosts).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, eventsScannedAt: null }, data: { eventsScannedAt: expect.any(Date) },
    });
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

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.selectCandidates).toHaveBeenCalledWith([exhibition]);
    expect(mocks.callOpenRouter.mock.calls[0][0]).toContain('Выставка откроется');
  });

  it('does not send an explicit digest to Jev or the generative model', async () => {
    const digest = {
      id: 3,
      text: '#дайджест\nКонцерт 12.10\nЛекция 15.10',
      publishedAt: new Date('2026-10-12T12:00:00Z'),
      channel: { title: 'Афиша' },
    };
    mocks.findPosts.mockResolvedValue([...posts, digest]);
    mocks.callOpenRouter.mockResolvedValue('{"events":[]}');

    await POST(request);

    expect(mocks.selectCandidates).toHaveBeenCalledWith(posts);
    expect(mocks.callOpenRouter.mock.calls[0][0]).not.toContain('#дайджест');
    expect(mocks.markPosts).toHaveBeenCalledWith({
      where: { id: { in: [3] }, eventsScannedAt: null }, data: { eventsScannedAt: expect.any(Date) },
    });
  });

  it('still excludes an explicit digest when Jev is unavailable', async () => {
    const digest = {
      id: 3,
      text: '#дайджест\nКонцерт 12.10\nЛекция 15.10',
      publishedAt: new Date('2026-10-12T12:00:00Z'),
      channel: { title: 'Афиша' },
    };
    mocks.findPosts.mockResolvedValue([...posts, digest]);
    mocks.selectCandidates.mockResolvedValue({ posts, mode: 'keyword_fallback' });
    mocks.callOpenRouter.mockResolvedValue('{"events":[]}');

    await POST(request);

    expect(mocks.selectCandidates).toHaveBeenCalledWith(posts);
    expect(mocks.callOpenRouter.mock.calls[0][0]).not.toContain('#дайджест');
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

    const response = await POST(request);

    expect((await response.json()).selectionMode).toBe('keyword_fallback');
    const prompt = mocks.callOpenRouter.mock.calls[0][0] as string;
    expect(prompt).toContain('Вечеринка состоится');
    expect(prompt).not.toContain('Выставка откроется');
    expect(mocks.markPosts).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [3] } }) }));
  });

  it('reports the absence of keyword candidates without calling providers', async () => {
    mocks.findPosts.mockResolvedValue([]);

    const response = await POST(request);

    expect(await response.json()).toEqual({ success: true, savedCount: 0, parsedEvents: [], selectionMode: 'no_candidates' });
    expect(mocks.selectCandidates).not.toHaveBeenCalled();
    expect(mocks.callOpenRouter).not.toHaveBeenCalled();
  });

  it('keeps selected posts available for retry when extraction fails', async () => {
    mocks.callOpenRouter.mockRejectedValue(new Error('Provider unavailable'));
    expect((await POST(request)).status).toBe(500);
    expect(mocks.markPosts).toHaveBeenCalledWith({
      where: { id: { in: [2] }, eventsScannedAt: null }, data: { eventsScannedAt: expect.any(Date) },
    });
    expect(mocks.markPosts).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [1] } }) }));
  });

  it('keeps selected posts available when extraction returns an invalid response', async () => {
    mocks.callOpenRouter.mockResolvedValue('{"message":"unexpected response"}');

    expect((await POST(request)).status).toBe(500);
    expect(mocks.markPosts).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [1] } }) }));
  });
});
