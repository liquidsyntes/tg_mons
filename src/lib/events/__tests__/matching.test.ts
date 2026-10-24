import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  findMany: vi.fn(), transaction: vi.fn(), createMentions: vi.fn(), createDismissals: vi.fn(),
  updateEvent: vi.fn(), deleteEvents: vi.fn(),
}));
vi.mock('../../prisma', () => ({ prisma: {
  event: { findMany: db.findMany }, $transaction: db.transaction,
} }));

import { isSameEvent, mergeDuplicateEventsInDb } from '../matching';

const first = {
  title: 'Майстер-клас з origami від Studio (останній до весни)',
  date: new Date('2026-10-17T00:00:00Z'),
  timeStr: '17:00 - 20:00',
  organizer: 'Studio',
};

describe('isSameEvent', () => {
  it('matches different titles for one event with the same date, time and organizer', () => {
    expect(isSameEvent(first, {
      title: 'Останній МК до весни від Studio (origami)',
      date: first.date,
      timeStr: first.timeStr,
      organizer: 'Studio / Venue',
    })).toBe(true);
  });

  it('keeps different sessions and different organizers separate', () => {
    expect(isSameEvent(first, { ...first, timeStr: '20:00 - 22:00' })).toBe(false);
    expect(isSameEvent(first, { ...first, title: 'Останній МК до весни від Studio (origami)', organizer: 'Other Venue' })).toBe(false);
    expect(isSameEvent(first, { ...first, title: 'Заняття з шибарі від Studio' })).toBe(false);
  });

  it('retains exact-title matching when time or organizer is missing', () => {
    expect(isSameEvent(first, { title: first.title, date: first.date })).toBe(true);
  });
});

describe('mergeDuplicateEventsInDb', () => {
  const date = new Date('2026-10-17T00:00:00Z');
  const canonical = {
    id: 1, title: 'Осенний концерт', date, timeStr: null, organizer: null,
    prices: [], dismissedAt: null, createdAt: new Date('2026-10-01T00:00:00Z'),
    mentions: [{ postId: 101 }], dismissedByUsers: [],
  };
  const duplicate = {
    ...canonical, id: 2, timeStr: '20:00', organizer: 'Клуб', prices: ['Вход 100 ₽'],
    dismissedAt: new Date('2026-10-02T00:00:00Z'), createdAt: new Date('2026-10-02T00:00:00Z'),
    mentions: [{ postId: 102 }], dismissedByUsers: [{ userId: 7, dismissedAt: new Date('2026-10-03T00:00:00Z') }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.findMany.mockResolvedValueOnce([canonical, duplicate]).mockResolvedValueOnce([canonical, duplicate]);
    db.transaction.mockImplementation(async callback => callback({
      event: { findMany: db.findMany, update: db.updateEvent, deleteMany: db.deleteEvents },
      eventMention: { createMany: db.createMentions },
      userDismissedEvent: { createMany: db.createDismissals },
    }));
    db.createMentions.mockResolvedValue({ count: 1 });
    db.createDismissals.mockResolvedValue({ count: 1 });
    db.updateEvent.mockResolvedValue({});
    db.deleteEvents.mockResolvedValue({ count: 1 });
  });

  it('moves post links and personal dismissals before deleting duplicate events', async () => {
    expect(await mergeDuplicateEventsInDb()).toBe(1);
    expect(db.createMentions).toHaveBeenCalledWith({
      data: [{ eventId: 1, postId: 102 }], skipDuplicates: true,
    });
    expect(db.createDismissals).toHaveBeenCalledWith({
      data: [{ eventId: 1, userId: 7, dismissedAt: new Date('2026-10-03T00:00:00Z') }],
      skipDuplicates: true,
    });
    expect(db.updateEvent).toHaveBeenCalledWith({ where: { id: 1 }, data: {
      timeStr: '20:00', organizer: 'Клуб', prices: ['Вход 100 ₽'],
      dismissedAt: new Date('2026-10-02T00:00:00Z'),
    } });
    expect(db.deleteEvents).toHaveBeenCalledWith({ where: { id: { in: [2] } } });
    expect(db.createMentions.mock.invocationCallOrder[0]).toBeLessThan(db.deleteEvents.mock.invocationCallOrder[0]);
  });

  it('keeps distinct events separate', async () => {
    db.findMany.mockReset().mockResolvedValue([canonical, { ...duplicate, title: 'Другое мероприятие', timeStr: '22:00' }]);
    expect(await mergeDuplicateEventsInDb()).toBe(0);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('does not delete a duplicate if copying its links fails', async () => {
    db.createMentions.mockRejectedValue(new Error('Database unavailable'));
    await expect(mergeDuplicateEventsInDb()).rejects.toThrow('Database unavailable');
    expect(db.deleteEvents).not.toHaveBeenCalled();
  });
});
