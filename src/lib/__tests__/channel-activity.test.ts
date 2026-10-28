import { describe, expect, it } from 'vitest';
import { buildHourlyActivity } from '../channel-activity';

describe('buildHourlyActivity', () => {
  it('uses the latest sample per hour and leaves missing hours without a made-up delta', () => {
    const now = new Date('2026-10-28T15:20:00.000Z');
    const rows = buildHourlyActivity(now, [
      { collectedAt: new Date('2026-10-26T16:05:00.000Z'), membersCount: 100 },
      { collectedAt: new Date('2026-10-26T16:50:00.000Z'), membersCount: 101 },
      { collectedAt: new Date('2026-10-26T17:05:00.000Z'), membersCount: 99 },
      { collectedAt: new Date('2026-10-26T19:05:00.000Z'), membersCount: 105 },
    ], [
      { id: 8, messageId: 42n, publishedAt: new Date('2026-10-26T17:12:00.000Z'), isForwarded: true },
    ], [
      { hourStart: new Date('2026-10-26T17:00:00.000Z'), reactionsAdded: 3, forwardsAdded: 1 },
    ], { collectedAt: new Date('2026-10-26T15:45:00.000Z'), membersCount: 100 });

    expect(rows).toHaveLength(48);
    expect(rows[0].hourStart).toBe('2026-10-28T15:00:00.000Z');
    expect(rows[0].membersCount).toBeNull();
    const first = rows.find(row => row.hourStart === '2026-10-26T16:00:00.000Z');
    expect(first).toMatchObject({ membersCount: 101, membersDelta: 1,
      sampledAt: '2026-10-26T16:50:00.000Z' });
    const postHour = rows.find(row => row.hourStart === '2026-10-26T17:00:00.000Z');
    expect(postHour).toMatchObject({ membersCount: 99, membersDelta: -2,
      posts: [{ id: 8, messageId: '42', isForwarded: true }], reactionsAdded: 3, forwardsAdded: 1 });
    expect(rows.find(row => row.hourStart === '2026-10-26T18:00:00.000Z')?.membersDelta).toBeNull();
    expect(rows.find(row => row.hourStart === '2026-10-26T19:00:00.000Z')?.membersDelta).toBeNull();
  });

  it('does not claim growth without an adjacent previous sample', () => {
    const rows = buildHourlyActivity(new Date('2026-10-28T15:20:00.000Z'), [
      { collectedAt: new Date('2026-10-28T15:05:00.000Z'), membersCount: 200 },
    ], [], [], { collectedAt: new Date('2026-10-26T14:00:00.000Z'), membersCount: 190 });
    expect(rows[0]).toMatchObject({ membersCount: 200, membersDelta: null, posts: [], reactionsAdded: 0, forwardsAdded: 0 });
  });
});
