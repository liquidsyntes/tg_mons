import { describe, expect, it } from 'vitest';
import { escapeHtml, renderAiReportErrorHtml, renderAiReportHtml } from '../ai-report-html';

function render(type: string, data: unknown, channelTitle = 'Канал') {
  return renderAiReportHtml({
    type,
    content: JSON.stringify(data),
    channelTitle,
    reportTitle: 'Отчёт',
    createdAt: new Date('2026-10-18T12:00:00.000Z'),
  });
}

describe('AI report HTML export', () => {
  it('escapes all HTML special characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes the channel name and nested summary content without escaping the template', () => {
    const html = render('summary', {
      stats: [{ value: '<img src=x onerror=alert(1)>', label: 'A & B' }],
      themes: { bars: [{ label: '<svg onload=alert(1)>', percent: 25 }], quote: '<script>alert(1)</script>' },
      tone: [{ kicker: '<b>Стиль</b>', title: 'Заголовок', text: '<i>Текст</i>' }],
      conclusion: { main: 'Итог', priority: 'Действие' },
    }, '<img src=x onerror=alert(2)>');

    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<div class="bg-[#0d1c2f]');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it.each([
    ['action_plan', { title: '<b>План</b>', steps: [{ title: 'Шаг', description: '<i>Описание</i>' }] }, '&lt;b&gt;План&lt;/b&gt;'],
    ['trend', { summary: 'Тренд', trends: [{ topic: 'Тема', channels: ['<img src=x>'] }] }, '&lt;img src=x&gt;'],
    ['evolution', { summary: 'Рост', metricsComparison: [{ metric: '<svg>', oldValue: 1, newValue: 2 }] }, '&lt;svg&gt;'],
    ['audience', { summary: 'Аудитория', psychographics: { interests: ['<b>Интерес</b>'] } }, '&lt;b&gt;Интерес&lt;/b&gt;'],
    ['persona', { summary: '<script>bad()</script>', psychologicalTraits: { strengths: ['Сила'] } }, '&lt;script&gt;bad()&lt;/script&gt;'],
    ['metrics_explainer', { overallVerdict: { headline: '<img src=x>' }, metricsBreakdown: [] }, '&lt;img src=x&gt;'],
    ['content-gap', { summary: 'Темы', missingTopics: [{ topic: 'Тема', competitorChannels: ['<b>Канал</b>'] }] }, '&lt;b&gt;Канал&lt;/b&gt;'],
    ['compare', { comparisonTable: [{ parameter: '<i>Параметр</i>', myChannel: 'Да' }] }, '&lt;i&gt;Параметр&lt;/i&gt;'],
  ] as const)('renders and escapes %s', (type, data, expected) => {
    const html = render(type, data);
    expect(html).toContain(expected);
    expect(html).toContain('Сгенерировано в TG Monitor');
  });

  it('keeps the existing comparison fallback for super reports', () => {
    expect(render('super_report', { comparisonTable: [{ parameter: 'Формат', myChannel: 'A' }] }))
      .toContain('Сравнение каналов');
  });

  it('keeps separate format and render error documents', () => {
    expect(renderAiReportErrorHtml('format')).toContain('Ошибка формата');
    expect(renderAiReportErrorHtml('render')).toContain('Ошибка генерации отчета');
    expect(() => renderAiReportHtml({
      type: 'summary', content: '{', channelTitle: 'Канал', reportTitle: 'Отчёт', createdAt: new Date(),
    })).toThrow(SyntaxError);
  });
});
