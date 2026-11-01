import { describe, expect, it, vi } from 'vitest';
import { resolveFlagOverride, resolveGrowthSmoothnessCheck } from '../normalizers';

const keys = ['growthSmoothness', 'growth_smoothness'];

describe('resolveFlagOverride', () => {
  it('keeps explicit false ahead of simulated flags and triggers', () => {
    expect(resolveFlagOverride({
      growthSmoothness: false,
      simulatedFlags: { growthSmoothness: true },
      triggers: ['growth_smoothness'],
    }, keys)).toEqual({ flag: false });
  });

  it('preserves a direct result and its metric and reason', () => {
    const result = { flag: false, cv: 0.7, reason: 'Проверенная причина' };
    expect(resolveFlagOverride({ growthSmoothness: result, triggers: keys }, keys)).toBe(result);
  });

  it('uses the first defined alias, including null, rather than the first truthy alias', () => {
    expect(resolveFlagOverride({ growthSmoothness: undefined, growth_smoothness: false }, keys))
      .toEqual({ flag: false });
    expect(resolveFlagOverride({ growthSmoothness: null, growth_smoothness: true }, keys))
      .toBeUndefined();
  });

  it('lets a simulated false override a trigger when the direct value is invalid', () => {
    expect(resolveFlagOverride({
      growthSmoothness: { flag: 'true' },
      simulatedFlags: { growth_smoothness: false },
      triggers: keys,
    }, keys)).toEqual({ flag: false });
  });

  it('does not add support for result objects inside simulatedFlags', () => {
    expect(resolveFlagOverride({ simulatedFlags: { growthSmoothness: { flag: true } } }, keys))
      .toBeUndefined();
  });

  it.each([
    { triggers: ['growth_smoothness'] },
    { triggers: new Set(['growth_smoothness']) },
    { triggers: 'prefix:growth_smoothness:suffix' },
  ])('recognizes the existing trigger formats: %j', ({ triggers }) => {
    expect(resolveFlagOverride({ triggers }, keys)).toEqual({ flag: true });
  });

  it('returns no override for unrelated triggers and absent values', () => {
    expect(resolveFlagOverride({ triggers: ['uniform_err'] }, keys)).toBeUndefined();
    expect(resolveFlagOverride({}, keys)).toBeUndefined();
  });
});

describe('resolveGrowthSmoothnessCheck priorities', () => {
  const signal = { signalType: 'growth_smoothness', value: 0.03, reason: 'Сохранённая причина' };

  it('keeps a direct false ahead of a precomputed result and a stored signal', () => {
    const calculate = vi.fn();
    const result = resolveGrowthSmoothnessCheck({
      growthSmoothness: false,
      growthSmoothnessResult: { flag: true },
      fraudSignals: [signal],
    }, calculate);
    expect(result.flag).toBe(false);
    expect(result.cv).toBe(0.25);
    expect(calculate).not.toHaveBeenCalled();
  });

  it('keeps a precomputed false and its empty reason ahead of a stored signal', () => {
    const calculate = vi.fn();
    expect(resolveGrowthSmoothnessCheck({
      growthSmoothnessResult: { flag: false, reason: '' },
      fraudSignals: [signal],
    }, calculate)).toEqual({ flag: false, cv: 0, reason: '' });
    expect(calculate).not.toHaveBeenCalled();
  });

  it('skips inactive signals and uses the first matching active signal before calculation', () => {
    const calculate = vi.fn();
    expect(resolveGrowthSmoothnessCheck({ fraudSignals: [
      null,
      { ...signal, flag: false },
      { ...signal, signalType: 'uniform_err' },
      signal,
      { ...signal, value: 0.09 },
    ] }, calculate)).toEqual({ flag: true, cv: 0.03, reason: signal.reason });
    expect(calculate).not.toHaveBeenCalled();
  });

  it('calculates from normalized metrics when no source supplies a result', () => {
    const computed = { flag: false, cv: 0.6, reason: 'Рассчитанная причина' };
    const calculate = vi.fn().mockReturnValue(computed);
    const input = {
      fraudSignals: [{ ...signal, flag: false }],
      membersHistory: [null, { collectedAt: '2026-10-01', membersCount: 100 }],
    };
    expect(resolveGrowthSmoothnessCheck(input, calculate)).toBe(computed);
    expect(calculate).toHaveBeenCalledExactlyOnceWith([{ date: new Date('2026-10-01'), followers: 100 }]);
  });
});
