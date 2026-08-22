/**
 * Detects if a Telegram post is likely an advertisement.
 * Returns detection result with matched signals.
 */

const AD_KEYWORDS = [
  'реклама', 'рекламн', 'партнёр', 'партнер', 'спонсор',
  'промо', 'promo', '#ad', '#реклама', '#промо',
  'совместный проект', 'по вопросам рекламы', 'рекламная интеграция',
  'рекламодатель', 'erid', 'оплаченная', 'на правах рекламы',
];

const FORWARD_PATTERNS = [
  /(?:подписывайтесь|подпишись|подписаться|переходи|переходите|заходи|заходите)\s+(?:на|в|к)\s+/i,
  /(?:рекомендую|рекомендуем|советую|советуем)\s+(?:канал|группу|чат)/i,
  /(?:друзья|друг|коллеги).{0,30}(?:канал|группу|проект)/i,
];

const TG_LINK_REGEX = /(?:https?:\/\/)?t\.me\/(?:\+|joinchat\/)?[\w\-]+/gi;
const UTM_REGEX = /[?&]utm_/i;
const EXTERNAL_LINK_REGEX = /https?:\/\/(?!t\.me)[^\s]+/gi;

export interface AdDetectionResult {
  isAd: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  signals: string[];
}

export function detectAd(text: string | null): AdDetectionResult {
  if (!text || text.trim().length === 0) {
    return { isAd: false, confidence: 'none', signals: [] };
  }

  const lowerText = text.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  // 1. Check for Telegram links to other channels
  const tgLinks = text.match(TG_LINK_REGEX) || [];
  if (tgLinks.length > 0) {
    signals.push(`Ссылки на TG: ${tgLinks.length}`);
    score += tgLinks.length >= 2 ? 3 : 2;
  }

  // 2. Check for ad keywords
  const matchedKeywords: string[] = [];
  for (const kw of AD_KEYWORDS) {
    if (lowerText.includes(kw)) {
      matchedKeywords.push(kw);
    }
  }
  if (matchedKeywords.length > 0) {
    signals.push(`Ключевые слова: ${matchedKeywords.join(', ')}`);
    score += matchedKeywords.length >= 2 ? 3 : 2;
  }

  // 3. Check for UTM parameters
  if (UTM_REGEX.test(text)) {
    signals.push('UTM-метки');
    score += 2;
  }

  // 4. Check for forward/recommendation patterns
  for (const pattern of FORWARD_PATTERNS) {
    if (pattern.test(text)) {
      signals.push('Призыв подписаться');
      score += 1;
      break;
    }
  }

  // 5. Check for external links (non-TG)
  const externalLinks = text.match(EXTERNAL_LINK_REGEX) || [];
  if (externalLinks.length > 0) {
    signals.push(`Внешние ссылки: ${externalLinks.length}`);
    score += 1;
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
  if (score >= 4) confidence = 'high';
  else if (score >= 2) confidence = 'medium';
  else if (score >= 1) confidence = 'low';

  return {
    isAd: score >= 2,
    confidence,
    signals,
  };
}
