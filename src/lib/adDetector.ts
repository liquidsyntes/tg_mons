/**
 * Detects if a Telegram post is an advertisement or contains partner mentions.
 * Returns detection result with type, confidence, and matched signals.
 */

const AD_KEYWORDS = [
  'реклама', 'рекламн', 'спонсор',
  'промо', 'promo', '#ad', '#реклама', '#промо',
  'совместный проект', 'по вопросам рекламы', 'рекламная интеграция',
  'рекламодатель', 'erid', 'оплаченная', 'на правах рекламы',
];

const PARTNER_KEYWORDS = [
  'партнёр', 'партнер', 'коллаборация', 'коллаб',
  'совместн', 'при поддержке', 'вместе с',
];

const FORWARD_PATTERNS = [
  /(?:подписывайтесь|подпишись|подписаться|переходи|переходите|заходи|заходите)\s+(?:на|в|к)\s+/i,
  /(?:рекомендую|рекомендуем|советую|советуем)\s+(?:канал|группу|чат)/i,
  /(?:друзья|друг|коллеги).{0,30}(?:канал|группу|проект)/i,
];

const TG_LINK_REGEX = /(?:https?:\/\/)?t\.me\/(?:\+|joinchat\/)?[\w\-]+/gi;
const UTM_REGEX = /[?&]utm_/i;
const EXTERNAL_LINK_REGEX = /https?:\/\/(?!t\.me)[^\s]+/gi;

export type PostLabel = 'ad' | 'partner' | 'none';

export interface AdDetectionResult {
  label: PostLabel;
  isAd: boolean;
  isPartner: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  signals: string[];
}

export function detectAd(text: string | null): AdDetectionResult {
  if (!text || text.trim().length === 0) {
    return { label: 'none', isAd: false, isPartner: false, confidence: 'none', signals: [] };
  }

  const lowerText = text.toLowerCase();
  const signals: string[] = [];
  let adScore = 0;
  let hasTgLinks = false;
  let hasPartnerKeywords = false;

  // 1. Check for Telegram links to other channels
  const tgLinks = text.match(TG_LINK_REGEX) || [];
  if (tgLinks.length > 0) {
    signals.push(`Ссылки на TG: ${tgLinks.length}`);
    adScore += tgLinks.length >= 2 ? 3 : 2;
    hasTgLinks = true;
  }

  // 2. Check for ad keywords
  const matchedAdKeywords: string[] = [];
  for (const kw of AD_KEYWORDS) {
    if (lowerText.includes(kw)) {
      matchedAdKeywords.push(kw);
    }
  }
  if (matchedAdKeywords.length > 0) {
    signals.push(`Ключевые слова: ${matchedAdKeywords.join(', ')}`);
    adScore += matchedAdKeywords.length >= 2 ? 3 : 2;
  }

  // 3. Check for partner keywords
  const matchedPartnerKeywords: string[] = [];
  for (const kw of PARTNER_KEYWORDS) {
    if (lowerText.includes(kw)) {
      matchedPartnerKeywords.push(kw);
    }
  }
  if (matchedPartnerKeywords.length > 0) {
    signals.push(`Партнёрство: ${matchedPartnerKeywords.join(', ')}`);
    hasPartnerKeywords = true;
  }

  // 4. Check for UTM parameters
  if (UTM_REGEX.test(text)) {
    signals.push('UTM-метки');
    adScore += 2;
  }

  // 5. Check for forward/recommendation patterns
  for (const pattern of FORWARD_PATTERNS) {
    if (pattern.test(text)) {
      signals.push('Призыв подписаться');
      adScore += 1;
      break;
    }
  }

  // 6. Check for external links (non-TG)
  const externalLinks = text.match(EXTERNAL_LINK_REGEX) || [];
  if (externalLinks.length > 0) {
    signals.push(`Внешние ссылки: ${externalLinks.length}`);
    adScore += 1;
  }

  // Determine label
  const isAd = adScore >= 2 && (matchedAdKeywords.length > 0 || adScore >= 4);
  const isPartner = !isAd && (hasTgLinks || hasPartnerKeywords);

  let label: PostLabel = 'none';
  if (isAd) label = 'ad';
  else if (isPartner) label = 'partner';

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
  if (isAd) {
    confidence = adScore >= 4 ? 'high' : 'medium';
  } else if (isPartner) {
    const partnerScore = (hasTgLinks ? 1 : 0) + (hasPartnerKeywords ? 1 : 0);
    confidence = partnerScore >= 2 ? 'high' : 'medium';
  }

  return {
    label,
    isAd,
    isPartner,
    confidence,
    signals,
  };
}
