import { describe, expect, it } from 'vitest';
import { GET } from '../route';

describe('GET /about', () => {
  it('serves landing HTML with responsive mobile guards at 375px', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');

    const html = await response.text();
    expect(html).toContain('shrink-0 whitespace-nowrap bg-surface-elevated px-3 py-1.5 rounded-lg text-primary');
    expect(html).toContain('w-2 h-2 shrink-0 rounded-full bg-metric-positive');
    expect(html).toContain('flex-wrap items-center justify-between gap-2');
    expect(html).toContain('sm:hidden mb-2 flex items-center justify-end gap-1');
    expect(html).toContain('Прокрутите таблицу по горизонтали ->');
  });
});
