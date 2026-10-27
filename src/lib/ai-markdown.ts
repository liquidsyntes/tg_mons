import type { AISummaryData } from '@/components/AISummaryReport';
import type { AICompareData } from '@/components/AICompareReport';
import type { AIAudienceData } from '@/components/AIAudienceReport';
import type { AIContentGapData } from '@/components/AIContentGapReport';
import type { AIMetricsExplainerData } from '@/components/AIMetricsExplainerReport';

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function aiDataToMarkdown(data: AISummaryData | null): string {
  if (!data) return '';
  return `
# Контент-анализ канала

## Ключевые показатели
${data.stats?.map((s) => `- **${s.value}**: ${s.label}`).join('\n')}

## 1. Основные темы
${data.themes?.bars?.map((b) => `- **${b.label}**: ${b.percent}%`).join('\n')}

> ${data.themes?.quote}

${data.themes?.descriptions?.map((d) => `**${d.title}**\n${d.text}`).join('\n\n')}

## 2. Тональность и подача
${data.tone?.map((t) => `### ${t.title} (${t.kicker})\n${t.text}`).join('\n\n')}

## 3. Вовлечение
- **Интерактивность**: ${data.engagement?.interactivity?.value} - ${data.engagement?.interactivity?.text}
- **CTA**: ${data.engagement?.cta?.value} - ${data.engagement?.cta?.text}

> **Рекомендация:** ${data.engagement?.recommendation}

## 4. Реклама и промо
${data.promo?.text1}

${data.promo?.text2}

## 5. Сильные стороны
${data.strengths?.map((s) => `### ${s.num}. ${s.title}\n${s.text}\n\n> ${s.quote}`).join('\n\n')}

## 6. Слабые места и рекомендации
| Слабое место | Почему это проблема | Конкретная рекомендация |
|---|---|---|
${data.weaknesses?.map((w) => `| **${w.weakness}** | ${w.problem} | ${w.recommendation} |`).join('\n')}

## 7. Краткий вывод
**${data.conclusion?.main}**

*Приоритет:* ${data.conclusion?.priority}
  `.trim();
}

export function aiCompareDataToMarkdown(
  data: AICompareData | null,
  myTitle: string,
  targetTitle: string
): string {
  if (!data) return '';
  return `
# Сравнительный анализ каналов
**Мой канал:** ${myTitle}
**Конкурент:** ${targetTitle}

${data.limitations ? `> **Ограничения:** ${data.limitations}\n` : ''}

## 1. Сводная таблица
| Параметр | Мой канал | Конкурент |
|---|---|---|
${data.comparisonTable?.map((c) => `| **${c.parameter}** | ${c.myChannel} | ${c.competitor} |`).join('\n')}

## 2. Различия стратегий
${data.strategy?.text}

> **Мой канал:** ${data.strategy?.myQuote}
> **Конкурент:** ${data.strategy?.competitorQuote}

## 3. Tone of Voice
${data.tone?.text}

**Кто звучит убедительнее:** ${data.tone?.winner}

## 4. Преимущества конкурента
${data.competitorAdvantages?.length ? data.competitorAdvantages.map((a) => `### ${a.title}\n${a.description}\n*(Переносимость: ${a.isTransferable})*`).join('\n\n') : '*Преимуществ не обнаружено.*'}

## 5. Наши сильные стороны
${data.myStrengths?.length ? data.myStrengths.map((s) => `### ${s.title}\n${s.description}`).join('\n\n') : '*Преимуществ не обнаружено.*'}

## 6. Точки роста (Приоритеты)
| Рекомендация | Ожидаемый эффект | Сложность |
|---|---|---|
${data.recommendations?.map((r) => `| **${r.recommendation}** | ${r.effect} | ${r.difficulty} |`).join('\n')}

## 7. Краткий вывод
${data.conclusion?.summary}

**Главный приоритет:** ${data.conclusion?.priority}
  `.trim();
}

export function aiAudienceToMarkdown(data: AIAudienceData | null): string {
  if (!data) return '';
  return `
# Анализ предполагаемой целевой аудитории

**Резюме:** ${data.summary}

## Демография
- **Возраст:** ${data.demographics?.age}
- **Пол:** ${data.demographics?.gender}
- **Доход:** ${data.demographics?.income}
- **География:** ${data.demographics?.geo}

## Поведенческие факторы
- **Потребление контента:** ${data.behavior?.contentConsumption}
- **Причина подписки:** ${data.behavior?.engagementReason}

## Психографика
**Интересы:**
${data.psychographics?.interests?.map((i) => `- ${i}`).join('\n')}

**Ценности:**
${data.psychographics?.values?.map((v) => `- ${v}`).join('\n')}

**Боли и страхи:**
${data.psychographics?.fears?.map((f) => `- ${f}`).join('\n')}
  `.trim();
}

export function aiContentGapToMarkdown(data: AIContentGapData | null, myTitle?: string): string {
  if (!data) return '';
  return `
# Упущенные темы конкурентов (AI Content Gap)
${myTitle ? `**Мой канал:** ${myTitle}\n` : ''}
${data.summary ? `**Резюме:** ${data.summary}\n` : ''}

## 1. Упущенные темы конкурентов
${
  data.missingTopics?.length
    ? data.missingTopics
        .map(
          (item) =>
            `### ${item.topic} (${item.engagementPotential || 'высокий потенциал'})\n` +
            `- **Почему сработало:** ${item.whyItWorked}\n` +
            `- **Каналы:** ${(item.competitorChannels || []).join(', ')}\n` +
            `- **Угол подачи для нашего канала:** ${item.suggestedAngle}` +
            (item.quote ? `\n> «${item.quote}»` : ''),
        )
        .join('\n\n')
    : '*Упущенных тем не выявлено.*'
}

## 2. Сравнение общих тем
| Тема | Мой канал | Конкуренты | Как усилить |
|---|---|---|---|
${(data.coveredTopicsComparison || []).map((row) => `| **${row.topic}** | ${row.myPerformance} | ${row.competitorPerformance} | ${row.improvementTip} |`).join('\n')}

## 3. Быстрые победы (Quick Wins)
${(data.quickWins || []).map((win, idx) => `### ${idx + 1}. ${win.headline} (${win.format})\n${win.hook}`).join('\n\n')}
  `.trim();
}

export function aiMetricsExplainerToMarkdown(
  data: AIMetricsExplainerData | null,
  channelTitle?: string
): string {
  if (!data) return '';
  const verdict = data.overallVerdict;
  const behavior = data.audienceBehaviorSummary;
  const metrics = data.metricsBreakdown || [];
  const priorities = data.topPriorities || [];

  return `
# Разбор показателей канала простыми словами${channelTitle ? ` — ${channelTitle}` : ''}

${verdict?.healthBadge ? `**Статус:** ${verdict.healthBadge}\n` : ''}${verdict?.headline ? `## ${verdict.headline}\n` : ''}${verdict?.plainExplanation ? `${verdict.plainExplanation}\n` : ''}

## 1. Поведение подписчиков
**Что подписчики реально делают:**
${(behavior?.whatTheyDo || []).map((item) => `- ${item}`).join('\n') || '- Нет данных'}

**Чего подписчики НЕ делают:**
${(behavior?.whatTheyAvoid || []).map((item) => `- ${item}`).join('\n') || '- Нет данных'}

## 2. Показатели канала простыми словами
${metrics
  .map(
    (m) =>
      `### ${m.metricName}: ${m.metricValue} (${m.statusLabel || m.status})\n` +
      `- **Что это значит:** ${m.whatItMeans}\n` +
      `- **Что делают люди:** ${m.whatUsersDo}\n` +
      `- **Чего НЕ делают:** ${m.whatUsersDontDo}\n` +
      `- **Совет SMM-щика:** ${m.smmAdvice}`
  )
  .join('\n\n')}

## 3. Что подкрутить в первую очередь
${priorities
  .map(
    (p, idx) =>
      `### Шаг ${idx + 1}. ${p.step}\n` +
      `- **Зачем:** ${p.why}\n` +
      `- **Какая цифра вырастет:** ${p.expectedChange}`
  )
  .join('\n\n')}
  `.trim();
}
