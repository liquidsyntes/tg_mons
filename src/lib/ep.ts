export interface ChannelSnapshot {
  channelId: string;
  niche: string;
  subscribers: number;
  newSubs24h: number;
  newSubs7d: number;
  newSubs30d: number;
  postViews: number[];
  postReactions: number[];
  postComments: number[];
  postForwards: number[];
}

export interface NicheStats {
  meanCEI: number;
  stdCEI: number;
  meanVR: number;
  stdVR: number;
  meanERR: number;
  stdERR: number;
  maxSubscribers: number;
}

export interface EPResult {
  channelId: string;
  EP: number;
  breakdown: {
    CEI: number;
    VR: number;
    ERR: number;
    Z_growth: number;
    Z_vr: number;
    Z_err: number;
  };
}

const CONFIG = {
  w_growth: 0.45,
  w_vr: 0.30,
  w_err: 0.25,
  w_24h: 0.2,
  w_7d: 0.3,
  w_30d: 0.5,
};

// Helpers
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function std(arr: number[], m?: number): number {
  if (arr.length <= 1) return 0;
  const avg = m ?? mean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function getZScore(val: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (val - mean) / stdDev;
}

function sigmoid(x: number): number {
  return 100 / (1 + Math.exp(-x));
}

/**
 * Вычисляет сырые метрики канала (CEI, VR, ERR) и коэффициент уверенности (confidence).
 * 
 * @description
 * - **Growth Rate (gr24h, gr7d, gr30d)**: Приведенный к дневному процент роста подписчиков.
 * - **CEI (Channel Expansion Index)**: Индекс роста, взвешенная сумма дневных темпов роста. Формула: w_24h * gr24h + w_7d * gr7d + w_30d * gr30d. Веса: 0.2 (24h), 0.3 (7d), 0.5 (30d). Диапазон: (-∞, +∞).
 * - **VR (View Rate)**: Отношение медианы просмотров к числу подписчиков (в процентах). Диапазон: [0, +∞).
 * - **ERR (Engagement Rate by Reach)**: Отношение средней суммы реакций, комментариев и репостов к среднему числу просмотров. Диапазон: [0, +∞).
 * - **Confidence (Сглаживание)**: Логарифмический коэффициент от 0.5 до 1.0, пенализирующий каналы с малым числом подписчиков относительно лидера ниши. Формула: 0.5 + 0.5 * (log(subs+1) / log(maxSubs+1)).
 * 
 * Входные данные: снапшот канала и максимум подписчиков в его нише.
 */
// Internal pure calculation of CEI, VR, ERR
function calculateRawMetrics(channel: ChannelSnapshot, maxSubscribersInNiche: number) {
  // 1. Growth Rate
  const subs = channel.subscribers > 0 ? channel.subscribers : 1; // Prevent div by zero
  const gr24h = (channel.newSubs24h / subs) * 100;
  const gr7d = ((channel.newSubs7d / subs) * 100) / 7;
  const gr30d = ((channel.newSubs30d / subs) * 100) / 30;

  // 2. CEI
  const score = CONFIG.w_24h * gr24h + CONFIG.w_7d * gr7d + CONFIG.w_30d * gr30d;
  const maxSubsLog = Math.log(maxSubscribersInNiche + 1);
  const confidence = maxSubsLog > 0 ? 0.5 + 0.5 * (Math.log(channel.subscribers + 1) / maxSubsLog) : 0.5;
  const CEI = score;

  // 3. VR
  const medianViews = median(channel.postViews);
  const VR = (medianViews / subs) * 100;

  // 4. ERR
  const totalEngagement = channel.postReactions.map((r, i) => r + channel.postComments[i] + channel.postForwards[i]);
  const avgEngagement = mean(totalEngagement);
  const avgViews = mean(channel.postViews);
  const ERR = avgViews > 0 ? (avgEngagement / avgViews) * 100 : 0;

  return { CEI, VR, ERR, confidence };
}

export function computeNicheStats(channels: ChannelSnapshot[]): Map<string, NicheStats> {
  const map = new Map<string, NicheStats>();
  
  // Group by niche
  const byNiche = new Map<string, ChannelSnapshot[]>();
  for (const ch of channels) {
    const arr = byNiche.get(ch.niche) || [];
    arr.push(ch);
    byNiche.set(ch.niche, arr);
  }

  for (const [niche, nicheChannels] of byNiche.entries()) {
    const maxSubs = Math.max(1, ...nicheChannels.map(c => c.subscribers));
    
    const ceis: number[] = [];
    const vrs: number[] = [];
    const errs: number[] = [];

    for (const ch of nicheChannels) {
      const raw = calculateRawMetrics(ch, maxSubs);
      ceis.push(raw.CEI);
      vrs.push(raw.VR);
      errs.push(raw.ERR);
    }

    const meanCEI = mean(ceis);
    const meanVR = mean(vrs);
    const meanERR = mean(errs);

    map.set(niche, {
      maxSubscribers: maxSubs,
      meanCEI,
      stdCEI: std(ceis, meanCEI),
      meanVR,
      stdVR: std(vrs, meanVR),
      meanERR,
      stdERR: std(errs, meanERR),
    });
  }

  return map;
}

/**
 * Вычисляет итоговый Effective Point (EP) канала.
 * 
 * @description
 * EP — это нормализованный Z-score рейтинг канала относительно его ниши.
 * Формула:
 * 1. Считаются Z-score для CEI, VR, ERR: (X - Mean) / StdDev.
 * 2. Composite Score = w_growth * Z_growth + w_vr * Z_vr + w_err * Z_err.
 *    (Текущие веса: Рост=0.45, VR=0.30, ERR=0.25. Обоснование приоритета роста над вовлеченностью не задокументировано авторами, требует уточнения).
 * 3. Применяется Sigmoid (100 / (1 + e^-x)), чтобы перевести Z-score из (-∞, +∞) в [0, 100].
 * 4. Умножается на Confidence (0.5..1.0) для пенализации мелких каналов.
 * 
 * Диапазон значений EP: [0, 100].
 */
export function calculateEP(channel: ChannelSnapshot, nicheStats: NicheStats): EPResult {
  const raw = calculateRawMetrics(channel, nicheStats.maxSubscribers);

  // 5. Z-normalization
  const Z_growth = getZScore(raw.CEI, nicheStats.meanCEI, nicheStats.stdCEI);
  const Z_vr = getZScore(raw.VR, nicheStats.meanVR, nicheStats.stdVR);
  const Z_err = getZScore(raw.ERR, nicheStats.meanERR, nicheStats.stdERR);

  // 6. Composite Score
  const compositeScore = CONFIG.w_growth * Z_growth + CONFIG.w_vr * Z_vr + CONFIG.w_err * Z_err;

  // 7. Final EP
  const sigmoidScore = sigmoid(compositeScore);
  const EP = Math.max(0, Math.min(100, sigmoidScore * raw.confidence));

  return {
    channelId: channel.channelId,
    EP: Math.round(EP * 10) / 10, // Round to 1 decimal place
    breakdown: {
      CEI: raw.CEI,
      VR: raw.VR,
      ERR: raw.ERR,
      Z_growth,
      Z_vr,
      Z_err,
    },
  };
}

