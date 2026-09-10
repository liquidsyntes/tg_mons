import { describe, it, expect } from 'vitest';
import { calculateDelta, calculateDeltaFromData } from '../calculate';

describe('calculateDelta', () => {
  const now = new Date('2023-10-15T12:00:00Z');

  it('returns exact coverage days when baseline matches boundary exactly', () => {
    const limit = new Date('2023-09-15T12:00:00Z'); // 30 days ago
    const data = [
      { date: '2023-10-15T12:00:00Z', followers: 1100 },
      { date: '2023-09-15T12:00:00Z', followers: 1000 },
      { date: '2023-09-01T12:00:00Z', followers: 900 },
    ];
    
    const result = calculateDelta(data, limit, 1100, now);
    expect(result).toEqual({ abs: 100, percent: 10, coverageDays: 30 });
  });

  it('returns partial coverage days when baseline is inside the window', () => {
    const limit = new Date('2023-09-15T12:00:00Z'); // 30 days ago
    const data = [
      { date: '2023-10-15T12:00:00Z', followers: 1100 },
      { date: '2023-10-10T12:00:00Z', followers: 1000 },
    ];
    
    const result = calculateDelta(data, limit, 1100, now);
    expect(result).toEqual({ abs: 100, percent: 10, coverageDays: 5 });
  });

  it('returns null coverage days when there is no data', () => {
    const limit = new Date('2023-09-15T12:00:00Z');
    const result = calculateDelta([], limit, 1100, now);
    expect(result).toEqual({ abs: null, percent: null, coverageDays: null });
  });
});

describe('calculateDeltaFromData', () => {
  const now = new Date('2023-10-15T12:00:00Z');

  it('returns exact coverage days when baseline matches boundary exactly', () => {
    const limit = new Date('2023-10-08T12:00:00Z'); // 7 days ago
    const data = [
      { collectedAt: new Date('2023-10-15T12:00:00Z'), membersCount: 1100 },
      { collectedAt: new Date('2023-10-08T12:00:00Z'), membersCount: 1000 },
      { collectedAt: new Date('2023-10-01T12:00:00Z'), membersCount: 900 },
    ];
    
    const result = calculateDeltaFromData(data, limit, 1100, now);
    expect(result).toEqual({ abs: 100, percent: 10, coverageDays: 7 });
  });

  it('returns partial coverage days when baseline is inside the window', () => {
    const limit = new Date('2023-10-08T12:00:00Z'); // 7 days ago
    const data = [
      { collectedAt: new Date('2023-10-15T12:00:00Z'), membersCount: 1100 },
      { collectedAt: new Date('2023-10-12T12:00:00Z'), membersCount: 1000 },
    ];
    
    const result = calculateDeltaFromData(data, limit, 1100, now);
    expect(result).toEqual({ abs: 100, percent: 10, coverageDays: 3 });
  });

  it('returns null coverage days when there is no data', () => {
    const limit = new Date('2023-10-08T12:00:00Z');
    const result = calculateDeltaFromData([], limit, 1100, now);
    expect(result).toEqual({ abs: null, percent: null, coverageDays: null });
  });
});
