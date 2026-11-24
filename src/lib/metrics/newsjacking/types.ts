import type { NewsjackingWindowHours } from '@/lib/types';

export interface NewsjackingSourceMention {
  targetUsername?: string | null;
  targetTgId?: bigint | string | null;
  targetMessageId?: bigint | string | null;
  type?: string | null;
}

export interface NewsjackingSourcePost {
  id: number;
  messageId?: bigint | string | number | null;
  channelId: number;
  channelTitle: string;
  channelUsername?: string | null;
  channelTgId?: bigint | string | null;
  isMine?: boolean;
  publishedAt: Date | string;
  text: string | null;
  isAd?: boolean;
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  mentions?: readonly NewsjackingSourceMention[];
}

export interface DetectNewsTopicClustersOptions {
  windowHours?: NewsjackingWindowHours;
  now?: Date;
  minChannels?: number;
  minTextLength?: number;
  similarityThreshold?: number;
  maxClusters?: number;
}

export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

export const RAW_STOP_WORDS = new Set([
  // Russian function words & Telegram news boilerplate
  'на', 'по', 'за', 'от', 'до', 'из', 'не', 'ни', 'но', 'да', 'ли', 'бы', 'же',
  'то', 'во', 'со', 'об', 'ко', 'мы', 'вы', 'он', 'она', 'оно', 'они', 'ты', 'их', 'его', 'ее',
  'для', 'при', 'про', 'без', 'под', 'над', 'как', 'что', 'это', 'все', 'вся', 'всех', 'всем',
  'уже', 'или', 'если', 'еще', 'тут', 'там', 'где', 'куда', 'откуда', 'почему', 'зачем',
  'так', 'вот', 'тоже', 'также', 'только', 'даже', 'очень', 'более', 'менее', 'после', 'перед',
  'между', 'через', 'чтобы', 'когда', 'пока', 'хотя', 'будет', 'будут', 'были', 'была', 'было', 'быть',
  'есть', 'нет', 'может', 'могут', 'могла', 'могли', 'этого', 'этом', 'этой', 'этих', 'этот', 'эта',
  'который', 'которая', 'которое', 'которые', 'которых', 'свой', 'своя', 'свое', 'свои', 'своих',
  'наш', 'наша', 'наше', 'наши', 'ваш', 'ваша', 'ваше', 'ваши',
  'стал', 'стала', 'стали', 'стало', 'станет', 'сказал', 'сказала', 'заявил', 'заявила',
  'сообщил', 'сообщила', 'сообщает', 'сообщают', 'отметил', 'отметила', 'рассказал', 'рассказала',
  'пишет', 'пишут', 'передает', 'читать', 'читайте', 'подробнее', 'источник', 'подписаться', 'подпишись',
  'подписывайтесь', 'канал', 'канале', 'канала', 'каналу', 'пост', 'поста', 'посты', 'публикация',
  'новость', 'новости', 'новостей', 'сегодня', 'вчера', 'завтра', 'сейчас', 'теперь',
  'новый', 'новая', 'новое', 'новые', 'новых', 'первый', 'второй', 'один', 'одна', 'одно',
  'доброе', 'утро', 'добрый', 'вечер', 'ночи', 'спокойной', 'привет', 'итоги', 'дайджест', 'главное',
  'своими', 'своим', 'того', 'тем', 'того', 'всего', 'однако', 'просто', 'нужно', 'надо', 'можно',
  // English function words
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'are', 'was', 'were',
  'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'about', 'into', 'over', 'under',
  'after', 'before', 'more', 'most', 'very', 'just', 'only', 'also', 'new', 'news', 'read',
  'channel', 'post', 'today', 'yesterday', 'tomorrow', 'now', 'here', 'there', 'when', 'where',
  'who', 'what', 'which', 'why', 'how', 'all', 'our', 'your', 'their', 'his', 'her', 'its',
]);

export const RUSSIAN_SUFFIXES = [
  'иями', 'ями', 'ами', 'иях', 'ях', 'ах',
  'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
  'ией', 'ею', 'ою', 'ию', 'ия', 'ья',
  'ов', 'ев', 'ей', 'ой', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ие', 'ые', 'ую', 'юю',
  'ть', 'ти', 'ся', 'сь', 'ил', 'ила', 'или', 'ило', 'ал', 'ала', 'али', 'ало',
  'у', 'ю', 'а', 'я', 'е', 'и', 'ы', 'о', 'ь',
];

export interface ExtractedFeatures {
  tokens: Set<string>;
  entities: Set<string>;
  bigrams: Set<string>;
  weights: Map<string, number>;
  surfaceByFeature: Map<string, string>;
  directRefs: Set<string>;
  normalizedLength: number;
}

export interface PreparedPost {
  post: NewsjackingSourcePost;
  ts: number;
  messageId: string;
  channelUsername: string | null;
  channelTgId: string | null;
  err: number | null;
  excerpt: string;
  features: ExtractedFeatures;
}

export interface WorkingCluster {
  items: PreparedPost[];
  channelIds: Set<number>;
  featureDocFreq: Map<string, number>;
  coreWeights: Map<string, number>;
  coreNorm: number;
  postKeys: Set<string>;
}
