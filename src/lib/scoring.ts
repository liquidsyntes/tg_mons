import { detectAd } from './adDetector';

export interface ScoreBreakdown {
  errScore: { score: number; max: number; label: string };
  consistencyScore: { score: number; max: number; label: string };
  growthScore: { score: number; max: number; label: string };
  engagementScore: { score: number; max: number; label: string };
  originalityScore: { score: number; max: number; label: string };
  total: number;
  grade: string;
  recommendation: string;
}

/**
 * Вычисляет Content Score (Оценка качества контента) и формирует буквенную оценку (Grade) с рекомендацией.
 * 
 * @description
 * Метрика представляет собой взвешенную сумму от 0 до 100 баллов, состоящую из:
 * - ERR Score (0-30): на основе True ERR (>=10: 30, >=5: 20, >=2: 10, иначе 5).
 * - Consistency Score (0-20): частота постингов (1-3 в день: 20, <1: 15, >3: 15, иначе 5).
 * - Growth Score (0-20): рост аудитории (>=2%: 20, >0%: 10, иначе 0).
 * - Engagement Diversity (0-15): хардкод 10 (заглушка, нет данных по реакциям).
 * - Originality Score (0-15): доля рекламных постов (<=10%: 15, <=30%: 10, >30%: 5).
 * 
 * Диапазон значений: [0, 100].
 * Grade: A+ (>=90), A (>=80), B (>=70), C (>=60), D (<60).
 * Входные данные: True ERR, посты/день, % роста, список текстов недавних постов.
 */
export function calculateContentScore(
  trueErr: number | null,
  postsPerDay: number,
  growthPercent: number | null,
  posts: { text: string | null }[]
): ScoreBreakdown {
  // ERR (0-30)
  let errScore = 5;
  const e = trueErr || 0;
  if (e >= 10) errScore = 30;
  else if (e >= 5) errScore = 20;
  else if (e >= 2) errScore = 10;

  // Consistency (0-20) - target 1-3 posts per day
  let consistencyScore = 5;
  if (postsPerDay >= 1 && postsPerDay <= 3) consistencyScore = 20;
  else if (postsPerDay >= 0.5 && postsPerDay < 1) consistencyScore = 15;
  else if (postsPerDay > 3) consistencyScore = 15;

  // Growth (0-20)
  let growthScore = 0;
  const g = growthPercent || 0;
  if (g >= 2) growthScore = 20;
  else if (g > 0) growthScore = 10;

  // Engagement Diversity (0-15) - mock since no DB data for reactions
  let engagementScore = 10; // Default average

  // Content Originality (0-15)
  let originalityScore = 15;
  if (posts.length > 0) {
    const ads = posts.filter(p => detectAd(p.text).isAd).length;
    const adRatio = ads / posts.length;
    if (adRatio > 0.3) originalityScore = 5;
    else if (adRatio > 0.1) originalityScore = 10;
  } else {
    originalityScore = 10;
  }

  const total = errScore + consistencyScore + growthScore + engagementScore + originalityScore;
  let grade = 'D';
  if (total >= 90) grade = 'A+';
  else if (total >= 80) grade = 'A';
  else if (total >= 70) grade = 'B';
  else if (total >= 60) grade = 'C';

  // Recommendation logic
  const scores = [
    { key: 'ERR', val: errScore, max: 30, text: 'поработайте над вовлеченностью аудитории (опросы, обсуждения)' },
    { key: 'Consistency', val: consistencyScore, max: 20, text: postsPerDay < 1 ? 'увеличьте частоту постинга (цель: 1-3 в день)' : 'уменьшите спам постов (цель: 1-3 в день)' },
    { key: 'Growth', val: growthScore, max: 20, text: 'увеличьте закупку рекламы или взаимопиар для роста' },
    { key: 'Content Originality', val: originalityScore, max: 15, text: 'снизьте процент рекламных постов' }
  ];

  // find lowest percentage score
  let lowest = scores[0];
  let lowestPct = scores[0].val / scores[0].max;
  for (let i = 1; i < scores.length; i++) {
    const pct = scores[i].val / scores[i].max;
    if (pct < lowestPct) {
      lowest = scores[i];
      lowestPct = pct;
    }
  }

  let recommendation = `Ниже всего ${lowest.key} (${lowest.val}/${lowest.max}) — ${lowest.text}`;
  if (total >= 90) {
    recommendation = 'Отличные показатели! Продолжайте в том же духе.';
  }

  return {
    errScore: { score: errScore, max: 30, label: 'ERR' },
    consistencyScore: { score: consistencyScore, max: 20, label: 'Consistency' },
    growthScore: { score: growthScore, max: 20, label: 'Growth' },
    engagementScore: { score: engagementScore, max: 15, label: 'Engagement Div.' },
    originalityScore: { score: originalityScore, max: 15, label: 'Originality' },
    total,
    grade,
    recommendation
  };
}

