import { describe, expect, it } from 'vitest';
import {
  aiAudienceToMarkdown,
  aiCompareDataToMarkdown,
  aiDataToMarkdown,
} from '../ai-markdown';

describe('ai-markdown converters', () => {
  it('returns empty string for null input', () => {
    expect(aiDataToMarkdown(null)).toBe('');
    expect(aiCompareDataToMarkdown(null, 'Mine', 'Target')).toBe('');
    expect(aiAudienceToMarkdown(null)).toBe('');
  });

  it('formats AISummaryData to Markdown', () => {
    const md = aiDataToMarkdown({
      stats: [{ value: '75%', label: 'Экспертный контент' }],
      themes: {
        bars: [{ label: 'AI', percent: 80 }],
        quote: 'Пример цитаты',
        descriptions: [{ title: 'Технологии', text: 'Разбор релизов' }],
      },
      tone: [{ kicker: 'Стиль', title: 'Аналитический', text: 'Лаконичный' }],
      engagement: {
        interactivity: { value: '10%', text: 'Редкие опросы' },
        cta: { value: '40%', text: 'Вопросы в конце' },
        recommendation: 'Добавить открытые вопросы',
      },
      promo: { text1: 'Низкая доля рекламы', text2: 'Нативные интеграции' },
      strengths: [{ num: '01', title: 'Глубина', text: 'Детальный разбор', quote: 'Цитата' }],
      weaknesses: [{ weakness: 'Мало опросов', problem: 'Низкий ER', recommendation: 'Опросы раз в неделю' }],
      conclusion: { main: 'Сильный канал', priority: 'Вовлечение' },
    });

    expect(md).toContain('# Контент-анализ канала');
    expect(md).toContain('- **75%**: Экспертный контент');
    expect(md).toContain('- **AI**: 80%');
    expect(md).toContain('| **Мало опросов** | Низкий ER | Опросы раз в неделю |');
  });

  it('formats AICompareData and AIAudienceData to Markdown', () => {
    const compareMd = aiCompareDataToMarkdown(
      {
        limitations: 'Мало постов',
        comparisonTable: [{ parameter: 'Темы', myChannel: 'Dev', competitor: 'News' }],
        strategy: { text: 'Разные акценты', myQuote: 'Код', competitorQuote: 'Сводка' },
        tone: { text: 'Оба деловые', winner: 'Конкурент' },
        competitorAdvantages: [{ title: 'Регулярность', description: '5 постов в день', isTransferable: 'Да' }],
        myStrengths: [{ title: 'Экспертиза', description: 'Глубокие статьи' }],
        recommendations: [{ recommendation: 'Чаще постить', effect: '+20% охвата', difficulty: 'Средняя' }],
        conclusion: { summary: 'Небольшой разрыв', priority: 'Частота' },
      },
      'Мой Канал',
      'Конкурент Канал'
    );

    expect(compareMd).toContain('**Мой канал:** Мой Канал');
    expect(compareMd).toContain('> **Ограничения:** Мало постов');
    expect(compareMd).toContain('| **Темы** | Dev | News |');

    const audienceMd = aiAudienceToMarkdown({
      demographics: { age: '25-34', gender: 'М', income: 'Выше среднего', geo: 'РФ' },
      psychographics: { interests: ['IT'], values: ['Рост'], fears: ['Стагнация'] },
      behavior: { contentConsumption: 'Утром', engagementReason: 'Инсайды' },
      summary: 'Опытные разработчики',
    });

    expect(audienceMd).toContain('**Резюме:** Опытные разработчики');
    expect(audienceMd).toContain('- **Возраст:** 25-34');
    expect(audienceMd).toContain('- IT');
  });
});
