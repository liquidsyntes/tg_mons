import { describe, expect, it } from 'vitest';
import { parseBreakdown, parseLanguagesGraph } from '../demographics';

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
});
