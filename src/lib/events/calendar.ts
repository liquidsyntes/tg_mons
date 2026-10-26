export interface CalendarEventPost {
  messageId: string;
  channel: {
    title: string;
    username: string | null;
    tgId: string | null;
  } | null;
}

export interface CalendarEventMention {
  id: number;
  post: CalendarEventPost | null;
}

export interface CalendarEventInput {
  id: number;
  title: string;
  date: string | Date;
  timeStr?: string | null;
  organizer?: string | null;
  prices?: string[] | null;
  mentions?: CalendarEventMention[];
}

export type EventDatePreset = 'month' | 'all' | 'today_tomorrow' | 'weekend' | 'week';

export interface EventFilterOptions {
  datePreset?: EventDatePreset;
  selectedMonth?: Date;
  query?: string;
  freeOnly?: boolean;
}

export interface ParsedEventTimeWindow {
  allDay: boolean;
  startDate: string; // YYYYMMDD or YYYYMMDDTHHmmss
  endDate: string;   // YYYYMMDD or YYYYMMDDTHHmmss
}

export function getTelegramPostUrl(post: CalendarEventPost | null): string | null {
  if (!post || !/^[1-9]\d*$/.test(post.messageId)) return null;

  const username = post.channel?.username?.trim().replace(/^@/, '');
  if (username && /^[A-Za-z0-9_]{5,32}$/.test(username)) {
    return `https://t.me/${username}/${post.messageId}`;
  }

  const tgId = post.channel?.tgId;
  if (!tgId) return null;
  const channelId = tgId.startsWith('-100') ? tgId.slice(4) : tgId;
  return /^[1-9]\d*$/.test(channelId)
    ? `https://t.me/c/${channelId}/${post.messageId}`
    : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toCalendarDateParts(dateInput: string | Date): { year: number; month: number; day: number } {
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      return {
        year: Number(dateOnlyMatch[1]),
        month: Number(dateOnlyMatch[2]) - 1,
        day: Number(dateOnlyMatch[3]),
      };
    }
    if (trimmed.endsWith('T00:00:00.000Z') || trimmed.endsWith('T00:00:00Z')) {
      const parsedUtc = new Date(trimmed);
      if (!Number.isNaN(parsedUtc.getTime())) {
        return {
          year: parsedUtc.getUTCFullYear(),
          month: parsedUtc.getUTCMonth(),
          day: parsedUtc.getUTCDate(),
        };
      }
    }
  }

  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth(),
    day: parsed.getDate(),
  };
}

function formatYmd(year: number, monthIndex: number, day: number): string {
  const normalized = new Date(Date.UTC(year, monthIndex, day));
  return `${normalized.getUTCFullYear()}${pad2(normalized.getUTCMonth() + 1)}${pad2(normalized.getUTCDate())}`;
}

function formatYmdHms(year: number, monthIndex: number, day: number, hour: number, minute: number): string {
  const normalized = new Date(Date.UTC(year, monthIndex, day, hour, minute, 0));
  return (
    `${normalized.getUTCFullYear()}${pad2(normalized.getUTCMonth() + 1)}${pad2(normalized.getUTCDate())}` +
    `T${pad2(normalized.getUTCHours())}${pad2(normalized.getUTCMinutes())}00`
  );
}

interface ParsedClockTime {
  hour: number;
  minute: number;
}

