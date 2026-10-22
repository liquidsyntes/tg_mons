import { describe, expect, it } from 'vitest';
import { parseBreakdown, parseEnabledNotifications, parseLanguagesGraph, parseNotificationsPercent } from '../demographics';

const graph = { columns: [['x', 1, 2], ['y0', 10, 30], ['y1', 90, 70]], names: { y0: 'English', y1: 'Ukrainian' } };
describe('demographics parsing', () => {
  it('normalizes the latest common sample and sorts languages', () => {
    expect(parseLanguagesGraph(graph)).toEqual([
      { code: 'uk', name: 'Ukrainian', percent: 70 }, { code: 'en', name: 'English', percent: 30 },
    ]);
  });
  it.each([null, {}, { ...graph, names: null }, { ...graph, columns: [['x', 1, 2], ['y0', 1]] },
    { ...graph, columns: [['x', 2, 1], ['y0', 1, 2]] },
    { ...graph, columns: [['x', 1], ['y0', 0]] },
    { ...graph, columns: [['x', 1], ['y0', -1]] },
    { ...graph, columns: [['x', 1], ['y0', Infinity]] },
    { ...graph, columns: [['x', 1], ['y0', '20']] },
    { ...graph, columns: [['x', 1], ['y0', 20], ['y0', 20]] },
  ])('rejects malformed or empty graphs: %j', value => expect(parseLanguagesGraph(value)).toBeNull());
  it('preserves unknown language labels', () => {
    expect(parseLanguagesGraph({ columns: [['x', 1], ['y0', 7]], names: { y0: 'Unknown language' } }))
      .toEqual([{ code: 'y0', name: 'Unknown language', percent: 100 }]);
  });
  it('accepts rounded percentages', () => {
    expect(parseBreakdown(['a', 'b', 'c'].map(code => ({ code, name: code, percent: 33.3 })))).toHaveLength(3);
  });
  it.each([[], null, [{ code: 'en', name: 'English', percent: 101 }], [{ code: 'en', name: 'English', percent: NaN }],
    [{ code: 'en', name: 'English', percent: 0 }]])('rejects invalid stored breakdowns', value => expect(parseBreakdown(value)).toBeNull());

  it('validates and rounds stored notifications percent', () => {
    expect(parseNotificationsPercent(null)).toBeNull();
    expect(parseNotificationsPercent(undefined)).toBeNull();
    expect(parseNotificationsPercent(0)).toBe(0);
    expect(parseNotificationsPercent(18.54)).toBe(18.5);
    expect(parseNotificationsPercent(100)).toBe(100);
    expect(parseNotificationsPercent(-1)).toBeNull();
    expect(parseNotificationsPercent(101)).toBeNull();
    expect(parseNotificationsPercent(NaN)).toBeNull();
    expect(parseNotificationsPercent(Infinity)).toBeNull();
    expect(parseNotificationsPercent('20')).toBeNull();
  });

  it('calculates notifications enabled percentage from Telegram StatsPercentValue', () => {
    expect(parseEnabledNotifications({ part: 250, total: 1000 })).toBe(25);
    expect(parseEnabledNotifications({ part: 185, total: 1000 })).toBe(18.5);
    expect(parseEnabledNotifications({ part: 0, total: 500 })).toBe(0);
    expect(parseEnabledNotifications({ part: 500, total: 500 })).toBe(100);
    expect(parseEnabledNotifications(null)).toBeNull();
    expect(parseEnabledNotifications({})).toBeNull();
    expect(parseEnabledNotifications({ part: 10, total: 0 })).toBeNull();
    expect(parseEnabledNotifications({ part: -5, total: 100 })).toBeNull();
    expect(parseEnabledNotifications({ part: 150, total: 100 })).toBeNull();
    expect(parseEnabledNotifications({ part: NaN, total: 100 })).toBeNull();
  });
});
