import { describe, expect, it } from 'vitest';
import { calculateViralBaseline, classifyViralPost } from '../viral';

const normalPosts = Array.from({ length: 5 }, () => ({
  views: 100, forwards: 2, reactions: 3, comments: 0,
}));

describe('viral post detection', () => {
  it('finds view and forward outliers against the channel median', () => {
    const baseline = calculateViralBaseline(normalPosts);
    expect(baseline).toEqual({ sampleSize: 5, medianViews: 100, medianForwards: 2, medianErr: 5 });
    expect(classifyViralPost({ views: 250, forwards: 12, reactions: 3, comments: 0 }, baseline)).toEqual({
      isViral: true, viralReasons: ['views', 'forwards'], viralPrimaryReason: 'forwards', viralMultiplier: 6,
    });
  });

  it('does not classify channels with fewer than five positive-view posts', () => {
    const baseline = calculateViralBaseline([...normalPosts.slice(0, 4), { views: 0, forwards: 99 }]);
    expect(baseline).toBeNull();
    expect(classifyViralPost({ views: 1000, forwards: 100 }, baseline)).toMatchObject({
      isViral: false, viralReasons: [], viralMultiplier: null,
    });
  });

  it('keeps missing counters separate from zero and avoids zero denominators', () => {
    const baseline = calculateViralBaseline(Array.from({ length: 5 }, () => ({
      views: 100, forwards: null, reactions: null, comments: null,
    })));
    expect(baseline).toMatchObject({ medianForwards: null, medianErr: null });
    expect(classifyViralPost({ views: null, forwards: 100, reactions: null }, baseline).isViral).toBe(false);
    expect(classifyViralPost({ views: 0, forwards: 0, reactions: 0 }, baseline).isViral).toBe(false);
    const zeroBaseline = calculateViralBaseline(Array.from({ length: 5 }, () => ({
      views: 100, forwards: 0, reactions: 0, comments: 0,
    })));
    expect(classifyViralPost({ views: 100, forwards: 10, reactions: 0 }, zeroBaseline).isViral).toBe(false);
  });

  it('applies thresholds inclusively and requires median reach for ERR', () => {
    const baseline = calculateViralBaseline(normalPosts);
    expect(classifyViralPost({ views: 199, forwards: 2, reactions: 3 }, baseline).isViral).toBe(false);
    expect(classifyViralPost({ views: 200, forwards: 2, reactions: 3 }, baseline).viralReasons).toContain('views');
    expect(classifyViralPost({ views: 100, forwards: 2, reactions: 8 }, baseline).viralReasons).toEqual(['err']);
    expect(classifyViralPost({ views: 99, forwards: 2, reactions: 8 }, baseline).viralReasons).toEqual([]);
  });
});
