import { describe, expect, it } from 'vitest';
import {
  buildEventIcs,
  buildGoogleCalendarUrl,
  escapeIcsText,
  filterEvents,
  isFreeEvent,
  parseEventTimeWindow,
  type CalendarEventInput,
} from '../calendar';

describe('calendar export and event filtering', () => {
  it('parses single start time, overnight time range, and all-day events without time', () => {
    expect(parseEventTimeWindow('2026-10-31', '19:00')).toEqual({
      allDay: false,
      startDate: '20261031T190000',
      endDate: '20261031T210000',
    });

    expect(parseEventTimeWindow('2026-10-31T00:00:00.000Z', '22:00 - 05:00')).toEqual({
      allDay: false,
      startDate: '20261031T220000',
      endDate: '20261101T050000',
    });

    expect(parseEventTimeWindow('2026-10-31', null)).toEqual({
      allDay: true,
      startDate: '20261031',
      endDate: '20261101',
    });
  });

  it('escapes commas, semicolons, backslashes, and newlines in ICS text', () => {
    expect(escapeIcsText('Лекция: часть 1, 2; вход\\выход\nНовое место')).toBe(
      'Лекция: часть 1\\, 2\\; вход\\\\выход\\nНовое место',
    );
  });

  it('builds valid .ics content for timed and all-day events with escaped fields and Telegram source links', () => {
    const timedEvent: CalendarEventInput = {
      id: 101,
      title: 'Вечеринка, сет; специальный гость',
      date: '2026-10-31T00:00:00.000Z',
      timeStr: '22:00 - 05:00',
      organizer: 'Клуб «Маяк», зал 2',
      prices: ['Вход: 500 грн', 'VIP; 1000 грн'],
      mentions: [
        {
          id: 1,
          post: {
            messageId: '42',
            channel: { title: 'Афиша Киева', username: 'kyiv_events', tgId: '-100123456' },
          },
        },
      ],
    };

    const ics = buildEventIcs(timedEvent, new Date('2026-10-27T12:00:00.000Z'));
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('UID:tgmon-event-101@tgmon.local\r\n');
    expect(ics).toContain('DTSTAMP:20261027T120000Z\r\n');
    expect(ics).toContain('DTSTART:20261031T220000\r\n');
    expect(ics).toContain('DTEND:20261101T050000\r\n');
    expect(ics).toContain('SUMMARY:Вечеринка\\, сет\\; специальный гость\r\n');
    expect(ics).toContain('LOCATION:Клуб «Маяк»\\, зал 2\r\n');
    expect(ics).toContain('URL:https://t.me/kyiv_events/42\r\n');
    expect(ics).toContain('DESCRIPTION:Время: 22:00 - 05:00\\nОрганизатор: Клуб «Маяк»\\, зал 2\\nСтоимость: Вход: 500 грн\\, VIP\\; 1000 грн\\nИсточники в Telegram:\\nАфиша Киева: https://t.me/kyiv_events/42\r\n');

    const allDayIcs = buildEventIcs(
      { id: 102, title: 'Выставка', date: '2026-11-05', timeStr: null },
      new Date('2026-10-27T12:00:00.000Z'),
    );
    expect(allDayIcs).toContain('DTSTART;VALUE=DATE:20261105\r\n');
    expect(allDayIcs).toContain('DTEND;VALUE=DATE:20261106\r\n');
  });

  it('builds Google Calendar template URL with dates, title, location, and details', () => {
    const url = buildGoogleCalendarUrl({
      id: 7,
      title: 'Открытый микрофон',
      date: '2026-10-30',
      timeStr: '19:00',
      organizer: 'StandUp Club',
      prices: ['Бесплатно'],
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsed.searchParams.get('text')).toBe('Открытый микрофон');
    expect(parsed.searchParams.get('dates')).toBe('20261030T190000/20261030T210000');
    expect(parsed.searchParams.get('location')).toBe('StandUp Club');
    expect(parsed.searchParams.get('details')).toContain('Организатор: StandUp Club');
  });

  it('filters events by weekend, week, today/tomorrow, search query, and free admission relative to anchor date', () => {
    // Anchor date: Wednesday, 2026-10-28 (week ends Sunday 2026-11-01; weekend is Sat 2026-10-31 .. Sun 2026-11-01)
    const anchor = new Date('2026-10-28T10:00:00.000Z');
    const events: CalendarEventInput[] = [
      { id: 1, title: 'Прошедшая лекция', date: '2026-10-27', organizer: 'Лекторий', prices: ['500 грн'] },
      { id: 2, title: 'Среда митап', date: '2026-10-28', organizer: 'IT Hub', prices: ['Бесплатно'] },
      { id: 3, title: 'Четверг воркшоп', date: '2026-10-29', organizer: 'Design Lab', prices: ['300 грн'] },
      { id: 4, title: 'Пятничный концерт', date: '2026-10-30', organizer: 'Music Hall', prices: ['800 грн'] },
      { id: 5, title: 'Субботний рейв', date: '2026-10-31', organizer: 'Club Closer', prices: ['1000 грн'] },
      { id: 6, title: 'Воскресный маркет', date: '2026-11-01', organizer: 'Городской сад', prices: ['Вход свободный'] },
      { id: 7, title: 'Конференция через неделю', date: '2026-11-10', organizer: 'Expo', prices: ['0 грн'] },
    ];

    expect(filterEvents(events, { datePreset: 'today_tomorrow' }, anchor).map(e => e.id)).toEqual([2, 3]);
    expect(filterEvents(events, { datePreset: 'weekend' }, anchor).map(e => e.id)).toEqual([5, 6]);
    expect(filterEvents(events, { datePreset: 'week' }, anchor).map(e => e.id)).toEqual([2, 3, 4, 5, 6]);
    expect(filterEvents(events, { datePreset: 'all' }, anchor).map(e => e.id)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(filterEvents(events, { datePreset: 'all', freeOnly: true }, anchor).map(e => e.id)).toEqual([2, 6, 7]);
    expect(filterEvents(events, { datePreset: 'all', query: 'closer' }, anchor).map(e => e.id)).toEqual([5]);
    expect(isFreeEvent(['500 грн'])).toBe(false);
    expect(isFreeEvent(['Вход: бесплатно'])).toBe(true);
  });
});
