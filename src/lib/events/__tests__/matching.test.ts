import { describe, expect, it } from 'vitest';
import { isSameEvent } from '../matching';

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
