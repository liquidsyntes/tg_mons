import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercent, formatDelta, serializeBigInt, formatRelativeTime } from '@/lib/utils';

describe('formatNumber', () => {
  it('formats positive numbers with ru-RU locale', () => {
    expect(formatNumber(1234567)).toBe('1\u00A0234\u00A0567'); // ru-RU uses NBSP (U+00A0)
  });

  it('returns н/д for null', () => {
    expect(formatNumber(null)).toBe('н/д');
  });

  it('returns н/д for undefined', () => {
    expect(formatNumber(undefined)).toBe('н/д');
  });

  it('returns н/д for NaN', () => {
    expect(formatNumber(NaN)).toBe('н/д');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('formats positive with + sign', () => {
    expect(formatPercent(5.2)).toBe('+5.2%');
  });

  it('formats negative without + sign', () => {
    expect(formatPercent(-3.1)).toBe('-3.1%');
  });

  it('returns н/д for null', () => {
    expect(formatPercent(null)).toBe('н/д');
  });

  it('respects decimals parameter', () => {
    expect(formatPercent(12.3456, true, 2)).toBe('+12.35%');
  });

  it('hides sign when includeSign=false', () => {
    expect(formatPercent(5, false)).toBe('5.0%');
  });
});

describe('formatDelta', () => {
  it('returns pos direction for positive abs', () => {
    const result = formatDelta(100, 5.0);
    expect(result.direction).toBe('pos');
    expect(result.text).toContain('+');
  });

  it('returns neg direction for negative abs', () => {
    const result = formatDelta(-50, -2.5);
    expect(result.direction).toBe('neg');
    expect(result.text).toContain('-');
  });

  it('returns zero direction for zero abs', () => {
    const result = formatDelta(0, 0);
    expect(result.direction).toBe('zero');
  });

  it('returns na direction for null abs', () => {
    const result = formatDelta(null, null);
    expect(result.direction).toBe('na');
    expect(result.text).toBe('н/д');
  });
});

describe('serializeBigInt', () => {
  it('converts bigint to string', () => {
    const data = { id: BigInt(123), name: 'test' };
    const result = serializeBigInt(data);
    expect(result.id).toBe('123');
    expect(typeof result.id).toBe('string');
  });

  it('handles nested bigint in arrays', () => {
    const data = { items: [BigInt(1), BigInt(2)] };
    const result = serializeBigInt(data);
    expect(result.items).toEqual(['1', '2']);
  });

  it('preserves regular numbers', () => {
    const data = { count: 42, value: 3.14 };
    const result = serializeBigInt(data);
    expect(result.count).toBe(42);
    expect(result.value).toBe(3.14);
  });
});

describe('formatRelativeTime', () => {
  it('returns "Никогда" for null', () => {
    expect(formatRelativeTime(null)).toBe('Никогда');
  });

  it('returns "Никогда" for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('Никогда');
  });

  it('returns "только что" for very recent', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('только что');
  });

  it('returns minutes for recent past', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 мин назад');
  });

  it('returns hours for older', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('3 ч назад');
  });
});
