import { describe, expect, it } from 'vitest';
import { channel } from './fixtures/channel-metrics';
import { serializeChannelsCsv, serializeChannelsJson, serializeCsv } from '../exportData';

describe('exportData', () => {
  it('uses UTF-8 BOM, CRLF rows and RFC 4180 escaping', () => {
    const csv = serializeCsv([{ key: 'text', label: 'Текст' }], [{ text: 'Строка "1",\nстрока 2' }]);
    expect(csv).toBe('\uFEFFТекст\r\n"Строка ""1"",\nстрока 2"');
  });

  it.each(['=', '+', '-', '@'])('neutralizes %s at the start of text fields', prefix => {
    const csv = serializeCsv([{ key: 'text', label: 'Текст' }], [{ text: `${prefix}SUM(1,2)` }]);
    expect(csv).toContain(`'${prefix}SUM(1,2)`);
  });

  it('protects formulas after leading whitespace and leaves negative numbers numeric', () => {
    const csv = serializeCsv(
      [{ key: 'text', label: 'Текст' }, { key: 'value', label: 'Число' }],
      [{ text: '  =1+1', value: -12 }],
    );
    expect(csv).toContain("'  =1+1,-12");
  });

  it('exports the same channel fields to CSV and JSON', () => {
    const input = [{ ...channel, title: 'Канал, "А"', niche: 'Музыка' }];
    const csv = serializeChannelsCsv(input);
    const json = JSON.parse(serializeChannelsJson(input));
    expect(csv.startsWith('\uFEFFНазвание,Username,Ссылка')).toBe(true);
    expect(csv).toContain('"Канал, ""А"""');
    expect(json[0]).toMatchObject({ title: 'Канал, "А"', members: 1000, posts7d: 7 });
  });
});
