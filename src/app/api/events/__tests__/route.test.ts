import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findEvents: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: { event: { findMany: mocks.findEvents } } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

const digestMention = {
  id: 1,
  post: {
    messageId: 101n,
    text: '#дайджест\nКонцерт 12.10\nЛекция 15.10',
    channel: { title: 'Подборка', username: 'roundup_channel', tgId: 123n },
  },
};
const announcementMention = {
  id: 2,
  post: {
    messageId: 102n,
    text: 'Концерт 12.10 в 19:00. Приходите!',
    channel: { title: 'Организатор', username: 'event_channel', tgId: 456n },
  },
};

describe('GET /api/events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides digest-only cards and digest badges without deleting other announcements', async () => {
    mocks.findEvents.mockResolvedValue([
      { id: 1, title: 'Лекция из подборки', date: new Date('2026-10-12T00:00:00Z'), mentions: [digestMention] },
      { id: 2, title: 'Концерт', date: new Date('2026-10-12T00:00:00Z'), mentions: [digestMention, announcementMention] },
      { id: 3, title: 'Событие без связей', date: new Date('2026-10-13T00:00:00Z'), mentions: [] },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findEvents).toHaveBeenCalledWith(expect.objectContaining({ where: { dismissedAt: null } }));
    expect(body.events.map((event: { id: number }) => event.id)).toEqual([2, 3]);
    expect(body.events[0].mentions).toHaveLength(1);
    expect(body.events[0].mentions[0].id).toBe(2);
    expect(body.events[0].mentions[0].post.messageId).toBe('102');
  });

  it('shows matching cards as one card with both source posts', async () => {
    const date = new Date('2026-10-17T00:00:00Z');
    mocks.findEvents.mockResolvedValue([
      { id: 1, title: 'Майстер-клас origami від Studio до весни', date, timeStr: '17:00 - 20:00', organizer: 'Studio', mentions: [{ ...announcementMention, postId: 11 }] },
      { id: 2, title: 'Останній origami до весни від Studio', date, timeStr: '17:00 - 20:00', organizer: 'Studio / Venue', mentions: [{ ...announcementMention, id: 3, postId: 12 }] },
    ]);

    const body = await (await GET()).json();

    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe(1);
    expect(body.events[0].mentions.map((mention: { postId: number }) => mention.postId)).toEqual([11, 12]);
  });
});
