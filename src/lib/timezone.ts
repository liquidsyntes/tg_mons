export const DEFAULT_APP_TIMEZONE = 'Europe/Moscow';

export interface ZonedDateParts {
  dateKey: string;
  dayOfWeek: number; // Sunday = 0
  hour: number;
}

const weekdays: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
const formatters = new Map<string, Intl.DateTimeFormat>();

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE;
}

export function getZonedDateParts(date: Date, timeZone: string = getAppTimezone()): ZonedDateParts {
  const zone = timeZone.trim() || DEFAULT_APP_TIMEZONE;
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    });
    formatters.set(zone, formatter);
  }

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const dayOfWeek = weekdays[parts.weekday];
  const hour = Number(parts.hour);
  if (dayOfWeek === undefined || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError('Could not read date in application timezone');
  }
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, dayOfWeek, hour };
}
