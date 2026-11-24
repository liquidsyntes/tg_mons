import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TTLCache } from '../cache';

describe('TTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects non-positive or non-integer maxEntries', () => {
    expect(() => new TTLCache(1000, 0)).toThrow(RangeError);
    expect(() => new TTLCache(1000, -5)).toThrow(RangeError);
    expect(() => new TTLCache(1000, 1.5)).toThrow(RangeError);
  });

  it('stores and expires entries by TTL', () => {
    const cache = new TTLCache<string>(1000, 10);
    cache.set('k1', 'v1');
    expect(cache.has('k1')).toBe(true);
    expect(cache.get('k1')).toBe('v1');
    expect(cache.size).toBe(1);

    vi.advanceTimersByTime(1001);
    expect(cache.has('k1')).toBe(false);
    expect(cache.get('k1')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry when maxEntries is reached', () => {
    const cache = new TTLCache<number>(10_000, 3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Touch 'a' so 'b' becomes the least recently used entry.
    expect(cache.get('a')).toBe(1);

    cache.set('d', 4);
    expect(cache.size).toBe(3);
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('updates an existing key without evicting other live entries', () => {
    const cache = new TTLCache<number>(1000, 2);
    cache.set('a', 1);
    cache.set('b', 2);

    vi.advanceTimersByTime(600);
    cache.set('a', 10);

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBe(2);

    // After another 600ms, 'b' expired (1200ms > 1000ms), while refreshed 'a' is still valid (600ms <= 1000ms).
    vi.advanceTimersByTime(600);
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).toBe(10);
  });

  it('prunes expired entries before evicting live ones on set and exposes pruneExpired', () => {
    const cache = new TTLCache<number>(1000, 2);
    cache.set('old', 1);
    vi.advanceTimersByTime(600);
    cache.set('fresh', 2);

    // 'old' expires after +500ms (total 1100ms), 'fresh' is only 500ms old.
    vi.advanceTimersByTime(500);
    cache.set('newest', 3);

    expect(cache.size).toBe(2);
    expect(cache.get('fresh')).toBe(2);
    expect(cache.get('newest')).toBe(3);

    vi.advanceTimersByTime(1100);
    expect(cache.pruneExpired()).toBe(2);
    expect(cache.size).toBe(0);
  });

  it('supports single-key and full invalidation', () => {
    const cache = new TTLCache<string>(10_000, 5);
    cache.set('x', '1');
    cache.set('y', '2');
    cache.invalidate('x');
    expect(cache.get('x')).toBeNull();
    expect(cache.get('y')).toBe('2');

    cache.invalidate();
    expect(cache.size).toBe(0);
    expect(cache.get('y')).toBeNull();
  });
});
