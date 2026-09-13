import { describe, it, expect } from 'vitest';
import { calculateCitationIndex } from '../citationIndex';
import { calculateCitationIndex as metricsCalculateCitationIndex } from '../metrics';

describe('calculateCitationIndex', () => {
  const fixedNow = new Date('2026-09-13T12:00:00Z');

  describe('logarithmic weighting', () => {
    it('correctly weights citations logarithmically for a single citing channel', () => {
      // 1 mention from a channel with 1,000 subscribers: log10(1000) = 3
      const result1k = calculateCitationIndex({
        mentions: [{ mentions: 1, citing_subscribers: 1000 }],
      });
      expect(result1k).toBe(3);

      // 1 mention from a channel with 10,000 subscribers: log10(10000) = 4
      const result10k = calculateCitationIndex({
        mentions: [{ mentions: 1, citing_subscribers: 10000 }],
      });
      expect(result10k).toBe(4);

      // 2 mentions from a channel with 100,000 subscribers: 2 * log10(100000) = 2 * 5 = 10
      const result100k = calculateCitationIndex({
        mentions: [{ mentions: 2, citing_subscribers: 100000 }],
      });
      expect(result100k).toBe(10);
    });

    it('correctly sums multiple citing channels with logarithmic weights', () => {
      // Channel A: 3 mentions * log10(1,000) = 3 * 3 = 9
      // Channel B: 2 mentions * log10(10,000) = 2 * 4 = 8
      // Channel C: 1 mention * log10(1,000,000) = 1 * 6 = 6
      // Total = 9 + 8 + 6 = 23
      const channel = {
        mentions: [
          { mentions: 3, citing_subscribers: 1000 },
          { mentions: 2, citing_subscribers: 10000 },
          { mentions: 1, citing_subscribers: 1000000 },
        ],
      };

      const score = calculateCitationIndex(channel);
      expect(score).toBe(23);
    });

    it('demonstrates sub-linear (logarithmic) growth compared to linear subscriber count', () => {
      // 10 subs -> log10(10) = 1
      // 100,000 subs -> log10(100000) = 5
      // Linear ratio is 10,000x, but citation weight ratio is only 5x
      const smallChannel = calculateCitationIndex([{ citing_subscribers: 10 }]);
      const largeChannel = calculateCitationIndex([{ citing_subscribers: 100000 }]);

      expect(smallChannel).toBe(1);
      expect(largeChannel).toBe(5);
      expect(largeChannel / smallChannel).toBe(5);
    });

    it('is also exported from src/lib/metrics', () => {
      const score = metricsCalculateCitationIndex([{ mentions: 1, citing_subscribers: 10000 }]);
      expect(score).toBe(4);
    });
  });

  describe('edge cases and resilience', () => {
    it('returns 0 for empty mentions array without crashing', () => {
      expect(calculateCitationIndex([])).toBe(0);
      expect(calculateCitationIndex({ mentions: [] })).toBe(0);
    });

    it('returns 0 for 0 mentions without crashing', () => {
      expect(calculateCitationIndex({ mentions: 0 })).toBe(0);
      expect(calculateCitationIndex({ mentions: [{ mentions: 0, citing_subscribers: 10000 }] })).toBe(0);
    });

    it('returns 0 for null or undefined channel without crashing', () => {
      expect(calculateCitationIndex(null)).toBe(0);
      expect(calculateCitationIndex(undefined)).toBe(0);
      expect(calculateCitationIndex({})).toBe(0);
    });

    it('handles citing_subscribers <= 1 gracefully without negative numbers or -Infinity', () => {
      // 0 subscribers -> weight 0
      expect(calculateCitationIndex([{ mentions: 5, citing_subscribers: 0 }])).toBe(0);
      // 1 subscriber -> log10(1) = 0
      expect(calculateCitationIndex([{ mentions: 5, citing_subscribers: 1 }])).toBe(0);
      // negative subscribers -> weight 0
      expect(calculateCitationIndex([{ mentions: 5, citing_subscribers: -500 }])).toBe(0);
    });

    it('supports alternative property names (count, citingSubscribers, subscribers, membersCount, currentMembers)', () => {
      const res1 = calculateCitationIndex([{ count: 2, citingSubscribers: 1000 }]);
      expect(res1).toBe(6);

      const res2 = calculateCitationIndex([{ mentions: 3, subscribers: 10000 }]);
      expect(res2).toBe(12);

      const res3 = calculateCitationIndex([
        { count: 1, sourceChannel: { currentMembers: 1000 } },
      ]);
      expect(res3).toBe(3);

      const res4 = calculateCitationIndex([
        { count: 1, sourceChannel: { membersCount: 100000 } },
      ]);
      expect(res4).toBe(5);

      const res5 = calculateCitationIndex([{ count: 3, membersCount: 1000 }]);
      expect(res5).toBe(9);

      const res6 = calculateCitationIndex([{ count: 2, currentMembers: 10000 }]);
      expect(res6).toBe(8);
    });

    it('supports numeric strings and BigInt for subscriber counts and mentions count', () => {
      const stringSubs = calculateCitationIndex([{ mentions: '2', subscribers: '1000' }]);
      expect(stringSubs).toBe(6);

      const bigIntSubs = calculateCitationIndex([{ count: 2n, subscribers: 10000n }]);
      expect(bigIntSubs).toBe(8);
    });

    it('filters out mentions older than 30 days based on date, createdAt, publishedAt, or timestamp', () => {
      const channel = {
        mentions: [
          // 10 days ago (within 30 days): 1 mention * log10(1000) = 3
          {
            mentions: 1,
            citing_subscribers: 1000,
            date: new Date('2026-09-03T12:00:00Z'),
          },
          // 40 days ago (older than 30 days): should be excluded
          {
            mentions: 1,
            citing_subscribers: 100000,
            date: new Date('2026-08-04T12:00:00Z'),
          },
          // 45 days ago with timestamp: should be excluded
          {
            mentions: 1,
            citing_subscribers: 10000,
            timestamp: new Date('2026-07-30T12:00:00Z'),
          },
        ],
      };

      const score = calculateCitationIndex(channel, fixedNow);
      expect(score).toBe(3);
    });

    it('includes mentions when no date is specified (defaulting to current period)', () => {
      const channel = {
        mentions: [
          { mentions: 2, citing_subscribers: 1000 },
        ],
      };
      expect(calculateCitationIndex(channel, fixedNow)).toBe(6);
    });

    it('handles a single mention object passed directly instead of an array or wrapper', () => {
      expect(calculateCitationIndex({ mentions: 1, citing_subscribers: 1000 })).toBe(3);
      expect(calculateCitationIndex({ count: 2, citingSubscribers: 10000 })).toBe(8);
      expect(calculateCitationIndex({ citing_subscribers: 100000 })).toBe(5);
      expect(calculateCitationIndex({ count: 1, sourceChannel: { membersCount: 1000 } })).toBe(3);
      expect(calculateCitationIndex({ mentions: 5, membersCount: 10000 })).toBe(20);
      expect(calculateCitationIndex({ count: 2, currentMembers: 1000 })).toBe(6);
    });

    it('supports direct numbers and bigints representing referring subscribers', () => {
      expect(calculateCitationIndex(1000)).toBe(3);
      expect(calculateCitationIndex(10000n)).toBe(4);
      expect(calculateCitationIndex(0)).toBe(0);
    });

    it('excludes self-citations when channel id is specified', () => {
      const channel = {
        id: 10,
        mentions: [
          { sourceChannelId: 10, citing_subscribers: 100000 }, // self-citation -> should be skipped
          { sourceChannelId: 20, citing_subscribers: 1000 },   // external citation -> 3
        ],
      };
      expect(calculateCitationIndex(channel)).toBe(3);
    });

    it('supports inbound and inbound_mentions keys', () => {
      expect(calculateCitationIndex({ inbound: [{ count: 1, subscribers: 1000 }] })).toBe(3);
      expect(calculateCitationIndex({ inbound_mentions: [{ count: 2, subscribers: 1000 }] })).toBe(6);
    });

    it('tolerates minor clock skew for freshly collected mentions', () => {
      // 5 seconds in the future due to slight client/server clock drift
      const skewedDate = new Date(fixedNow.getTime() + 5000);
      const res = calculateCitationIndex([
        { mentions: 1, citing_subscribers: 1000, date: skewedDate }
      ], fixedNow);
      expect(res).toBe(3);
    });

    it('handles NaN or non-finite subscriber / count values safely', () => {
      expect(calculateCitationIndex([{ count: NaN, citing_subscribers: 1000 }])).toBe(0);
      expect(calculateCitationIndex([{ count: 2, citing_subscribers: NaN }])).toBe(0);
      expect(calculateCitationIndex([{ count: Infinity, citing_subscribers: 1000 }])).toBe(0);
    });

    it('handles formatted subscriber strings with commas, spaces, or underscores', () => {
      expect(calculateCitationIndex([{ mentions: 1, subscribers: '10,000' }])).toBe(4);
      expect(calculateCitationIndex([{ mentions: 1, subscribers: '10 000' }])).toBe(4);
      expect(calculateCitationIndex([{ mentions: 1, subscribers: '10_000' }])).toBe(4);
    });

    it('filters out old mentions with snake_case created_at or published_at', () => {
      const oldMention = {
        mentions: 1,
        subscribers: 1000,
        created_at: new Date('2026-08-01T12:00:00Z'),
      };
      const recentMention = {
        mentions: 1,
        subscribers: 1000,
        published_at: new Date('2026-09-10T12:00:00Z'),
      };
      expect(calculateCitationIndex([oldMention], fixedNow)).toBe(0);
      expect(calculateCitationIndex([recentMention], fixedNow)).toBe(3);
    });

    it('excludes self-citations when snake_case source_channel_id is used', () => {
      const channel = {
        id: 15,
        mentions: [
          { source_channel_id: 15, subscribers: 10000 }, // self-citation
          { source_channel_id: 25, subscribers: 1000 },  // external
        ],
      };
      expect(calculateCitationIndex(channel)).toBe(3);
    });

    it('supports direct numeric strings representing subscriber count', () => {
      expect(calculateCitationIndex('1000')).toBe(3);
      expect(calculateCitationIndex('10,000')).toBe(4);
    });
  });
});
