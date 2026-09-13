import { describe, it, expect } from 'vitest';
import {
  checkViewsToSubsRatio,
  checkGrowthSmoothness,
  checkUncorrelatedSpikes,
  checkLowCitationGrowth,
  checkUniformReactionRatio,
  runFraudAudit,
} from '../fraudDetector';


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

  describe('checkUniformReactionRatio', () => {
    it('returns flag false and reason when channel has insufficient data (<10 posts)', () => {
      // 0 posts
      const emptyResult = checkUniformReactionRatio([]);
      expect(emptyResult.flag).toBe(false);
      expect(emptyResult.cv).toBe(0);
      expect(emptyResult.reason).toContain('Недостаточно данных');

      // 5 posts with identical ERR
      const fivePosts = Array(5).fill({ views: 1000, reactions: 50 });
      const fiveResult = checkUniformReactionRatio(fivePosts);
      expect(fiveResult.flag).toBe(false);
      expect(fiveResult.cv).toBe(0);
      expect(fiveResult.reason).toContain('Недостаточно данных');

      // 9 posts with identical ERR (boundary just below threshold)
      const ninePosts = Array(9).fill({ views: 1000, reactions: 50 });
      const nineResult = checkUniformReactionRatio({ posts: ninePosts });
      expect(nineResult.flag).toBe(false);
      expect(nineResult.cv).toBe(0);
      expect(nineResult.reason).toContain('Недостаточно данных');
    });

    it('returns flag false for heterogeneous (normal) ERR series where CV >= 0.1', () => {
      // 15 posts with organic, variable ERR: [3.2, 5.8, 2.1, 7.4, 4.5, 8.0, 3.1, 6.2, 4.8, 5.0, 2.9, 7.1, 3.8, 6.5, 4.2]
      const heterogeneousErrs = [3.2, 5.8, 2.1, 7.4, 4.5, 8.0, 3.1, 6.2, 4.8, 5.0, 2.9, 7.1, 3.8, 6.5, 4.2];
      const posts = heterogeneousErrs.map((err) => ({
        views: 1000,
        reactions: Math.round(err * 10),
      }));

      const result = checkUniformReactionRatio({ posts });
      expect(result.flag).toBe(false);
      expect(result.cv).toBeGreaterThanOrEqual(0.1);
      expect(result.reason).toContain('пределах нормы');
    });

    it('returns flag true for nearly identical (flagged bot reactions) series where CV < 0.1', () => {
      // 15 posts with nearly identical ERR (< 10% deviation, e.g. ~5.0% ERR with slight noise)
      const nearlyIdenticalErrs = [5.0, 5.02, 4.98, 5.01, 4.99, 5.03, 4.97, 5.0, 5.01, 4.99, 5.02, 4.98, 5.0, 5.01, 4.99];
      const posts = nearlyIdenticalErrs.map((err, i) => ({
        id: i + 1,
        views: 10000,
        reactions: Math.round(err * 100),
      }));

      const result = checkUniformReactionRatio({ posts });
      expect(result.flag).toBe(true);
      expect(result.cv).toBeLessThan(0.1);
      expect(result.cv).toBeGreaterThanOrEqual(0);
      expect(result.reason).toContain('Аномально равномерный ERR');
      expect(result.signal).toBeDefined();
      expect(result.signal?.signalType).toBe('uniform_err');
      expect(result.signal?.value).toBeCloseTo(result.cv, 3);
    });

    it('returns flag true for strictly identical ERR series (CV = 0)', () => {
      const identicalPosts = Array(15).fill(null).map((_, i) => ({
        id: i + 1,
        views: 2000,
        reactions: 100, // exact 5.0%
      }));

      const result = checkUniformReactionRatio(identicalPosts);
      expect(result.flag).toBe(true);
      expect(result.cv).toBe(0);
      expect(result.reason).toContain('Аномально равномерный ERR');
    });

    it('handles boundary condition of exactly 10 posts', () => {
      // Exactly 10 posts with nearly identical ERR -> flag: true
      const tenIdentical = Array(10).fill({ views: 1000, reactions: 60 });
      const flaggedResult = checkUniformReactionRatio(tenIdentical);
      expect(flaggedResult.flag).toBe(true);
      expect(flaggedResult.postsCount).toBe(10);

      // Exactly 10 posts with heterogeneous ERR -> flag: false
      const tenVaried = [2.0, 8.0, 3.0, 9.0, 4.0, 7.0, 2.5, 8.5, 3.5, 6.5].map((err) => ({
        views: 1000,
        reactions: Math.round(err * 10),
      }));
      const normalResult = checkUniformReactionRatio(tenVaried);
      expect(normalResult.flag).toBe(false);
      expect(normalResult.cv).toBeGreaterThanOrEqual(0.1);
      expect(normalResult.postsCount).toBe(10);
    });

    it('supports direct array of numbers as synthetic ERR series', () => {
      const syntheticSeries = [4.0, 4.01, 3.99, 4.0, 4.02, 3.98, 4.0, 4.01, 3.99, 4.0, 4.01, 3.99];
      const result = checkUniformReactionRatio(syntheticSeries);
      expect(result.flag).toBe(true);
      expect(result.cv).toBeLessThan(0.1);
    });

    it('handles posts with comments and forwards included in ERR', () => {
      const postsWithFullEngagement = Array(15).fill(null).map(() => ({
        views: 1000,
        reactions: 40,
        comments: 5,
        forwards: 5, // total 50 / 1000 = 5%
      }));

      const result = checkUniformReactionRatio(postsWithFullEngagement);
      expect(result.flag).toBe(true);
      expect(result.cv).toBe(0);
    });

    it('handles channel objects with recentPosts property', () => {
      const channel = {
        id: 42,
        recentPosts: Array(12).fill({ views: 500, reactions: 25 }),
      };

      const result = checkUniformReactionRatio(channel);
      expect(result.flag).toBe(true);
      expect(result.signal?.channelId).toBe(42);
    });

    it('filters out invalid posts without views or non-positive views', () => {
      // 8 valid posts and 5 invalid posts (total 13, but only 8 valid -> <10 valid)
      const mixedPosts = [
        ...Array(8).fill({ views: 1000, reactions: 50 }),
        { views: 0, reactions: 50 },
        { views: null, reactions: 50 },
        { views: -100, reactions: 50 },
        null,
        undefined,
      ];

      const result = checkUniformReactionRatio(mixedPosts);
      expect(result.flag).toBe(false);
      expect(result.reason).toContain('Недостаточно данных');
    });

    it('returns flag false when all posts have 0 engagement (avg ERR = 0)', () => {
      const zeroEngagement = Array(15).fill({ views: 1000, reactions: 0, comments: 0, forwards: 0 });
      const result = checkUniformReactionRatio(zeroEngagement);
      expect(result.flag).toBe(false);
      expect(result.cv).toBe(0);
      expect(result.reason).toContain('Нулевой или отрицательный');
    });

    it('handles null, undefined, or empty channel object gracefully', () => {
      expect(checkUniformReactionRatio(null).flag).toBe(false);
      expect(checkUniformReactionRatio(undefined).flag).toBe(false);
      expect(checkUniformReactionRatio({}).flag).toBe(false);
      expect(checkUniformReactionRatio({ posts: [] }).flag).toBe(false);
    });

    it('respects publishedAt dates to select the most recent 15-20 posts', () => {
      const now = new Date();
      // 25 posts: oldest 10 have varied ERR, newest 15 have identical ERR
      const posts = Array(25).fill(null).map((_, i) => ({
        publishedAt: new Date(now.getTime() - (25 - i) * 3600000), // oldest i=0, newest i=24
        views: 1000,
        reactions: i >= 10 ? 50 : 20 + i * 15, // newest 15 are identical 50
      }));

      const result = checkUniformReactionRatio(posts);
      // Newest 20 posts: 5 varied (i=10 to 14: reactions=50, wait i>=10 all have reactions 50!)
      // i=0..9 have 20+i*15. i=10..24 have 50 (15 posts).
      // Taking 20 newest: i=5..24 (5 varied, 15 identical) -> CV will be calculated on those 20
      expect(result.postsCount).toBe(20);
    });
  });

  describe('runFraudAudit', () => {
    it('returns fraudScore 0 when no checks trigger (simulated combinations)', () => {
      const channel = {
        viewsToSubsRatio: false,
        growthSmoothness: false,
        uncorrelatedSpikes: false,
        uniformReactionRatio: false,
      };

      const result = runFraudAudit(channel);
      expect(result.fraudScore).toBe(0);
      expect(result.signals).toHaveLength(0);
      expect(result.details.viewsToSubsRatio.flag).toBe(false);
      expect(result.details.growthSmoothness.flag).toBe(false);
      expect(result.details.uncorrelatedSpikes.flag).toBe(false);
      expect(result.details.uniformReactionRatio.flag).toBe(false);
    });

    it('returns fraudScore 25 when 1 check triggers (simulated combinations)', () => {
      // Test 1: Only viewsToSubsRatio
      const res1 = runFraudAudit({ viewsToSubsRatio: true });
      expect(res1.fraudScore).toBe(25);
      expect(res1.signals).toHaveLength(1);
      expect(res1.signals[0].signalType).toBe('views_to_subs_ratio');

      // Test 2: Only growthSmoothness
      const res2 = runFraudAudit({ growthSmoothness: true });
      expect(res2.fraudScore).toBe(25);
      expect(res2.signals).toHaveLength(1);
      expect(res2.signals[0].signalType).toBe('growth_smoothness');

      // Test 3: Only uncorrelatedSpikes
      const res3 = runFraudAudit({ uncorrelatedSpikes: true });
      expect(res3.fraudScore).toBe(25);
      expect(res3.signals).toHaveLength(1);
      expect(res3.signals[0].signalType).toBe('uncorrelated_spikes');

      // Test 4: Only uniformReactionRatio
      const res4 = runFraudAudit({ uniformReactionRatio: true });
      expect(res4.fraudScore).toBe(25);
      expect(res4.signals).toHaveLength(1);
      expect(res4.signals[0].signalType).toBe('uniform_err');
    });

    it('returns fraudScore 50 when 2 checks trigger (simulated combinations)', () => {
      // viewsToSubsRatio + uniformReactionRatio
      const res = runFraudAudit({
        viewsToSubsRatio: true,
        uniformErr: true,
      });

      expect(res.fraudScore).toBe(50);
      expect(res.signals).toHaveLength(2);
      const signalTypes = res.signals.map(s => s.signalType);
      expect(signalTypes).toContain('views_to_subs_ratio');
      expect(signalTypes).toContain('uniform_err');
    });

    it('returns fraudScore 75 when 3 checks trigger (simulated combinations)', () => {
      // viewsToSubsRatio + growthSmoothness + uncorrelatedSpikes
      const res = runFraudAudit({
        viewsToSubsRatio: true,
        growthSmoothness: true,
        uncorrelatedSpikes: true,
        uniformReactionRatio: false,
      });

      expect(res.fraudScore).toBe(75);
      expect(res.signals).toHaveLength(3);
      const signalTypes = res.signals.map(s => s.signalType);
      expect(signalTypes).toContain('views_to_subs_ratio');
      expect(signalTypes).toContain('growth_smoothness');
      expect(signalTypes).toContain('uncorrelated_spikes');
      expect(signalTypes).not.toContain('uniform_err');
    });

    it('returns fraudScore 100 when all 4 checks trigger (simulated combinations)', () => {
      const res = runFraudAudit({
        viewsToSubsRatio: true,
        growthSmoothness: true,
        uncorrelatedSpikes: true,
        uniformReactionRatio: true,
      });

      expect(res.fraudScore).toBe(100);
      expect(res.signals).toHaveLength(4);
      const signalTypes = res.signals.map(s => s.signalType);
      expect(signalTypes).toEqual(
        expect.arrayContaining([
          'views_to_subs_ratio',
          'growth_smoothness',
          'uncorrelated_spikes',
          'uniform_err',
        ])
      );
      for (const sig of res.signals) {
        expect(sig.signalType).toBeDefined();
        expect(typeof sig.value).toBe('number');
        expect(sig.reason).toBeTruthy();
      }
    });

    it('supports triggers array notation for simulated combinations', () => {
      // 0 triggers
      expect(runFraudAudit({ triggers: [] }).fraudScore).toBe(0);

      // 1 trigger
      expect(runFraudAudit({ triggers: ['views_to_subs_ratio'] }).fraudScore).toBe(25);

      // 2 triggers
      expect(runFraudAudit({ triggers: ['growth_smoothness', 'uniform_err'] }).fraudScore).toBe(50);

      // 3 triggers
      expect(runFraudAudit({ triggers: ['views_to_subs_ratio', 'growth_smoothness', 'uncorrelated_spikes'] }).fraudScore).toBe(75);

      // 4 triggers
      expect(runFraudAudit({ triggers: ['views_to_subs_ratio', 'growth_smoothness', 'uncorrelated_spikes', 'uniform_err'] }).fraudScore).toBe(100);
    });

    it('executes full audit on realistic synthetic channel data', () => {
      const today = new Date('2026-09-01T12:00:00Z');

      // 1) 15 posts with identical reactions (triggers uniformReactionRatio)
      //    and avg views = 200 on 10,000 members (2% ratio -> triggers viewsToSubsRatio)
      const posts = Array(15).fill(null).map((_, i) => ({
        id: i + 1,
        publishedAt: new Date(today.getTime() - i * 86400000),
        views: 200,
        reactions: 10, // 5% ERR for every post
      }));

      // 2) 15 days of metrics with natural organic growth (does NOT trigger growthSmoothness)
      const followers = [1000, 1020, 1015, 1050, 1060, 1070, 1065, 1090, 1120, 1110, 1140, 1160, 1150, 1200, 1220];
      const metrics = followers.map((f, i) => ({
        date: new Date(today.getTime() + i * 86400000),
        followers: f,
      }));

      const channel = {
        id: 99,
        currentMembers: 10000,
        posts,
        metrics,
        mentions: [],
      };

      const audit = runFraudAudit(channel);
      // viewsToSubsRatio: 200 avg views / 10000 members = 2% < 5% -> FLAGGED
      // uniformReactionRatio: 15 identical posts (5% ERR) -> FLAGGED
      // growthSmoothness: organic followers -> NOT flagged
      // uncorrelatedSpikes: no massive spikes -> NOT flagged
      expect(audit.fraudScore).toBe(50);
      expect(audit.signals).toHaveLength(2);
      const signalTypes = audit.signals.map(s => s.signalType);
      expect(signalTypes).toContain('views_to_subs_ratio');
      expect(signalTypes).toContain('uniform_err');
    });

    it('handles null, undefined, or empty channel object gracefully', () => {
      expect(runFraudAudit(null).fraudScore).toBe(0);
      expect(runFraudAudit(undefined).fraudScore).toBe(0);
      expect(runFraudAudit({}).fraudScore).toBe(0);
      expect(runFraudAudit(null).signals).toEqual([]);
    });

    it('handles direct result objects with { flag: boolean } for checks', () => {
      const audit1 = runFraudAudit({
        viewsToSubsRatio: { flag: true, ratio: 0.01, reason: 'Low views' },
      });
      expect(audit1.fraudScore).toBe(25);
      expect(audit1.signals[0].signalType).toBe('views_to_subs_ratio');

      const audit2 = runFraudAudit({
        growthSmoothness: { flag: true, cv: 0.05, reason: 'Too smooth' },
        uniformReactionRatio: { flag: true, cv: 0.02, reason: 'Identical reactions' },
      });
      expect(audit2.fraudScore).toBe(50);
      expect(audit2.signals).toHaveLength(2);

      const audit3 = runFraudAudit({
        uncorrelatedSpikes: { flag: true, spikesCount: 3, dates: ['2026-09-01'], reason: 'Uncorrelated' },
      });
      expect(audit3.fraudScore).toBe(25);
      expect(audit3.signals[0].signalType).toBe('uncorrelated_spikes');
    });

    it('incorporates existing fraudSignals from database records', () => {
      const channel = {
        id: 77,
        fraudSignals: [
          { signalType: 'uniform_err', value: 0.03, reason: 'Template bot reactions detected by worker' },
          { signalType: 'views_to_subs_ratio', value: 0.01, reason: 'Views ratio too low' },
        ],
      };

      const audit = runFraudAudit(channel);
      expect(audit.fraudScore).toBe(50);
      expect(audit.signals).toHaveLength(2);
      expect(audit.signals.map(s => s.signalType)).toEqual(
        expect.arrayContaining(['uniform_err', 'views_to_subs_ratio'])
      );
    });

    it('handles channel.membersCount in place of currentMembers', () => {
      const posts = Array(15).fill({ views: 50, reactions: 2 }); // avg views 50 / 10000 = 0.5% < 5% -> flagged
      const audit = runFraudAudit({
        membersCount: 10000,
        posts,
      });
      expect(audit.details.viewsToSubsRatio.flag).toBe(true);
      expect(audit.fraudScore).toBeGreaterThanOrEqual(25);
    });
  });

  describe('checkUniformReactionRatio edge cases & robustness', () => {
    it('does not crash when post array contains null or undefined elements with dates', () => {
      const now = new Date();
      const mixed = [
        ...Array(12).fill(null).map((_, i) => ({
          publishedAt: new Date(now.getTime() - i * 3600000),
          views: 1000,
          reactions: 50,
        })),
        null,
        undefined,
        { publishedAt: null, views: 0 },
      ];

      expect(() => checkUniformReactionRatio(mixed)).not.toThrow();
      const result = checkUniformReactionRatio(mixed);
      expect(result.flag).toBe(true);
      expect(result.cv).toBe(0);
    });

    it('sanitizes negative engagement numbers and negative ERR values', () => {
      const posts = Array(15).fill(null).map((_, i) => ({
        views: 1000,
        reactions: i === 0 ? -10 : 50,
        comments: -5,
        forwards: -2,
      }));

      const result = checkUniformReactionRatio(posts);
      expect(result.flag).toBeDefined();
      expect(result.cv).toBeGreaterThanOrEqual(0);
      expect(isNaN(result.cv)).toBe(false);
    });

    it('populates channelId when channelId property is passed', () => {
      const posts = Array(12).fill({ views: 500, reactions: 25 });
      const result = checkUniformReactionRatio({ channelId: 888, posts });
      expect(result.flag).toBe(true);
      expect(result.signal?.channelId).toBe(888);
    });

    it('safely handles posts with invalid date strings without crashing or scrambling', () => {
      const posts = [
        ...Array(12).fill(null).map((_, i) => ({
          publishedAt: i % 2 === 0 ? 'invalid-date-format' : new Date(Date.now() - i * 10000),
          views: 1000,
          reactions: 50,
        })),
      ];

      expect(() => checkUniformReactionRatio(posts)).not.toThrow();
      const result = checkUniformReactionRatio(posts);
      expect(result.flag).toBe(true);
      expect(result.cv).toBe(0);
    });

    it('supports string numeric values and BigInt in posts and synthetic series', () => {
      // 1) Synthetic string series
      const stringSeries = Array(15).fill('5.0');
      const resString = checkUniformReactionRatio(stringSeries);
      expect(resString.flag).toBe(true);
      expect(resString.cv).toBe(0);

      // 2) BigInt & numeric string views/reactions
      const posts = Array(15).fill(null).map((_, i) => ({
        id: i + 1,
        views: '2000',
        reactions: 100n, // 5%
      }));

      const resPosts = checkUniformReactionRatio(posts);
      expect(resPosts.flag).toBe(true);
      expect(resPosts.cv).toBe(0);
    });

    it('evaluates extreme views edge cases correctly (1 view with 1 reaction)', () => {
      // Case A: 1 view with 1 reaction (ERR = 100%) mixed with 14 posts with 1000 views / 50 reactions (ERR = 5%)
      // This is heterogeneous, natural variance -> CV should be high (not flagged)
      const mixedExtremePosts = [
        { views: 1, reactions: 1 },
        ...Array(14).fill({ views: 1000, reactions: 50 }),
      ];
      const resMixed = checkUniformReactionRatio(mixedExtremePosts);
      expect(resMixed.flag).toBe(false);
      expect(resMixed.cv).toBeGreaterThanOrEqual(0.1);

      // Case B: 15 posts that ALL have 1 view with 1 reaction (template bot reaction setup) -> ERR = 100% on all posts
      const uniformExtremePosts = Array(15).fill({ views: 1, reactions: 1 });
      const resUniform = checkUniformReactionRatio(uniformExtremePosts);
      expect(resUniform.flag).toBe(true);
      expect(resUniform.cv).toBe(0);
    });

    it('propagates channelId properly in runFraudAudit when channelId property is passed', () => {
      const res = runFraudAudit({
        channelId: 999,
        viewsToSubsRatio: true,
        growthSmoothness: true,
        uncorrelatedSpikes: true,
        uniformReactionRatio: true,
      });

      expect(res.fraudScore).toBe(100);
      expect(res.signals).toHaveLength(4);
      for (const sig of res.signals) {
        expect(sig.channelId).toBe(999);
      }
    });

    it('supports uniform_reaction_ratio and uniformReactionRatio DB signalType in runFraudAudit', () => {
      const res1 = runFraudAudit({
        fraudSignals: [{ signalType: 'uniform_reaction_ratio', value: 0.04, reason: 'Bot template' }],
      });
      expect(res1.fraudScore).toBe(25);
      expect(res1.details.uniformReactionRatio.flag).toBe(true);

      const res2 = runFraudAudit({
        fraudSignals: [{ signalType: 'uniformReactionRatio', value: 0.03, reason: 'Bot template 2' }],
      });
      expect(res2.fraudScore).toBe(25);
      expect(res2.details.uniformReactionRatio.flag).toBe(true);
    });

    it('handles null and undefined metrics elements in runFraudAudit safely', () => {
      const metrics = [
        null,
        undefined,
        ...Array(15).fill(null).map((_, i) => ({
          date: new Date(2026, 8, i + 1),
          followers: 1000 + i * 10,
        })),
      ];

      expect(() => runFraudAudit({ metrics })).not.toThrow();
      const res = runFraudAudit({ metrics });
      expect(res.details.growthSmoothness.flag).toBe(true);
    });

    it('supports snake_case boolean properties directly in runFraudAudit', () => {
      const res = runFraudAudit({
        views_to_subs_ratio: true,
        growth_smoothness: true,
        uncorrelated_spikes: true,
        uniform_err: true,
      });
      expect(res.fraudScore).toBe(100);
      expect(res.signals).toHaveLength(4);
      expect(res.signals.map(s => s.signalType)).toEqual(
        expect.arrayContaining(['views_to_subs_ratio', 'growth_smoothness', 'uncorrelated_spikes', 'uniform_err'])
      );

      const resAlias = runFraudAudit({ uniform_reaction_ratio: true });
      expect(resAlias.fraudScore).toBe(25);
      expect(resAlias.details.uniformReactionRatio.flag).toBe(true);
    });

    it('supports snake_case properties inside simulatedFlags', () => {
      const res = runFraudAudit({
        simulatedFlags: {
          views_to_subs_ratio: true,
          uniform_err: true,
        },
      });
      expect(res.fraudScore).toBe(50);
      expect(res.signals).toHaveLength(2);
    });

    it('supports camelCase signalType in database fraudSignals array', () => {
      const audit = runFraudAudit({
        fraudSignals: [
          { signalType: 'viewsToSubsRatio', value: 0.02 },
          { signalType: 'growthSmoothness', value: 0.01 },
          { signalType: 'uncorrelatedSpikes', value: 2 },
          { signalType: 'uniformErr', value: 0.03 },
        ],
      });
      expect(audit.fraudScore).toBe(100);
      expect(audit.signals).toHaveLength(4);
    });

    it('supports triggers passed as a Set', () => {
      const triggersSet = new Set(['uniform_err', 'growth_smoothness']);
      const res = runFraudAudit({ triggers: triggersSet });
      expect(res.fraudScore).toBe(50);
      expect(res.signals).toHaveLength(2);
    });

    it('supports string numeric and BigInt in post.err / post.ERR / post.errRate', () => {
      const postsWithStrErr = Array(15).fill({ err: '5.0' });
      const resStr = checkUniformReactionRatio({ posts: postsWithStrErr });
      expect(resStr.flag).toBe(true);
      expect(resStr.cv).toBe(0);

      const postsWithBigIntErr = Array(15).fill({ ERR: 5n });
      const resBigInt = checkUniformReactionRatio({ posts: postsWithBigIntErr });
      expect(resBigInt.flag).toBe(true);
      expect(resBigInt.cv).toBe(0);

      const postsWithErrRateStr = Array(15).fill({ errRate: '5%' });
      const resErrRate = checkUniformReactionRatio({ posts: postsWithErrRateStr });
      expect(resErrRate.flag).toBe(true);
      expect(resErrRate.cv).toBe(0);
    });

    it('supports passing posts array directly to runFraudAudit', () => {
      const syntheticErrs = Array(15).fill(null).map(() => ({ views: 1000, reactions: 50 }));
      const res = runFraudAudit(syntheticErrs);
      expect(res.fraudScore).toBe(25);
      expect(res.details.uniformReactionRatio.flag).toBe(true);
    });
  });
});



