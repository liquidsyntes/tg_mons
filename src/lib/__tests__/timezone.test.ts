import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppTimezone, getZonedDateParts } from '../timezone';

afterEach(() => vi.unstubAllEnvs());

describe('application timezone', () => {
  it('uses Moscow by default and reads weekday and hour independently of server TZ', () => {
    const instant = new Date('2026-10-17T22:30:00.000Z');
    vi.stubEnv('APP_TIMEZONE', '');
    vi.stubEnv('TZ', 'UTC');
    const utcServer = getZonedDateParts(instant);
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const pacificServer = getZonedDateParts(instant);

    expect(getAppTimezone()).toBe('Europe/Moscow');
    expect(utcServer).toEqual({ dateKey: '2026-10-18', dayOfWeek: 0, hour: 1 });
    expect(pacificServer).toEqual(utcServer);
  });

  it('supports an IANA timezone override across a daylight saving transition', () => {
    const instant = new Date('2026-03-29T01:30:00.000Z');
    vi.stubEnv('APP_TIMEZONE', 'Europe/Berlin');
    vi.stubEnv('TZ', 'UTC');
    const utcServer = getZonedDateParts(instant);
    vi.stubEnv('TZ', 'Asia/Tokyo');

    expect(utcServer).toEqual({ dateKey: '2026-03-29', dayOfWeek: 0, hour: 3 });
    expect(getZonedDateParts(instant)).toEqual(utcServer);
  });
});