function extractClockTimes(timeStr?: string | null): ParsedClockTime[] {
  if (!timeStr || typeof timeStr !== 'string') return [];
  const matches = [...timeStr.matchAll(/(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g)];
  return matches.map(match => ({
    hour: Number(match[1]),
    minute: Number(match[2]),
  }));
}

export function parseEventTimeWindow(
  dateInput: string | Date,
  timeStr?: string | null,
): ParsedEventTimeWindow {
  const { year, month, day } = toCalendarDateParts(dateInput);
  const times = extractClockTimes(timeStr);

  if (times.length === 0) {
    return {
      allDay: true,
      startDate: formatYmd(year, month, day),
      endDate: formatYmd(year, month, day + 1),
    };
  }

  const start = times[0];
  const startDate = formatYmdHms(year, month, day, start.hour, start.minute);

  if (times.length >= 2) {
    const end = times[1];
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    const endDayOffset = endMinutes <= startMinutes ? 1 : 0;
    return {
      allDay: false,
      startDate,
      endDate: formatYmdHms(year, month, day + endDayOffset, end.hour, end.minute),
    };
  }

  // Default 2-hour duration when only start time is given
  return {
    allDay: false,
    startDate,
    endDate: formatYmdHms(year, month, day, start.hour + 2, start.minute),
  };
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildEventDescription(event: CalendarEventInput): string {
  const lines: string[] = [];

  if (event.timeStr?.trim()) {
    lines.push(`Время: ${event.timeStr.trim()}`);
  }
  if (event.organizer?.trim()) {
    lines.push(`Организатор: ${event.organizer.trim()}`);
  }
  if (event.prices && event.prices.length > 0) {
    lines.push(`Стоимость: ${event.prices.join(', ')}`);
  }

  const sourceLinks = (event.mentions ?? [])
    .map(mention => {
      const url = getTelegramPostUrl(mention.post);
      if (!url) return null;
      const channelTitle = mention.post?.channel?.title || 'Канал';
      return `${channelTitle}: ${url}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  if (sourceLinks.length > 0) {
    lines.push('Источники в Telegram:');
    lines.push(...sourceLinks);
  }

  return lines.join('\n');
}

function formatUtcTimestamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

export function buildEventIcs(event: CalendarEventInput, now: Date = new Date()): string {
  const window = parseEventTimeWindow(event.date, event.timeStr);
  const description = buildEventDescription(event);
  const firstPostUrl = (event.mentions ?? [])
    .map(mention => getTelegramPostUrl(mention.post))
    .find((url): url is string => Boolean(url));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TG Monitor//Events//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:tgmon-event-${event.id}@tgmon.local`,
    `DTSTAMP:${formatUtcTimestamp(now)}`,
    window.allDay ? `DTSTART;VALUE=DATE:${window.startDate}` : `DTSTART:${window.startDate}`,
    window.allDay ? `DTEND;VALUE=DATE:${window.endDate}` : `DTEND:${window.endDate}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  if (event.organizer?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(event.organizer.trim())}`);
  }
  if (firstPostUrl) {
    lines.push(`URL:${firstPostUrl}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const window = parseEventTimeWindow(event.date, event.timeStr);
  const description = buildEventDescription(event);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${window.startDate}/${window.endDate}`,
  });

  if (description) {
    params.set('details', description);
  }
  if (event.organizer?.trim()) {
    params.set('location', event.organizer.trim());
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function isFreeEvent(prices?: string[] | null): boolean {
  if (!prices || prices.length === 0) return false;
  return prices.some(raw => {
    const normalized = raw.toLocaleLowerCase('ru-RU').trim();
    if (!normalized) return false;
    if (
      normalized.includes('бесплатн') ||
      normalized.includes('безкоштовн') ||
      normalized.includes('свободный вход') ||
      normalized.includes('вход свободный') ||
      normalized.includes('вхід вільний') ||
      normalized.includes('free') ||
      normalized.includes('донат') ||
      normalized.includes('donation')
    ) {
      return true;
    }
    return /(?:^|[^\d])0(?:\s*(?:грн|₴|руб|₽|\$|€|uah|usd|eur))?(?:$|[^\d])/i.test(normalized);
  });
}

function toDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month, day) / 86_400_000);
}

export function matchesEventDatePreset(
  eventDateInput: string | Date,
  preset: EventDatePreset,
  now: Date = new Date(),
  selectedMonth: Date = now,
): boolean {
  const eventParts = toCalendarDateParts(eventDateInput);
  const eventDay = toDayNumber(eventParts.year, eventParts.month, eventParts.day);

  const nowParts = toCalendarDateParts(now);
  const todayDay = toDayNumber(nowParts.year, nowParts.month, nowParts.day);

  if (preset === 'month') {
    const monthParts = toCalendarDateParts(selectedMonth);
    return eventParts.year === monthParts.year && eventParts.month === monthParts.month;
  }

  if (preset === 'all') {
    return eventDay >= todayDay;
  }

  if (preset === 'today_tomorrow') {
    return eventDay === todayDay || eventDay === todayDay + 1;
  }

  // Day of week in Monday-first system: Mon = 0 .. Sat = 5, Sun = 6
  const utcNowDate = new Date(Date.UTC(nowParts.year, nowParts.month, nowParts.day));
  const jsWeekday = utcNowDate.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const mondayIndex = (jsWeekday + 6) % 7;  // 0 (Mon) .. 5 (Sat), 6 (Sun)
  const sundayDay = todayDay + (6 - mondayIndex);
  const saturdayDay = sundayDay - 1;

  if (preset === 'weekend') {
    const startWeekend = Math.max(todayDay, saturdayDay);
    return eventDay >= startWeekend && eventDay <= sundayDay;
  }

  if (preset === 'week') {
    return eventDay >= todayDay && eventDay <= sundayDay;
  }

  return true;
}

export function filterEvents<T extends CalendarEventInput>(
  events: T[],
  options: EventFilterOptions = {},
  now: Date = new Date(),
): T[] {
  const preset = options.datePreset ?? 'month';
  const selectedMonth = options.selectedMonth ?? now;
  const query = options.query?.trim().toLocaleLowerCase('ru-RU') ?? '';
  const freeOnly = Boolean(options.freeOnly);

  return events.filter(event => {
    if (!matchesEventDatePreset(event.date, preset, now, selectedMonth)) {
      return false;
    }

    if (freeOnly && !isFreeEvent(event.prices)) {
      return false;
    }

    if (query) {
      const titleMatch = event.title.toLocaleLowerCase('ru-RU').includes(query);
      const organizerMatch = (event.organizer ?? '').toLocaleLowerCase('ru-RU').includes(query);
      const channelMatch = (event.mentions ?? []).some(mention => {
        const ch = mention.post?.channel;
        if (!ch) return false;
        return (
          ch.title.toLocaleLowerCase('ru-RU').includes(query) ||
          (ch.username ?? '').toLocaleLowerCase('ru-RU').includes(query)
        );
      });
      if (!titleMatch && !organizerMatch && !channelMatch) {
        return false;
      }
    }

    return true;
  });
}
