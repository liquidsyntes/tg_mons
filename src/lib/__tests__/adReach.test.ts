import { describe, expect, it } from 'vitest';
import {
  classifyAdRetentionFormat,
  isDeletedRetentionFormat,
  resolveLastCapturedViews,
  summarizeChannelAdRetention,
} from '../adReach';

const HOUR_MS = 60 * 60 * 1000;
const BASE_TIME = new Date('2026-11-10T00:00:00.000Z');

function hoursAfter(hours: number): Date {
  return new Date(BASE_TIME.getTime() + hours * HOUR_MS);
}

describe('classifyAdRetentionFormat', () => {
  it('classifies deletions before 20h as early_delete', () => {
    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: hoursAfter(6),
          deletedAfterHours: 12,
          viewSnapshots: [{ hoursAfterPost: 1, viewsCount: 450 }],
        },
        hoursAfter(12),
      ),
    ).toBe('early_delete');

    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: null,
          deletedAfterHours: 12,
        },
        hoursAfter(24),
      ),
    ).toBe('early_delete');
  });

  it('classifies deletions in 20h..36h window as 24h', () => {
    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: hoursAfter(25),
          deletedAfterHours: 24,
          viewSnapshots: [
            { hoursAfterPost: 1, viewsCount: 300 },
            { hoursAfterPost: 12, viewsCount: 1200 },
          ],
        },
        hoursAfter(48),
      ),
    ).toBe('24h');

    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: null,
          deletedAfterHours: 24,
        },
        hoursAfter(48),
      ),
    ).toBe('24h');
  });

  it('classifies deletions in 36h..60h window as 48h', () => {
    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: hoursAfter(48.25),
          deletedAfterHours: 48,
          viewSnapshots: [
            { hoursAfterPost: 12, viewsCount: 1100 },
            { hoursAfterPost: 24, viewsCount: 2100 },
          ],
        },
        hoursAfter(50),
      ),
    ).toBe('48h');

    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: null,
          deletedAfterHours: 48,
        },
        hoursAfter(50),
      ),
    ).toBe('48h');
  });

  it('classifies posts alive after 48h or deleted after 60h as retained', () => {
    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: null,
          viewSnapshots: [{ hoursAfterPost: 48, viewsCount: 3400 }],
        },
        hoursAfter(50),
      ),
    ).toBe('retained');

    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: hoursAfter(72),
          deletedAfterHours: 72,
        },
        hoursAfter(80),
      ),
    ).toBe('retained');
  });

  it('classifies non-deleted posts younger than 48h as active', () => {
    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: null,
          viewSnapshots: [{ hoursAfterPost: 1, viewsCount: 220 }],
        },
        hoursAfter(5),
      ),
    ).toBe('active');

    expect(
      classifyAdRetentionFormat(
        {
          publishedAt: BASE_TIME,
          deletedAt: null,
        },
        hoursAfter(20),
      ),
    ).toBe('active');
  });
});

describe('resolveLastCapturedViews and isDeletedRetentionFormat', () => {
  it('picks the highest recorded view count across post views and snapshots', () => {
    expect(
      resolveLastCapturedViews({
        views: 1500,
        viewSnapshots: [
          { hoursAfterPost: 1, viewsCount: 400 },
          { hoursAfterPost: 24, viewsCount: 2450 },
        ],
      }),
    ).toBe(2450);

    expect(
      resolveLastCapturedViews({
        views: null,
        viewSnapshots: [{ hoursAfterPost: 12, viewsCount: 980 }],
      }),
    ).toBe(980);

    expect(resolveLastCapturedViews({ views: null, viewSnapshots: [] })).toBeNull();
  });

  it('identifies deleted retention formats', () => {
    expect(isDeletedRetentionFormat('early_delete')).toBe(true);
    expect(isDeletedRetentionFormat('24h')).toBe(true);
    expect(isDeletedRetentionFormat('48h')).toBe(true);
    expect(isDeletedRetentionFormat('retained')).toBe(false);
    expect(isDeletedRetentionFormat('active')).toBe(false);
    expect(isDeletedRetentionFormat(undefined)).toBe(false);
  });
});

describe('summarizeChannelAdRetention', () => {
  it('computes format distribution and early deletion flag', () => {
    const now = hoursAfter(72);
    const summary = summarizeChannelAdRetention(
      [
        { publishedAt: BASE_TIME, deletedAt: hoursAfter(10), deletedAfterHours: 12 }, // early_delete
        { publishedAt: BASE_TIME, deletedAt: hoursAfter(25), deletedAfterHours: 24 }, // 24h
        { publishedAt: BASE_TIME, deletedAt: hoursAfter(26), deletedAfterHours: 24 }, // 24h
        { publishedAt: BASE_TIME, deletedAt: hoursAfter(49), deletedAfterHours: 48 }, // 48h
        { publishedAt: BASE_TIME, deletedAt: null }, // retained (72h)
        { publishedAt: hoursAfter(66), deletedAt: null }, // active (6h)
      ],
      now,
    );

    expect(summary).toMatchObject({
      totalAds: 6,
      evaluatedAds: 5,
      activeAds: 1,
      earlyDeleteCount: 1,
      format24hCount: 2,
      format48hCount: 1,
      retainedCount: 1,
      earlyDeletePercent: 20,
      format24hPercent: 40,
      format48hPercent: 20,
      retainedPercent: 20,
      hasEarlyDeletions: true,
    });
    expect(summary.buckets).toHaveLength(4);
  });

  it('handles empty and active-only ad lists safely without division by zero', () => {
    expect(summarizeChannelAdRetention([], BASE_TIME)).toMatchObject({
      totalAds: 0,
      evaluatedAds: 0,
      activeAds: 0,
      hasEarlyDeletions: false,
      format24hPercent: 0,
    });

    expect(
      summarizeChannelAdRetention(
        [{ publishedAt: BASE_TIME, deletedAt: null }],
        hoursAfter(4),
      ),
    ).toMatchObject({
      totalAds: 1,
      evaluatedAds: 0,
      activeAds: 1,
      hasEarlyDeletions: false,
      retainedPercent: 0,
    });
  });
});
