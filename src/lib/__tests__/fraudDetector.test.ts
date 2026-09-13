import { describe, it, expect } from 'vitest';
import { checkViewsToSubsRatio, checkGrowthSmoothness, checkUncorrelatedSpikes, checkLowCitationGrowth } from '../fraudDetector';


describe('Fraud Detector', () => {
  describe('checkViewsToSubsRatio', () => {
    it('returns flag false and 0 ratio if members <= 0', () => {
      const posts = [{ views: 100 }];
      const result = checkViewsToSubsRatio(posts, 0);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBe(0);
      expect(result.reason).toContain('Недостаточно');
    });

    it('returns flag false if no posts with valid views', () => {
      const posts = [{ views: null }, { views: 0 }];
      const result = checkViewsToSubsRatio(posts, 1000);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBe(0);
      expect(result.reason).toContain('Нет постов');
    });

    it('flags low ratio (<5%) when enough posts are present', () => {
      // 10000 members, avg views = 300 (3%)
      const posts = Array(5).fill({ views: 300 });
      const result = checkViewsToSubsRatio(posts, 10000);
      expect(result.flag).toBe(true);
      expect(result.ratio).toBeCloseTo(0.03);
      expect(result.reason).toContain('< 5%');
    });

    it('flags high ratio (>150%) when enough posts are present', () => {
      // 1000 members, avg views = 2000 (200%)
      const posts = Array(6).fill({ views: 2000 });
      const result = checkViewsToSubsRatio(posts, 1000);
      expect(result.flag).toBe(true);
      expect(result.ratio).toBeCloseTo(2.0);
      expect(result.reason).toContain('> 150%');
    });

    it('does not flag if ratio is normal', () => {
      // 10000 members, avg views = 2000 (20%)
      const posts = Array(5).fill({ views: 2000 });
      const result = checkViewsToSubsRatio(posts, 10000);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBeCloseTo(0.2);
      expect(result.reason).toContain('пределах нормы');
    });

    it('does not flag if there are not enough posts even if ratio is extreme', () => {
      // 10000 members, avg views = 300 (3%), but only 4 posts
      const posts = Array(4).fill({ views: 300 });
      const result = checkViewsToSubsRatio(posts, 10000);
      expect(result.flag).toBe(false);
      expect(result.ratio).toBeCloseTo(0.03);
      expect(result.reason).toContain('Недостаточно постов');
    });
  });

  describe('checkGrowthSmoothness', () => {
    const today = new Date();
    
    it('returns flag false if insufficient data', () => {
      const metrics = Array(13).fill(null).map((_, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: 100 + i * 10
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('Недостаточно данных');
    });

    it('returns flag false for organic (variable) growth', () => {
      // 14 days, deltas will vary significantly (+10, -5, +30...)
      const followers = [100, 110, 105, 135, 140, 150, 145, 160, 180, 175, 200, 210, 205, 250];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.cv).toBeGreaterThan(0.1);
      expect(result.reason).toContain('Рост в пределах нормы');
    });

    it('returns flag true for linear growth (fraud)', () => {
      // Strictly same delta (+10) each day -> CV = 0
      const metrics = Array(15).fill(null).map((_, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: 100 + i * 10
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(true);
      expect(result.cv).toBe(0);
      expect(result.reason).toContain('Аномально гладкий рост');
    });

    it('returns flag false if no monotonic growth (avg delta <= 0)', () => {
      // Followers are decreasing
      const metrics = Array(15).fill(null).map((_, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: 100 - i * 5
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.cv).toBe(0);
      expect(result.reason).toContain('Нет монотонного роста');
    });

    it('returns flag false for weak growth with one massive spike', () => {
      const followers = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 2000];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      const result = checkGrowthSmoothness(metrics);
      expect(result.flag).toBe(false);
      expect(result.cv).toBeGreaterThan(0.1);
      expect(result.reason).toContain('Рост в пределах нормы');
    });
  });

  describe('checkUncorrelatedSpikes', () => {
    const today = new Date('2024-01-10T12:00:00Z');
    
    it('returns flag false if insufficient data', () => {
      const result = checkUncorrelatedSpikes([{ date: today, followers: 100 }], [], []);
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('Недостаточно данных');
    });

    it('returns flag false for normal growth', () => {
      const followers = [100, 110, 105, 120, 125];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      const result = checkUncorrelatedSpikes(metrics, [], []);
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('Аномальных скачков не обнаружено');
    });

    it('returns flag false for justified spike (post on same day)', () => {
      const followers = [100, 110, 120, 130, 2000];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      const spikeDate = new Date(today.getTime() + 4 * 86400000);
      const postsDates = [spikeDate];
      const result = checkUncorrelatedSpikes(metrics, postsDates, []);
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('обоснованы');
    });

    it('returns flag false for justified spike (mention on previous day)', () => {
      const followers = [100, 110, 120, 130, 2000];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000), // days 0 to 4
        followers: f
      }));
      // Spike on day 4. Mention on day 3.
      const mentionDate = new Date(today.getTime() + 3 * 86400000);
      const mentionsDates = [mentionDate];
      const result = checkUncorrelatedSpikes(metrics, [], mentionsDates);
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('обоснованы');
    });

    it('returns flag true for anomalous spike (no post, no mention)', () => {
      const followers = [100, 110, 120, 130, 2000];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      // No posts, no mentions.
      const result = checkUncorrelatedSpikes(metrics, [], []);
      expect(result.flag).toBe(true);
      expect(result.spikesCount).toBe(1);
      expect(result.reason).toContain('необъяснимых скачков');
    });

    it('protects large channels from false positives', () => {
      // Very large channel, spike of 400.
      const followers = [100000, 100100, 100200, 100300, 100700];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f
      }));
      const result = checkUncorrelatedSpikes(metrics, [], []);
      // threshold: max(100 * 3 = 300, 50, 100700 * 0.005 = 503.5) = 503.5
      // jump is 400 < 503.5 => no anomalous spike
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('Аномальных скачков не обнаружено');
    });
  });

  describe('checkLowCitationGrowth', () => {
    it('flags a channel with >5% growth and 0 citation index / mentions', () => {
      // Direct numbers call: 10% growth and 0 citation index
      const result = checkLowCitationGrowth(10, 0);
      expect(result.flag).toBe(true);
      expect(result.growthRate).toBe(10);
      expect(result.citationIndex).toBe(0);
      expect(result.reason).toContain('Подозрение на накрутку');
      expect(result.reason).toContain('> 5%');
    });

    it('flags a channel with >5% growth and empty mentions array', () => {
      const result = checkLowCitationGrowth(8, []);
      expect(result.flag).toBe(true);
      expect(result.citationIndex).toBe(0);
      expect(result.reason).toContain('Подозрение на накрутку');
    });

    it('flags a channel object with >5% growth and 0 mentions', () => {
      const channel = {
        delta30d: { percent: 12 },
        mentions: [],
      };
      const result = checkLowCitationGrowth(channel);
      expect(result.flag).toBe(true);
      expect(result.growthRate).toBe(12);
      expect(result.citationIndex).toBe(0);
    });

    it('flags a channel with >5% growth and near-zero citation index (<= 1)', () => {
      // 1 mention from a tiny channel with 5 subscribers: log10(5) = 0.7 (near zero)
      const result = checkLowCitationGrowth(15, [{ citing_subscribers: 5 }]);
      expect(result.flag).toBe(true);
      expect(result.citationIndex).toBeLessThanOrEqual(1);
    });

    it('clears a channel with >5% growth and a high citation index', () => {
      // 10% growth and citation index 30
      const result = checkLowCitationGrowth(10, 30);
      expect(result.flag).toBe(false);
      expect(result.growthRate).toBe(10);
      expect(result.citationIndex).toBe(30);
      expect(result.reason).toContain('достаточен');
    });

    it('clears a channel with >5% growth when mentions yield a high citation index', () => {
      // 20% growth with mentions from substantial channels
      const mentions = [
        { mentions: 5, citing_subscribers: 10000 }, // 5 * 4 = 20
        { mentions: 2, citing_subscribers: 100000 }, // 2 * 5 = 10
      ];
      const result = checkLowCitationGrowth(20, mentions);
      expect(result.flag).toBe(false);
      expect(result.citationIndex).toBe(30);
      expect(result.reason).toContain('достаточен');
    });

    it('clears a channel object with >5% growth and high citation index', () => {
      const channel = {
        growthRate30d: 15,
        citationIndex: 25,
      };
      const result = checkLowCitationGrowth(channel);
      expect(result.flag).toBe(false);
    });

    it('does not flag if growth is <= 5% even with 0 mentions', () => {
      // 4% growth, 0 mentions
      const result4 = checkLowCitationGrowth(4, 0);
      expect(result4.flag).toBe(false);
      expect(result4.reason).toContain('не превышает порог 5%');

      // Exactly 5% growth (threshold boundary)
      const result5 = checkLowCitationGrowth(5, 0);
      expect(result5.flag).toBe(false);

      // Negative growth (-2%), 0 mentions
      const resultNeg = checkLowCitationGrowth(-2, 0);
      expect(resultNeg.flag).toBe(false);

      // Zero growth (0%), 0 mentions
      const resultZero = checkLowCitationGrowth(0, 0);
      expect(resultZero.flag).toBe(false);
    });

    it('clears channel when passed a single mention object with high subscriber count', () => {
      const result = checkLowCitationGrowth(12, { mentions: 3, citing_subscribers: 10000 });
      expect(result.flag).toBe(false);
      expect(result.citationIndex).toBe(12);
      expect(result.reason).toContain('достаточен');
    });

    it('handles ChannelMetrics-shaped objects with delta30d.percent and citations/mentions', () => {
      // Channel with >5% growth and 0 mentions
      const suspiciousChannel = {
        delta30d: { percent: 18.5 },
        citationIndex: null,
        mentions: [],
      };
      const susResult = checkLowCitationGrowth(suspiciousChannel);
      expect(susResult.flag).toBe(true);
      expect(susResult.growthRate).toBe(18.5);
      expect(susResult.citationIndex).toBe(0);

      // Channel with >5% growth and legitimate mentions
      const legitChannel = {
        delta30d: { percent: 18.5 },
        citationIndex: null,
        mentions: [{ mentions: 5, citing_subscribers: 10000 }],
      };
      const legitResult = checkLowCitationGrowth(legitChannel);
      expect(legitResult.flag).toBe(false);
      expect(legitResult.citationIndex).toBe(20);
    });

    it('clears channel when passed a single mention object with membersCount or currentMembers', () => {
      const resultMembersCount = checkLowCitationGrowth(12, { mentions: 5, membersCount: 10000 });
      expect(resultMembersCount.flag).toBe(false);
      expect(resultMembersCount.citationIndex).toBe(20);

      const resultCurrentMembers = checkLowCitationGrowth(12, { count: 2, currentMembers: 1000 });
      expect(resultCurrentMembers.flag).toBe(false);
      expect(resultCurrentMembers.citationIndex).toBe(6);
    });

    it('handles numeric string growth rates', () => {
      const resultStr = checkLowCitationGrowth("15" as any, 0);
      expect(resultStr.flag).toBe(true);
      expect(resultStr.growthRate).toBe(15);
    });

    it('handles non-finite values (Infinity, -Infinity) safely', () => {
      const resultInf = checkLowCitationGrowth(Infinity, 0);
      expect(resultInf.flag).toBe(false);
      expect(resultInf.growthRate).toBe(0);

      const resultCiInf = checkLowCitationGrowth(10, Infinity);
      expect(resultCiInf.flag).toBe(true);
      expect(resultCiInf.citationIndex).toBe(0);
    });

    it('supports custom thresholds via options', () => {
      // 8% growth with custom minGrowth = 10% -> should NOT flag
      const result1 = checkLowCitationGrowth(8, 0, { minGrowth: 10 });
      expect(result1.flag).toBe(false);

      // 8% growth with custom maxCitationIndex = 5, citationIndex = 3 -> should flag
      const result2 = checkLowCitationGrowth(8, 3, { minGrowth: 5, maxCitationIndex: 5 });
      expect(result2.flag).toBe(true);
    });

    it('handles edge case and malformed inputs without crashing', () => {
      expect(checkLowCitationGrowth(null as any).flag).toBe(false);
      expect(checkLowCitationGrowth(undefined as any).flag).toBe(false);
      expect(checkLowCitationGrowth(NaN, NaN).flag).toBe(false);
      expect(checkLowCitationGrowth(10, null).flag).toBe(true);
    });

    it('clears channel when citationIndex is passed as numeric string or BigInt', () => {
      // 10% growth with citation index "15" (string) -> should NOT flag
      const resultStr = checkLowCitationGrowth(10, "15" as any);
      expect(resultStr.flag).toBe(false);
      expect(resultStr.citationIndex).toBe(15);

      // Object with citation index "20" -> should NOT flag
      const resultObjStr = checkLowCitationGrowth({ growthRate: 10, citationIndex: "20" as any });
      expect(resultObjStr.flag).toBe(false);
      expect(resultObjStr.citationIndex).toBe(20);

      // Object with citation index 20n (BigInt) -> should NOT flag
      const resultObjBigInt = checkLowCitationGrowth({ growthRate: 10, citationIndex: 20n as any });
      expect(resultObjBigInt.flag).toBe(false);
      expect(resultObjBigInt.citationIndex).toBe(20);
    });

    it('handles growth rates formatted with percent signs and BigInt', () => {
      // "10%" growth -> should flag if citationIndex is 0
      const resultPercent = checkLowCitationGrowth("10%", 0);
      expect(resultPercent.flag).toBe(true);
      expect(resultPercent.growthRate).toBe(10);

      // "+15%" growth
      const resultPlus = checkLowCitationGrowth("+15%", 0);
      expect(resultPlus.flag).toBe(true);
      expect(resultPlus.growthRate).toBe(15);

      // BigInt growth: 10n
      const resultBigInt = checkLowCitationGrowth(10n as any, 0);
      expect(resultBigInt.flag).toBe(true);
      expect(resultBigInt.growthRate).toBe(10);
    });

    it('formats threshold correctly in reason string when custom minGrowth is provided', () => {
      const res = checkLowCitationGrowth(8, 0, { minGrowth: 10 });
      expect(res.flag).toBe(false);
      expect(res.reason).toContain('не превышает порог 10%');
    });
  });
});



