/**
 * Simple in-memory TTL cache for metrics.
 * Invalidated when channels are modified or data is collected.
 */

export class TTLCache<T> {
  private cache: Map<string, { value: T; expiresAt: number }> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 300000) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
}

// Default cache: 5 minutes TTL
export const metricsCache = new TTLCache(300000);

// Best-time cache: 30 minutes TTL (heavy computation)
export const bestTimeCache = new TTLCache(1800000);
